import fs from 'node:fs/promises';
import path from 'node:path';
import { positiveInteger } from '../config.js';

// Shared REST Redis cache; never used as an authorization cache.
const memory = new Map();
const pending = new Map();
export const redisConfigured = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const defaultAiCacheFile = () => (process.env.VERCEL ? path.join('/tmp', 'ai-cache.json') : path.resolve('server/data/ai-cache.json'));

let aiFileCacheLoaded = false;
const aiFileCacheMap = new Map();

async function loadAiFileCache() {
  if (aiFileCacheLoaded) return;
  try {
    const file = defaultAiCacheFile();
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    const now = Date.now();
    if (parsed && typeof parsed === 'object') {
      for (const [k, env] of Object.entries(parsed)) {
        if (env && env.expires > now) {
          aiFileCacheMap.set(k, env);
        }
      }
    }
  } catch {}
  aiFileCacheLoaded = true;
}

async function saveAiFileCache(key, envelope) {
  try {
    await loadAiFileCache();
    aiFileCacheMap.set(key, envelope);
    const now = Date.now();
    for (const [k, env] of aiFileCacheMap.entries()) {
      if (env.expires <= now) aiFileCacheMap.delete(k);
    }
    if (aiFileCacheMap.size > 200) {
      const oldestKey = aiFileCacheMap.keys().next().value;
      aiFileCacheMap.delete(oldestKey);
    }
    const file = defaultAiCacheFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const obj = Object.fromEntries(aiFileCacheMap.entries());
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(obj), 'utf8');
    await fs.rename(tmp, file);
  } catch {}
}

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

export async function cachedData(key, ttlSeconds, loader, options = {}) {
  const now = Date.now();
  const forceRefresh = Boolean(options.forceRefresh);

  if (!forceRefresh) {
    const local = memory.get(key);
    if (local && local.expires > now) return structuredClone(local.value);
    if (pending.has(key)) return structuredClone(await pending.get(key));
  }

  const task = (async () => {
    if (!forceRefresh) {
      if (redisConfigured()) {
        try {
          const stored = await redisCommand('GET', `picks:v2:cache:${key}`);
          if (stored) {
            const envelope = JSON.parse(stored);
            if (envelope.expires > Date.now()) {
              memory.set(key, envelope);
              return envelope.value;
            }
          }
        } catch {}
      }

      if (key.startsWith('ai:')) {
        await loadAiFileCache();
        const diskEnvelope = aiFileCacheMap.get(key);
        if (diskEnvelope && diskEnvelope.expires > Date.now()) {
          memory.set(key, diskEnvelope);
          return diskEnvelope.value;
        }
      }
    }

    const value = await loader();
    const effectiveTtl = (value && value.aiAvailable === false) ? 60 : ttlSeconds;
    const envelope = { value, expires: Date.now() + effectiveTtl * 1000 };

    if (redisConfigured()) {
      try {
        await redisCommand('SET', `picks:v2:cache:${key}`, JSON.stringify(envelope), 'EX', effectiveTtl);
      } catch {}
    }

    if (key.startsWith('ai:')) {
      await saveAiFileCache(key, envelope);
    }

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
  if (prefix.includes('ai:') || prefix.startsWith('ai:')) {
    aiFileCacheMap.clear();
    try {
      const file = defaultAiCacheFile();
      fs.unlink(file).catch(() => {});
    } catch {}
  }
}
