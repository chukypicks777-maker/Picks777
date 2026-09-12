import { createHmac, timingSafeEqual } from 'node:crypto';
import { CONFIG, secureConfiguration } from './config.js';
import { storage } from './storage.js';
const secret = () => {
  if (!secureConfiguration()) throw new Error('Configuración segura requerida.');
  if (process.env.SESSION_SECRET?.length >= 16) return process.env.SESSION_SECRET;
  return createHmac('sha256', 'deportepicks-vip-salt-2026')
    .update((process.env.MASTER_ADMIN_CODE || 'DeportePicks').trim())
    .digest('hex');
};
const sign = payload => createHmac('sha256', secret()).update(payload).digest('base64url');
export function setSession(res, data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  res.cookie('picks_session', `${payload}.${sign(payload)}`, { httpOnly: true, secure: Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production'), sameSite: 'lax', path: '/', maxAge: Math.max(0, data.expires - Date.now()) });
}
export function readSession(req) {
  try {
    const value = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('picks_session='))?.slice(14);
    if (!value) return null;
    const [payload, signature] = value.split('.');
    const a = Buffer.from(signature || ''), b = Buffer.from(sign(payload));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return parsed.expires > Date.now() ? parsed : null;
  } catch { return null; }
}
export async function currentSession(req) {
  const session = readSession(req);
  if (!session) return null;
  if (session.role === 'owner') return session.ownerVersion === ownerVersion() ? session : null;
  const code = await storage.getCode(session.code);
  return code && !code.revoked && code.isClaimed && Date.parse(code.expiresAt) > Date.now() ? session : null;
}
export function ownerVersion() { return createHmac('sha256', secret()).update((CONFIG.MASTER_ADMIN_CODE || 'DeportePicks').trim().toUpperCase()).digest('hex'); }
export async function requireSession(req, res, next) {
  try {
    req.session = await currentSession(req);
    if (!req.session) return res.status(401).json({ success: false, message: 'Ingresa un código vigente para continuar.' });
    next();
  } catch { res.status(503).json({ success: false, message: 'No se puede validar la sesión; comprueba la configuración del almacenamiento.' }); }
}
export function requireAdmin(req, res, next) {
  if (req.session?.role !== 'owner') return res.status(403).json({ success: false, message: 'Acceso exclusivo del administrador.' });
  next();
}
