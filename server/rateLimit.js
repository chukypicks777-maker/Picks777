import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { positiveInteger } from './config.js';
import { redisConfigured, redisCommand } from './services/dataCache.js';

// All buckets are checked and consumed together, in one Redis transaction.
export const LIMIT_SCRIPT = `
local retry=0
for i,key in ipairs(KEYS) do
  local count=tonumber(redis.call('GET',key) or '0')
  if count>=tonumber(ARGV[(i-1)*2+1]) then
    local ttl=redis.call('PTTL',key)
    if ttl<0 then return redis.error_reply('invalid limiter ttl') end
    retry=math.max(retry,math.max(1,ttl))
  end
end
if retry>0 then return {0,retry} end
for i,key in ipairs(KEYS) do
  local count=redis.call('INCR',key)
  if count==1 then redis.call('PEXPIRE',key,ARGV[(i-1)*2+2]) end
end
return {1,0}`;
const memory = new Map();
const localSecret = randomBytes(32).toString('hex');
const digest = value => createHmac('sha256', process.env.SESSION_SECRET || localSecret).update(value).digest('hex');

export function clientIdentity(req) {
  const raw = process.env.VERCEL
    ? (req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1')
    : (req.socket?.remoteAddress || '127.0.0.1');
  const first = String(raw || '').split(',')[0].trim();
  const address = isIP(first) ? first : '127.0.0.1';
  let normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:') && isIP(normalized.slice(7)) === 4) normalized = normalized.slice(7);
  else if (isIP(normalized) === 6) {
    try { normalized = new URL(`http://[${normalized}]/`).hostname; } catch {}
  }
  return digest(`ip:${normalized}`);
}

export async function consumeLimits(buckets, now = Date.now()) {
  if (redisConfigured()) {
    const result = await redisCommand('EVAL', LIMIT_SCRIPT, buckets.length,
      ...buckets.map(b => `picks:v2:limit:${b.key}`), ...buckets.flatMap(b => [b.limit, b.windowMs]));
    if (!Array.isArray(result) || result.length !== 2 || ![0, 1].includes(result[0]) || !Number.isFinite(result[1]) || result[1] < 0) throw new Error('Limitador no disponible.');
    return { allowed: result[0] === 1, retryAfter: Math.max(1, Math.ceil(result[1] / 1000)) };
  }
  for (const [key, item] of memory) if (item.expires <= now) memory.delete(key);
  const retry = Math.max(0, ...buckets.map(b => {
    const item = memory.get(b.key);
    return item && item.count >= b.limit ? item.expires - now : 0;
  }));
  if (retry) return { allowed: false, retryAfter: Math.ceil(retry / 1000) };
  if (memory.size + buckets.filter(b => !memory.has(b.key)).length > 10000) throw new Error('Limitador ocupado.');
  for (const b of buckets) {
    const item = memory.get(b.key) || { count: 0, expires: now + b.windowMs };
    item.count++; memory.set(b.key, item);
  }
  return { allowed: true, retryAfter: 1 };
}

export function rateLimit(kind) {
  return async (req, res, next) => {
    try {
      let buckets;
      if (kind === 'auth') {
        const windowMs = positiveInteger('AUTH_WINDOW_SECONDS', 900, 86400) * 1000;
        buckets = [
          { key: `auth:${clientIdentity(req)}`, limit: positiveInteger('AUTH_MAX_ATTEMPTS', 20), windowMs },
          { key: 'auth:global', limit: positiveInteger('AUTH_GLOBAL_MAX_ATTEMPTS', 300), windowMs }
        ];
      } else {
        if (!req.session) return res.status(401).json({ success: false, message: 'Sesión requerida.' });
        // VIP quota is per code, or per Google user for trial users
        const subject = req.session.role === 'owner'
          ? 'owner'
          : (req.session.code ? `vip:${req.session.code}` : `user:${req.session.userId || clientIdentity(req)}`);
        buckets = [
          { key: `ai:${digest(subject)}`, limit: positiveInteger('AI_MAX_ANALYSES', 20), windowMs: positiveInteger('AI_WINDOW_SECONDS', 3600, 86400) * 1000 },
          { key: 'ai:global', limit: positiveInteger('AI_GLOBAL_MAX_ANALYSES', 200), windowMs: positiveInteger('AI_GLOBAL_WINDOW_SECONDS', 86400, 604800) * 1000 }
        ];
      }
      const result = await consumeLimits(buckets);
      if (!result.allowed) return res.set('Retry-After', String(result.retryAfter)).status(429).json({ success: false, message: 'Límite alcanzado. Reintenta después de la ventana indicada.', retryAfter: result.retryAfter });
      next();
    } catch {
      // Fail closed: never spend provider tokens when the limiter cannot be checked.
      res.set('Retry-After', '30').status(503).json({ success: false, message: 'Limitador no disponible temporalmente.' });
    }
  };
}
