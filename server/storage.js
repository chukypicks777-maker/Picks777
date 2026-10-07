import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { redisConfigured, redisCommand, redisEval } from './services/dataCache.js';
import { CONFIG, ownerGoogleEmail } from './config.js';
import { entitlement } from './entitlements.js';
import { SOCIAL_LINKS } from '../src/constants/socials.js';
import { validateSocialLinks } from './socialSettings.js';
import { ACCESS_READ_SCRIPT, selectAccess, normalizeAccessRead } from './storageReads.js';
const KEY = 'picks:v2:access';
const clean = code => String(code || '').trim().toUpperCase();
const initial = () => ({ codes: [], users: [], aiConfig: null });
// Keep only keyed fingerprints and the original access deadline after deletion.
// The private key lives in durable storage so rotating session secrets cannot reset trials.
function trialKeys(db, user) {
  db.trialHistoryKey ||= randomBytes(32).toString('hex');
  return [user.email && `email:${user.email.trim().toLowerCase()}`, user.googleId && `identity:${user.googleId}`]
    .filter(Boolean).map(value => createHmac('sha256', db.trialHistoryKey).update(value).digest('hex'));
}
function previousTrial(db, user) {
  const records = trialKeys(db, user).map(key => db.trialHistory?.[key]).filter(Boolean);
  if (!records.length) return null;
  return {
    trialExpiresAt: new Date(Math.min(...records.map(record => Date.parse(record.trialExpiresAt) || 0))).toISOString(),
    hasRedeemedVip: records.some(record => record.hasRedeemedVip)
  };
}
function rememberTrial(db, user) {
  const previous = previousTrial(db, user);
  const record = {
    trialExpiresAt: new Date(Math.min(Date.parse(user.trialExpiresAt) || 0,
      previous ? Date.parse(previous.trialExpiresAt) : Infinity)).toISOString(),
    hasRedeemedVip: Boolean(previous?.hasRedeemedVip || user.hasRedeemedVip || user.vipCode)
  };
  db.trialHistory ||= {};
  for (const key of trialKeys(db, user)) db.trialHistory[key] = record;
}
const defaultStorageFile = () => (process.env.VERCEL ? path.join('/tmp', 'access-v2.json') : path.resolve('server/data/access-v2.json'));
export class StorageManager {
  constructor(file = defaultStorageFile()) { this.file = file; this.queue = Promise.resolve(); }
  async loadRaw() {
    if (redisConfigured()) return await redisCommand('GET', KEY);
    try { return await fs.readFile(this.file, 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT') {
        if (this.file === defaultStorageFile()) {
          try {
            return await fs.readFile(path.resolve('server/data/access-v2.json'), 'utf8');
          } catch {}
          return JSON.stringify(initial());
        }
        return null;
      }
      throw error;
    }
  }
  async load() { const raw = await this.loadRaw(); return raw ? JSON.parse(raw) : initial(); }
  async read(kind, query = '', userId = '') {
    if (!redisConfigured()) return selectAccess(await this.load(), kind, query, userId);
    const result = JSON.parse(await redisEval(ACCESS_READ_SCRIPT, 1, KEY, kind, query, userId));
    return normalizeAccessRead(kind, result);
  }
  async getSessionAccess(sessionId, userId = '') { return this.read('session', sessionId, userId); }
  async transaction(change) {
    if (redisConfigured()) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const raw = await this.loadRaw();
        const db = raw ? JSON.parse(raw) : initial();
        const result = change(db);
        const script = "local old=redis.call('GET',KEYS[1]); if (not old and ARGV[1]=='') or old==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]); return 1 end; return 0";
        if (await redisCommand('EVAL', script, 1, KEY, raw || '', JSON.stringify(db))) return result;
      }
      throw new Error('Almacenamiento ocupado. Reintenta la operación.');
    }
    const operation = this.queue.then(async () => {
      const db = await this.load();
      const result = change(db);
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(db), 'utf8');
      await fs.rename(temporary, this.file);
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async getCodes() { return this.read('codes'); }
  async getCode(code) { return this.read('code', clean(code)); }
  entry(code, durationDays, label) {
    if (!/^[A-Z0-9-]{6,64}$/.test(clean(code))) throw new Error('Usa de 6 a 64 letras, números o guiones.');
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 1000) throw new Error('La duración debe ser de 1 a 1000 días.');
    return { code: clean(code), durationDays, label: String(label || '').slice(0, 100), createdAt: new Date().toISOString(), isClaimed: false, claimedAt: null, expiresAt: null, devices: [] };
  }
  async createCode({ code, durationDays = 30, label }) {
    const entry = this.entry(code, durationDays, label);
    return this.transaction(db => {
      if (db.codes.some(c => c.code === entry.code)) throw new Error('El código ya existe.');
      if (db.codes.length >= 10000) throw new Error('Límite de 10.000 códigos alcanzado.');
      db.codes.unshift(entry); return entry;
    });
  }
  async generateBatchCodes({ count = 30, durationDays = 30, prefix = 'VIP' }) {
    if (!Number.isInteger(count) || count < 1 || count > 200 || !/^[A-Za-z0-9]{1,12}$/.test(prefix)) throw new Error('Cantidad (1–200) o prefijo inválido.');
    this.entry(`${prefix}-CHECK`, durationDays, '');
    return this.transaction(db => {
      if (db.codes.length + count > 10000) throw new Error('Límite de códigos alcanzado.');
      const existing = new Set(db.codes.map(c => c.code));
      const created = [];
      while (created.length < count) {
        const code = `${prefix}-${randomBytes(8).toString('hex')}`.toUpperCase();
        if (existing.has(code)) continue;
        existing.add(code);
        created.push(this.entry(code, durationDays, `Lote ${prefix}`));
      }
      db.codes.unshift(...created); return created;
    });
  }
  async claimCode() {
    return { success: false, message: 'Inicia sesión con Google para vincular el código a tu cuenta.' };
  }
  async deleteCode(code) {
    return this.transaction(db => {
      const item = db.codes.find(c => c.code === clean(code));
      if (item) { item.revoked = true; item.deletedAt = new Date().toISOString(); }
      return true;
    });
  }
  async revokeCode(code) { return this.transaction(db => { const c = db.codes.find(c => c.code === clean(code)); if (c) { c.revoked = true; c.expiresAt = new Date().toISOString(); } return Boolean(c); }); }
  async getUsers() { return this.read('users'); }
  async deleteUserData(userId) {
    return this.transaction(db => {
      const user = (db.users || []).find(item => item.id === userId);
      if (!user) return;
      rememberTrial(db, user);
      db.users = db.users.filter(item => item.id !== userId);
      for (const code of db.codes || []) {
        if ([user.email, user.name].includes(code.claimedBy)) delete code.claimedBy;
        if (code.claimedUserId === userId) { delete code.claimedUserId; code.revoked = true; }
        code.devices = (code.devices || []).filter(id => !(user.devices || []).includes(id));
      }
    });
  }
  async revokeSession(id, expires) {
    return this.transaction(db => {
      db.revokedSessions = Object.fromEntries(Object.entries(db.revokedSessions || {}).filter(([, end]) => end > Date.now()));
      db.revokedSessions[id] = expires;
    });
  }
  async isSessionRevoked(id) { return this.read('revoked', id); }
  async getUser(idOrEmailOrGoogleId) {
    return this.read('user', String(idOrEmailOrGoogleId || '').trim());
  }
  async upsertGoogleUser({ googleId, email, name, picture, deviceId }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Email inválido.');
    const gId = String(googleId || '').trim();
    const cleanName = String(name || cleanEmail.split('@')[0] || 'Usuario Google').trim().slice(0, 80);
    const cleanPic = String(picture || '').trim().slice(0, 500);

    return this.transaction(db => {
      db.users ||= [];
      let user = db.users.find(u => (gId && u.googleId === gId) || (u.email && u.email.toLowerCase() === cleanEmail));
      const now = Date.now();

      if (user) {
        if (cleanName) user.name = cleanName;
        if (cleanPic) user.picture = cleanPic;
        if (gId && !user.googleId) user.googleId = gId;
        user.devices ||= [];
        if (deviceId && !user.devices.includes(deviceId)) {
          if (user.devices.length < 50) user.devices.push(deviceId);
        }
      } else {
        const trialDays = 3;
        const createdAt = new Date(now).toISOString();
        const history = previousTrial(db, { email: cleanEmail, googleId: gId });
        const trialExpiresAt = history?.trialExpiresAt || new Date(now + trialDays * 86400000).toISOString();
        user = {
          id: randomUUID(),
          googleId: gId || randomUUID(),
          email: cleanEmail,
          name: cleanName,
          picture: cleanPic,
          createdAt,
          trialExpiresAt,
          hasRedeemedVip: Boolean(history?.hasRedeemedVip),
          vipCode: null,
          vipExpiresAt: null,
          role: 'trial',
          devices: deviceId ? [deviceId] : []
        };
        db.users.unshift(user);
      }

      const codeItem = db.codes.find(c => c.code === clean(user.vipCode));
      // Bind only legacy records already tied to this verified account by exact email.
      if (codeItem?.isClaimed && !codeItem.claimedUserId && codeItem.claimedBy?.toLowerCase() === cleanEmail &&
          db.users.filter(u => u.vipCode === codeItem.code).length === 1) codeItem.claimedUserId = user.id;
      if (codeItem?.claimedUserId === user.id) user.hasRedeemedVip = true;
      rememberTrial(db, user);
      const access = entitlement(user, codeItem, now);
      user.role = access.role;
      user.vipExpiresAt = access.isVip ? codeItem.expiresAt : user.vipExpiresAt;
      return { ...user, ...access, expiresAt: new Date(access.expires).toISOString() };
    });
  }
  async redeemUserCode({ userId, code, deviceId }) {
    const cleanCode = clean(code);
    if (!cleanCode) return { success: false, message: 'Ingresa una clave válida.' };
    return this.transaction(db => {
      const user = (db.users || []).find(u => u.id === userId);
      if (!user?.googleId) return { success: false, message: 'Inicia sesión con Google para activar el código.' };
      const now = Date.now();
      const master = (CONFIG.MASTER_ADMIN_CODE || '').trim().toUpperCase();
      if (!ownerGoogleEmail() && master && cleanCode === master) {
        user.role = 'owner'; user.vipCode = 'MASTER';
        return { success: true, isAdmin: true, role: 'owner', plan: 'Owner', expiresAt: new Date(now + 8 * 3600000).toISOString(), daysRemaining: 365, message: 'Acceso Owner activado.' };
      }
      const item = db.codes.find(c => c.code === cleanCode);
      if (!item || item.deletedAt) return { success: false, message: 'Código inválido.' };
      if (item.isClaimed && item.claimedUserId !== user.id) return { success: false, message: 'Este código ya fue utilizado y no se puede activar en otra cuenta.' };
      if (item.revoked || (item.expiresAt && Date.parse(item.expiresAt) <= now)) return { success: false, expired: true, message: 'Este código ha vencido o ha sido revocado.' };
      const current = db.codes.find(c => c.code === user.vipCode);
      if (current && current.code !== item.code && entitlement(user, current, now).isVip) return { success: false, message: 'Tu cuenta ya tiene un código VIP activo. Espera a su vencimiento para activar otro.' };
      if (!item.isClaimed) {
        item.isClaimed = true;
        item.claimedUserId = user.id;
        item.claimedBy = user.email;
        item.claimedAt = new Date(now).toISOString();
        item.expiresAt = new Date(now + item.durationDays * 86400000).toISOString();
      }
      item.devices ||= [];
      if (deviceId && !item.devices.includes(deviceId) && item.devices.length < 100) item.devices.push(deviceId);
      user.vipCode = item.code; user.vipExpiresAt = item.expiresAt;
      user.hasRedeemedVip = true; user.role = 'vip_user';
      rememberTrial(db, user);
      return { success: true, isAdmin: false, role: 'vip_user', plan: 'VIP', code: item.code, expiresAt: item.expiresAt,
        daysRemaining: Math.ceil((Date.parse(item.expiresAt) - now) / 86400000), message: 'VIP vinculado a tu cuenta hasta ' + item.expiresAt + '.' };
    });
  }
  async getAiConfig() {
    const data = await this.read('ai');
    if (data.aiConfig) {
      const cfg = { ...data.aiConfig };
      if (cfg.provider === 'openrouter') cfg.provider = 'custom';
      if (typeof cfg.baseUrl === 'string' && cfg.baseUrl.includes('openrouter.ai')) {
        cfg.baseUrl = 'https://vyceai.com/v1';
      }
      if (typeof cfg.selectedModel === 'string' && cfg.selectedModel.includes('openrouter')) {
        cfg.selectedModel = 'deepseek-v4.1';
        cfg.modelName = 'DeepSeek V4.1 Flash';
      }
      return cfg;
    }
    if (data.settings?.selectedModel) {
      let selModel = data.settings.selectedModel;
      if (typeof selModel === 'string' && selModel.includes('openrouter')) {
        selModel = 'deepseek-v4.1';
      }
      return {
        provider: 'custom',
        apiKey: '',
        baseUrl: 'https://vyceai.com/v1',
        selectedModel: selModel,
        modelName: selModel,
        updatedAt: null
      };
    }
    return null;
  }
  async getSocialSettings() {
    const settings = await this.read('social');
    return { promoImageVisible: true, ...(settings || { links: SOCIAL_LINKS, revision: 0, updatedAt: null }) };
  }
  async updateSocialSettings(links, revision) {
    const validated = validateSocialLinks(links);
    return this.transaction(db => {
      const current = db.socialSettings?.revision || 0;
      if (!Number.isInteger(revision) || revision !== current) throw new Error('Los enlaces cambiaron. Recarga antes de guardar.');
      db.socialSettings = { promoImageVisible: db.socialSettings?.promoImageVisible !== false, links: validated, revision: current + 1, updatedAt: new Date().toISOString() };
      return db.socialSettings;
    });
  }
  async updatePromoImageVisibility(visible, revision) {
    if (typeof visible !== 'boolean') throw new Error('La visibilidad debe ser verdadera o falsa.');
    return this.transaction(db => {
      const current = db.socialSettings || { links: SOCIAL_LINKS, revision: 0 };
      if (!Number.isInteger(revision) || revision !== current.revision) throw new Error('La configuración cambió. Recarga antes de guardar.');
      db.socialSettings = { ...current, promoImageVisible: visible, revision: current.revision + 1, updatedAt: new Date().toISOString() };
      return db.socialSettings;
    });
  }
  async updateAiConfig(updates = {}) {
    return this.transaction(db => {
      const existing = db.aiConfig || {};
      const newApiKey = updates.apiKey !== undefined && updates.apiKey !== null ? String(updates.apiKey).trim() : existing.apiKey;
      let rawProvider = String(updates.provider || existing.provider || 'custom').trim().toLowerCase();
      if (rawProvider === 'openrouter') rawProvider = 'custom';
      let rawBaseUrl = String(updates.baseUrl || existing.baseUrl || 'https://vyceai.com/v1').trim();
      if (rawBaseUrl.includes('openrouter.ai')) rawBaseUrl = 'https://vyceai.com/v1';
      let selectedModel = String(updates.selectedModel ?? existing.selectedModel ?? '').trim();
      if (selectedModel.includes('openrouter')) selectedModel = 'deepseek-v4.1';
      db.aiConfig = {
        provider: rawProvider,
        apiKey: newApiKey || '',
        baseUrl: rawBaseUrl,
        selectedModel,
        modelName: String(updates.modelName ?? existing.modelName ?? selectedModel).trim(),
        updatedAt: new Date().toISOString()
      };
      if (db.settings) {
        db.settings.selectedModel = selectedModel;
      }
      return db.aiConfig;
    });
  }
}
export function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  const clean = key.trim();
  if (clean.length <= 8) return '••••••••';
  return `${clean.slice(0, 6)}••••••••${clean.slice(-4)}`;
}
export const storage = new StorageManager();
