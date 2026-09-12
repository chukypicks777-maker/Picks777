import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { redisConfigured, redisCommand } from './services/dataCache.js';
const KEY = 'picks:v2:access';
const clean = code => String(code || '').trim().toUpperCase();
const initial = () => ({ codes: [] });
export class StorageManager {
  constructor(file = path.resolve('server/data/access-v2.json')) { this.file = file; this.queue = Promise.resolve(); }
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
}
export const storage = new StorageManager();
