import { createHmac, timingSafeEqual, randomUUID, randomBytes } from 'node:crypto';
import { CONFIG, isProduction, ownerGoogleEmail, isOwnerUser } from './config.js';
import { entitlement } from './entitlements.js';
import { storage } from './storage.js';
const fallbackSecret = randomBytes(32).toString('hex');
const secret = () => {
  if (process.env.SESSION_SECRET?.length >= 32 && process.env.SESSION_SECRET !== 'deportepicks-vip-ultra-secure-key-32chars') return process.env.SESSION_SECRET;
  if (isProduction()) throw new Error('Configura SESSION_SECRET con al menos 32 caracteres.');
  return fallbackSecret;
};
const sign = payload => createHmac('sha256', secret()).update(payload).digest('base64url');
export function setSession(res, data) {
  const payload = Buffer.from(JSON.stringify({ ...data, sessionId: randomUUID(), issuedAt: Date.now() })).toString('base64url');
  const cookieMaxAge = Math.max(30 * 86400000, Math.max(0, (data.expires || 0) - Date.now()));
  res.cookie('picks_session', `${payload}.${sign(payload)}`, { httpOnly: true, secure: Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production'), sameSite: 'lax', path: '/', maxAge: cookieMaxAge });
}
export function readSession(req) {
  try {
    const value = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('picks_session='))?.slice(14);
    if (!value) return null;
    const [payload, signature] = value.split('.');
    const a = Buffer.from(signature || ''), b = Buffer.from(sign(payload));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (parsed.role === 'owner') return parsed.expires > Date.now() ? parsed : null;
    if (parsed.userId) {
      const cookieAgeLimit = (parsed.issuedAt || 0) + 30 * 86400000;
      return cookieAgeLimit > Date.now() ? parsed : null;
    }
    return parsed.expires > Date.now() ? parsed : null;
  } catch { return null; }
}
export async function currentSession(req) {
  const session = readSession(req);
  if (!session) return null;
  const access = await storage.getSessionAccess(sessionIdentifier(session), session.userId);
  if (access.revoked) return null;
  if (session.role === 'owner' && session.ownerVersion !== ownerVersion()) return null;
  if (session.userId) {
    const { user, code } = access;
    if (!user) return null;
    if (session.role === 'owner' && !isOwnerUser(user)) return null;
    return { ...session, ...entitlement(user, code), ownerVersion: isOwnerUser(user) ? ownerVersion() : undefined };
  }
  // Legacy code-only VIP cookies never grant account-bound access.
  if (!ownerGoogleEmail() && session.role === 'owner') return session;
  return null;
}

export const sessionIdentifier = session => session.sessionId || sign(JSON.stringify(session));
export function ownerVersion() { return createHmac('sha256', secret()).update(ownerGoogleEmail() || (CONFIG.MASTER_ADMIN_CODE || '').trim().toUpperCase()).digest('hex'); }
export async function requireSession(req, res, next) {
  try {
    req.session = await currentSession(req);
    if (!req.session) return res.status(401).json({ success: false, message: 'Inicia sesión con tu cuenta de Google para continuar.' });
    if (req.session.trialExpired) {
      return res.status(403).json({
        success: false,
        trialExpired: true,
        message: 'Tu período de prueba de 3 días ha vencido. Ingresa un código VIP válido para reactivar el acceso.'
      });
    }
    next();
  } catch { res.status(503).json({ success: false, message: 'No se puede validar la sesión; comprueba la configuración del almacenamiento.' }); }
}
export function requireAdmin(req, res, next) {
  if (req.session?.role === 'owner') return next();
  return res.status(403).json({ success: false, message: 'Acceso exclusivo del administrador.' });
}
