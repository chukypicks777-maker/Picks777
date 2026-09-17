import { positiveInteger } from '../config.js';
// Shared REST Redis cache; never used as an authorization cache.
const memory = new Map();
const pending = new Map();
export const redisConfigured = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

export async function redisCommand(...command) {
  if (!redisConfigured()) throw new Error('Configura UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN para almacenamiento persistente.');
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(positiveInteger('REDIS_TIMEOUT_MS', 2000, 3000))
  });
  if (!response.ok) throw new Error('El almacenamiento persistente no responde.');
  const data = await response.json();
  if (data.error) throw new Error('Error del almacenamiento persistente.');
  return data.result;
}

export async function cachedData(key, ttlSeconds, loader) {
  const now = Date.now();
  const local = memory.get(key);
  if (local && local.expires > now) return structuredClone(local.value);
  if (pending.has(key)) return structuredClone(await pending.get(key));
  const task = (async () => {
    if (redisConfigured()) {
      const stored = await redisCommand('GET', `picks:v2:cache:${key}`);
      if (stored) {
        const envelope = JSON.parse(stored);
        if (envelope.expires > Date.now()) {
          memory.set(key, envelope);
          return envelope.value;
        }
      }
    }
    const value = await loader();
    const envelope = { value, expires: Date.now() + ttlSeconds * 1000 };
    if (redisConfigured()) await redisCommand('SET', `picks:v2:cache:${key}`, JSON.stringify(envelope), 'EX', ttlSeconds);
    if (memory.size >= 250) memory.delete(memory.keys().next().value);
    memory.set(key, envelope);
    return value;
  })();
  pending.set(key, task);
  try { return structuredClone(await task); }
  finally { pending.delete(key); }
}

export async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`El proveedor responde HTTP ${response.status}.`);
  return response.json();
}

export function clearCachePattern(prefix) {
  for (const key of memory.keys()) {
    if (key.startsWith(prefix) || key.includes(prefix)) memory.delete(key);
  }
}
