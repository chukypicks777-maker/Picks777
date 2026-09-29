import { createHash, randomBytes } from 'node:crypto';
import { redisCommand, redisConfigured } from './services/dataCache.js';
import { isProduction } from './config.js';

const TTL = 300000;
const valid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const verifierChallenge = verifier => createHash('sha256').update(verifier).digest('hex');
// Redis performs validation and consume atomically across serverless instances.
const CHANGE = `local raw=redis.call('GET',KEYS[1]); if not raw then return nil end
local item=cjson.decode(raw)
if ARGV[1]=='complete' then
 if item.credential then return nil end
 item.credential=ARGV[2]; redis.call('SET',KEYS[1],cjson.encode(item),'KEEPTTL'); return 'ok'
end
if item.challenge~=ARGV[2] then return nil end
if not item.credential then return 'pending' end
redis.call('DEL',KEYS[1]); return item.credential`;

export class MobileAuthExchange {
  constructor(now = () => Date.now()) { this.memory = new Map(); this.now = now; }
  async start(challenge) {
    if (!valid(challenge)) throw new Error('Desafío de acceso inválido.');
    const id = randomBytes(32).toString('hex');
    const item = { challenge, expires: this.now() + TTL };
    if (redisConfigured()) await redisCommand('SET', 'picks:mobile-auth:' + id, JSON.stringify(item), 'PX', TTL, 'NX');
    else {
      if (isProduction()) throw new Error('Se requiere almacenamiento seguro.');
      for (const [key, value] of this.memory) if (value.expires <= this.now()) this.memory.delete(key);
      if (this.memory.size >= 1000) throw new Error('Servicio ocupado.');
      this.memory.set(id, item);
    }
    return { id, expiresAt: item.expires };
  }
  async change(id, action, value) {
    if (!valid(id)) return null;
    if (redisConfigured()) return redisCommand('EVAL', CHANGE, 1, 'picks:mobile-auth:' + id, action, value);
    if (isProduction()) throw new Error('Se requiere almacenamiento seguro.');
    const item = this.memory.get(id);
    if (!item || item.expires <= this.now()) { this.memory.delete(id); return null; }
    if (action === 'complete') {
      if (item.credential) return null;
      item.credential = value; return 'ok';
    }
    if (item.challenge !== value) return null;
    if (!item.credential) return 'pending';
    this.memory.delete(id);
    return item.credential;
  }
  complete(id, verifiedCredential) { return this.change(id, 'complete', verifiedCredential); }
  consume(id, verifier) {
    if (!valid(verifier)) return Promise.resolve(null);
    return this.change(id, 'consume', verifierChallenge(verifier));
  }
}
export const mobileAuth = new MobileAuthExchange();
