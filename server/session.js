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
  const payload = Buffer.from(JSON.stringify({ ...data, issuedAt: Date.now() })).toString('base64url');
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
    if (parsed.userId) {
      const cookieAgeLimit = (parsed.issuedAt || parsed.expires || Date.now()) + 30 * 86400000;
      return cookieAgeLimit > Date.now() ? parsed : null;
    }
    return parsed.expires > Date.now() ? parsed : null;
  } catch { return null; }
}
export async function currentSession(req) {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey && adminKey.trim() === (CONFIG.MASTER_ADMIN_CODE || 'DeportePicks').trim()) {
    return { role: 'owner', code: 'MASTER', ownerVersion: ownerVersion() };
  }
  const session = readSession(req);
  if (!session) return null;
  if (session.role === 'owner') return session.ownerVersion === ownerVersion() ? session : null;

  if (session.userId) {
    const user = await storage.getUser(session.userId);
    if (!user) return null;

    const now = Date.now();
    if (user.role === 'owner') {
      return { ...session, role: 'owner', plan: 'Owner', isAdmin: true, ownerVersion: ownerVersion() };
    }

    if (user.vipCode) {
      const code = await storage.getCode(user.vipCode);
      if (code && !code.revoked && code.expiresAt && Date.parse(code.expiresAt) > now) {
        const expires = Date.parse(code.expiresAt);
        return {
          ...session,
          role: 'vip_user',
          plan: 'VIP',
          code: user.vipCode,
          expires,
          daysRemaining: Math.ceil((expires - now) / 86400000),
          isTrial: false,
          trialExpired: false
        };
      }
    }

    const trialEnd = Date.parse(user.trialExpiresAt);
    if (trialEnd > now) {
      return {
        ...session,
        role: 'trial_user',
        plan: 'Prueba 3 Días',
        expires: trialEnd,
        daysRemaining: Math.max(1, Math.ceil((trialEnd - now) / 86400000)),
        isTrial: true,
        trialExpired: false
      };
    } else {
      return {
        ...session,
        role: 'expired_user',
        plan: 'Prueba Vencida',
        expires: trialEnd,
        daysRemaining: 0,
        isTrial: false,
        trialExpired: true
      };
    }
  }

  const code = await storage.getCode(session.code);
  return code && !code.revoked && code.isClaimed && Date.parse(code.expiresAt) > Date.now() ? session : null;
}
export function ownerVersion() { return createHmac('sha256', secret()).update((CONFIG.MASTER_ADMIN_CODE || 'DeportePicks').trim().toUpperCase()).digest('hex'); }
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
  const adminKey = req.headers['x-admin-key'] || req.body?.adminKey;
  const master = (CONFIG.MASTER_ADMIN_CODE || 'DeportePicks').trim().toUpperCase();
  if (adminKey && String(adminKey).trim().toUpperCase() === master) {
    return next();
  }
  if (req.session?.role === 'owner') return next();
  return res.status(403).json({ success: false, message: 'Acceso exclusivo del administrador.' });
}
