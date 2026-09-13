import dotenv from 'dotenv';
// Test runs explicitly disable dotenv; never load developer credentials in fixtures.
if (process.env.NODE_ENV !== 'test') dotenv.config({ quiet: true });
export const isProduction = () => Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
export function secureConfiguration() {
  if (!isProduction()) return true;
  const owner = process.env.MASTER_ADMIN_CODE || 'DeportePicks';
  const session = process.env.SESSION_SECRET || 'deportepicks-vip-ultra-secure-key-32chars';
  const validOwner = owner.trim().length >= 6 && owner.length <= 128;
  const validSession = session.length >= 16;
  const validRedis = !process.env.UPSTASH_REDIS_REST_URL ||
    (/^https:\/\//.test(process.env.UPSTASH_REDIS_REST_URL || '') && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN));
  return validOwner && validSession && validRedis;
}
export function positiveInteger(name, fallback, maximum = 1000000) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error('Configuración numérica inválida.');
  return value;
}
export const CONFIG = {
  PORT: process.env.PORT || 5000,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  DEFAULT_MODEL: process.env.OPENROUTER_MODEL || 'liquid/lfm-2.5-2.6b:free',
  MASTER_ADMIN_CODE: process.env.MASTER_ADMIN_CODE || 'DeportePicks',
  APP_NAME: 'DeportePicks AI VIP'
};
