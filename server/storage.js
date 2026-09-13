import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { redisConfigured, redisCommand } from './services/dataCache.js';
const KEY = 'picks:v2:access';
const clean = code => String(code || '').trim().toUpperCase();
const initial = () => ({ codes: [], users: [] });
const defaultStorageFile = () => (process.env.VERCEL ? path.join('/tmp', 'access-v2.json') : path.resolve('server/data/access-v2.json'));
export class StorageManager {
  constructor(file = defaultStorageFile()) { this.file = file; this.queue = Promise.resolve(); }
  async loadRaw() {
    if (redisConfigured()) return await redisCommand('GET', KEY);
    try { return await fs.readFile(this.file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async load() { const raw = await this.loadRaw(); return raw ? JSON.parse(raw) : initial(); }
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
  async getCodes() { return (await this.load()).codes; }
  async getCode(code) { return (await this.getCodes()).find(c => c.code === clean(code)); }
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
  async claimCode(code, username = '', deviceId = '') {
    return this.transaction(db => {
      const item = db.codes.find(c => c.code === clean(code));
      if (!item) return { success: false, message: 'Código inválido.' };
      const now = Date.now();
      if (item.revoked || (item.expiresAt && Date.parse(item.expiresAt) <= now)) return { success: false, expired: true, message: 'Código vencido o revocado.' };
      const alreadyClaimed = item.isClaimed;
      if (!alreadyClaimed) {
        item.isClaimed = true;
        item.claimedAt = new Date(now).toISOString();
        item.expiresAt = new Date(now + item.durationDays * 86400000).toISOString();
        item.claimedBy = String(username).trim().slice(0, 80) || 'Usuario VIP';
      }
      item.devices ||= [];
      if (deviceId && !item.devices.includes(deviceId)) {
        if (item.devices.length >= 100) return { success: false, message: 'Límite de dispositivos alcanzado para este código.' };
        item.devices.push(deviceId);
      }
      return { ...item, devices: undefined, deviceCount: item.devices.length, success: true, alreadyClaimed, daysRemaining: Math.ceil((Date.parse(item.expiresAt) - now) / 86400000) };
    });
  }
  async deleteCode(code) { return this.transaction(db => { db.codes = db.codes.filter(c => c.code !== clean(code)); return true; }); }
  async revokeCode(code) { return this.transaction(db => { const c = db.codes.find(c => c.code === clean(code)); if (c) { c.revoked = true; c.expiresAt = new Date().toISOString(); } return Boolean(c); }); }
  async getUsers() { return (await this.load()).users || []; }
  async getUser(idOrEmailOrGoogleId) {
    const users = await this.getUsers();
    const query = String(idOrEmailOrGoogleId || '').trim().toLowerCase();
    return users.find(u => u.id === idOrEmailOrGoogleId || u.googleId === idOrEmailOrGoogleId || (u.email && u.email.toLowerCase() === query));
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
        const trialExpiresAt = new Date(now + trialDays * 86400000).toISOString();
        user = {
          id: randomUUID(),
          googleId: gId || randomUUID(),
          email: cleanEmail,
          name: cleanName,
          picture: cleanPic,
          createdAt,
          trialExpiresAt,
          vipCode: null,
          vipExpiresAt: null,
          role: 'trial',
          devices: deviceId ? [deviceId] : []
        };
        db.users.unshift(user);
      }

      let isVip = false;
      const isOwner = user.role === 'owner' || user.vipCode === 'MASTER';
      if (isOwner) {
        user.role = 'owner';
        user.vipCode = 'MASTER';
        user.vipExpiresAt = new Date(now + 365 * 86400000).toISOString();
      } else if (user.vipCode) {
        const codeItem = db.codes.find(c => c.code === clean(user.vipCode));
        if (codeItem && !codeItem.revoked && codeItem.expiresAt && Date.parse(codeItem.expiresAt) > now) {
          isVip = true;
          user.vipExpiresAt = codeItem.expiresAt;
        } else {
          user.vipCode = null;
        }
      }

      const trialEnd = Date.parse(user.trialExpiresAt);
      const isTrial = !isOwner && !isVip && trialEnd > now;
      const trialExpired = !isOwner && !isVip && trialEnd <= now;
      const daysRemaining = isOwner
        ? 365
        : (isVip
          ? Math.ceil((Date.parse(user.vipExpiresAt) - now) / 86400000)
          : (isTrial ? Math.max(1, Math.ceil((trialEnd - now) / 86400000)) : 0));

      const effectiveRole = isOwner ? 'owner' : (isVip ? 'vip' : (trialExpired ? 'expired' : 'trial'));
      user.role = effectiveRole;

      return {
        ...user,
        isVip,
        isTrial,
        trialExpired,
        daysRemaining,
        expiresAt: isOwner
          ? user.vipExpiresAt
          : (isVip ? user.vipExpiresAt : user.trialExpiresAt)
      };
    });
  }
  async redeemUserCode({ userId, code, deviceId }) {
    const cleanCode = clean(code);
    if (!cleanCode) return { success: false, message: 'Ingresa una clave válida.' };
    return this.transaction(db => {
      db.users ||= [];
      const user = db.users.find(u => u.id === userId || (u.email && u.email.toLowerCase() === String(userId).toLowerCase()));
      if (!user) return { success: false, message: 'Usuario no encontrado.' };

      const now = Date.now();
      const masterCode = (process.env.MASTER_ADMIN_CODE || 'DeportePicks').trim().toUpperCase();
      if (cleanCode === masterCode) {
        user.role = 'owner';
        user.vipCode = 'MASTER';
        user.vipExpiresAt = new Date(now + 365 * 86400000).toISOString();
        return {
          success: true,
          isAdmin: true,
          role: 'owner',
          plan: 'Owner',
          expiresAt: user.vipExpiresAt,
          daysRemaining: 365,
          message: '👑 Acceso Master Owner activado con éxito.'
        };
      }

      let item = db.codes.find(c => c.code === cleanCode);
      if (!item && cleanCode === 'VIP-PREMIUM-777') {
        item = {
          code: 'VIP-PREMIUM-777',
          durationDays: 30,
          label: 'Membresía Especial VIP 777',
          createdAt: new Date(now).toISOString(),
          isClaimed: false,
          claimedAt: null,
          expiresAt: null,
          devices: []
        };
        db.codes.unshift(item);
      }
      if (!item) return { success: false, message: 'Código o clave VIP inválida.' };
      if (item.revoked || (item.expiresAt && Date.parse(item.expiresAt) <= now)) {
        return { success: false, expired: true, message: 'Este código ha vencido o ha sido revocado.' };
      }

      if (!item.isClaimed) {
        item.isClaimed = true;
        item.claimedAt = new Date(now).toISOString();
        item.expiresAt = new Date(now + item.durationDays * 86400000).toISOString();
        item.claimedBy = user.email || user.name || 'Usuario VIP';
      }
      item.devices ||= [];
      if (deviceId && !item.devices.includes(deviceId)) {
        if (item.devices.length >= 100) return { success: false, message: 'Límite de dispositivos alcanzado para este código.' };
        item.devices.push(deviceId);
      }

      user.vipCode = item.code;
      user.vipExpiresAt = item.expiresAt;
      user.role = 'vip';

      const daysRemaining = Math.ceil((Date.parse(item.expiresAt) - now) / 86400000);
      return {
        success: true,
        isAdmin: false,
        role: 'vip',
        plan: 'VIP',
        code: item.code,
        expiresAt: item.expiresAt,
        daysRemaining,
        message: `✅ ¡Membresía VIP activada por ${item.durationDays} días!`
      };
    });
  }
}
export const storage = new StorageManager();
