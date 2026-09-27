import dotenv from 'dotenv';
// Test runs explicitly disable dotenv; never load developer credentials in fixtures.
if (process.env.NODE_ENV !== 'test') dotenv.config({ quiet: true });
export const isProduction = () => Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
export function secureConfiguration() {
  if (!isProduction()) return true;
  const owner = process.env.MASTER_ADMIN_CODE || '';
  const session = process.env.SESSION_SECRET || '';
  const validOwner = owner !== 'DeportePicks' && owner.trim().length >= 16 && owner.length <= 128;
  const validSession = session.length >= 32 && session !== 'deportepicks-vip-ultra-secure-key-32chars';
  const validRedis = !process.env.UPSTASH_REDIS_REST_URL ||
    (/^https:\/\//.test(process.env.UPSTASH_REDIS_REST_URL || '') && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN));
  const durableStorage = !process.env.VERCEL || Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  return validOwner && validSession && validRedis && durableStorage;
}
export function positiveInteger(name, fallback, maximum = 1000000) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error('Configuración numérica inválida.');
  return value;
}
export const CONFIG = {
  PORT: process.env.PORT || 5000,
  CUSTOM_AI_API_KEY: process.env.CUSTOM_AI_API_KEY || process.env.VYCEAI_API_KEY || process.env.AI_API_KEY || process.env.THIRD_PARTY_API_KEY || process.env.THIRD_PARTY_AI_KEY || '',
  CUSTOM_AI_BASE_URL: process.env.CUSTOM_AI_BASE_URL || process.env.VYCEAI_BASE_URL || process.env.AI_BASE_URL || 'https://vyceai.com/v1',
  DEFAULT_MODEL: process.env.DEFAULT_AI_MODEL || process.env.AI_MODEL || 'deepseek-v4.1',
  MASTER_ADMIN_CODE: process.env.MASTER_ADMIN_CODE || 'DeportePicks',
  APP_NAME: 'DeportePicks AI VIP',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '102504637276-qs6ggp38pl5t4qjvd9q4s9sadphmcsf7.apps.googleusercontent.com'
};
