import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const compress = promisify(gzip), decompress = promisify(gunzip);
const PREFIX = 'picks:gzip:1:';
export const MAX_CACHE_BYTES = 16 * 1024 * 1024;

// Compression changes transport only: data, source dates and expiry stay exact.
export async function encodeCache(envelope) {
  const raw = JSON.stringify(envelope);
  const bytes = Buffer.byteLength(raw);
  if (bytes > MAX_CACHE_BYTES) return { stored: null, bytes };
  if (bytes < 4096) return { stored: raw, bytes };
  const packed = PREFIX + (await compress(raw, { level: 3 })).toString('base64');
  return { stored: packed.length < bytes ? packed : raw, bytes };
}

export async function decodeCache(stored) {
  if (typeof stored !== 'string' || Buffer.byteLength(stored) > MAX_CACHE_BYTES) throw new Error('Caché no válida.');
  const raw = stored.startsWith(PREFIX)
    ? (await decompress(Buffer.from(stored.slice(PREFIX.length), 'base64'), { maxOutputLength: MAX_CACHE_BYTES })).toString('utf8')
    : stored;
  const envelope = JSON.parse(raw);
  if (!envelope || !Number.isFinite(envelope.expires) || !Object.hasOwn(envelope, 'value')) throw new Error('Caché no válida.');
  return { envelope, bytes: Buffer.byteLength(raw) };
}
