import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { positiveInteger, redisConfiguration } from '../config.js';
import { encodeCache, decodeCache } from './cacheCodec.js';

// Shared REST Redis cache; never used as an authorization cache.
const memory = new Map();
const pending = new Map();
const reading = new Map();
const absent = new Map();
const MAX_MEMORY_BYTES = 32 * 1024 * 1024;
let memoryBytes = 0;
function forget(key) {
  const entry = memory.get(key);
  if (entry) memoryBytes -= entry.bytes;
  memory.delete(key);
}
function remember(key, envelope, bytes) {
  forget(key);
  absent.delete(key);
  if (bytes > MAX_MEMORY_BYTES) return;
  for (const [oldKey, entry] of memory) if (entry.expires <= Date.now()) forget(oldKey);
  while (memory.size >= 250 || memoryBytes + bytes > MAX_MEMORY_BYTES) forget(memory.keys().next().value);
  memory.set(key, { ...envelope, bytes });
  memoryBytes += bytes;
}
export const redisConfigured = () => redisConfiguration().configured;

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
  const redis = redisConfiguration();
  if (!redis.configured) throw new Error('Configura Redis REST con las variables UPSTASH_REDIS_REST_* o KV_REST_API_*.');
  const response = await fetch(redis.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redis.token}`, 'Content-Type': 'application/json' },
    redirect: 'error',
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(positiveInteger('REDIS_TIMEOUT_MS', 2000, 3000))
  });
  const data = await response.json().catch(() => null);
  if (typeof data?.error === 'string' && data.error.startsWith('NOSCRIPT')) {
    const error = new Error('Script de almacenamiento pendiente de cargar.');
    error.code = 'NOSCRIPT';
    throw error;
  }
  if (!response.ok || !data) throw new Error('El almacenamiento persistente no responde.');
  if (data.error) throw new Error('Error del almacenamiento persistente.');
  return data.result;
}

// Scripts are cached by Redis across application instances. Routine reads send
// a 40-byte digest; a cache flush reloads the body once without stale access.
export async function redisEval(script, keyCount, ...args) {
  const digest = createHash('sha1').update(script).digest('hex');
  try { return await redisCommand('EVALSHA', digest, keyCount, ...args); }
  catch (error) {
    if (error.code !== 'NOSCRIPT') throw error;
    return redisCommand('EVAL', script, keyCount, ...args);
  }
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
            const { envelope, bytes } = await decodeCache(stored);
            if (envelope.expires > Date.now()) {
              remember(key, envelope, bytes);
              return envelope.value;
            }
          }
        } catch {}
      }

      if (key.startsWith('ai:')) {
        await loadAiFileCache();
        const diskEnvelope = aiFileCacheMap.get(key);
        if (diskEnvelope && diskEnvelope.expires > Date.now()) {
          remember(key, diskEnvelope, Buffer.byteLength(JSON.stringify(diskEnvelope)));
          return diskEnvelope.value;
        }
      }
    }

    const value = await loader();
    const effectiveTtl = (value && value.aiAvailable === false) ? 60 : ttlSeconds;
    const envelope = { value, expires: Date.now() + effectiveTtl * 1000 };
    const encoded = await encodeCache(envelope);

    if (redisConfigured() && encoded.stored !== null) {
      try {
        await redisCommand('SET', `picks:v2:cache:${key}`, encoded.stored, 'EX', effectiveTtl);
      } catch {}
    }

    if (key.startsWith('ai:')) {
      await saveAiFileCache(key, envelope);
    }

    remember(key, envelope, encoded.bytes);
    return value;
  })();

  pending.set(key, task);
  try { return structuredClone(await task); }
  finally { pending.delete(key); }
}

// Reading a shared report must never start a paid provider request.
export async function readCachedData(key) {
  const local = memory.get(key);
  if (local?.expires > Date.now()) return structuredClone(local.value);
  if (absent.get(key) > Date.now()) return null;
  if (reading.has(key)) return structuredClone(await reading.get(key));
  const task = (async () => {
    let confirmedMissing = !redisConfigured();
    if (redisConfigured()) {
      try {
        const stored = await redisCommand('GET', `picks:v2:cache:${key}`);
        if (stored) {
          const { envelope, bytes } = await decodeCache(stored);
          if (envelope.expires > Date.now()) { remember(key, envelope, bytes); return envelope.value; }
        }
        confirmedMissing = true;
      } catch { /* An unavailable cache does not authorize new AI work. */ }
    }
    if (key.startsWith('ai:')) {
      await loadAiFileCache();
      const entry = aiFileCacheMap.get(key);
      if (entry?.expires > Date.now()) { remember(key, entry, Buffer.byteLength(JSON.stringify(entry))); return entry.value; }
    }
    // Only successful misses, briefly. Authentication never uses this cache.
    if (confirmedMissing) {
      if (absent.size >= 500) absent.delete(absent.keys().next().value);
      absent.set(key, Date.now() + 15000);
    }
    return null;
  })();
  reading.set(key, task);
  try { return structuredClone(await task); }
  finally { reading.delete(key); }
}

export async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`El proveedor responde HTTP ${response.status}.`);
  return response.json();
}

export function clearCachePattern(prefix) {
  for (const key of memory.keys()) {
    if (key.startsWith(prefix) || key.includes(prefix)) forget(key);
  }
  for (const key of absent.keys()) if (key.startsWith(prefix) || key.includes(prefix)) absent.delete(key);
  if (prefix.includes('ai:') || prefix.startsWith('ai:')) {
    if (prefix === 'ai:' || prefix === 'ai') {
      aiFileCacheMap.clear();
      try {
        const file = defaultAiCacheFile();
        fs.unlink(file).catch(() => {});
      } catch {}
    } else {
      let changed = false;
      for (const k of aiFileCacheMap.keys()) {
        if (k.startsWith(prefix) || k.includes(prefix)) {
          aiFileCacheMap.delete(k);
          changed = true;
        }
      }
      if (changed) {
        try {
          const file = defaultAiCacheFile();
          const obj = Object.fromEntries(aiFileCacheMap.entries());
          fs.writeFile(file, JSON.stringify(obj), 'utf8').catch(() => {});
        } catch {}
      }
    }
  }
}
