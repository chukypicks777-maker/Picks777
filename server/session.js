import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { CONFIG } from './config.js';
import { storage } from './storage.js';
const fallbackSecret = 'deportepicks-vip-ultra-secure-key-32chars';
const secret = () => {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) return process.env.SESSION_SECRET;
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
  try {
    if (await storage.isSessionRevoked(sessionIdentifier(session))) return null;
  } catch {}

  if (session.role === 'owner') {
    if (session.ownerVersion !== ownerVersion()) return null;
    try {
      if (session.userId) {
        const user = await storage.getUser(session.userId);
        if (user && user.role !== 'owner' && user.vipCode !== 'MASTER') return null;
      }
    } catch {}
    return session;
  }

  if (session.userId) {
    let user = null;
    try {
      user = await storage.getUser(session.userId);
    } catch {
      user = null;
    }

    if (!user) {
      const now = Date.now();
      const cookieAgeLimit = (session.issuedAt || 0) + 30 * 86400000;
      if (cookieAgeLimit > now) {
        const expires = session.expires || 0;
        const trialExpired = Boolean(session.trialExpired || (expires > 0 && expires <= now));
        const isOwner = session.role === 'owner';
        const isVip = session.role === 'vip_user' || session.role === 'vip';
        const isTrial = !isOwner && !isVip && !trialExpired;
        const daysRemaining = isOwner
          ? 365
          : (isVip ? Math.max(0, Math.ceil((expires - now) / 86400000)) : (isTrial ? Math.max(1, Math.ceil((expires - now) / 86400000)) : 0));
        return {
          ...session,
          role: isOwner ? 'owner' : (isVip ? 'vip_user' : (trialExpired ? 'expired_user' : 'trial_user')),
          plan: isOwner ? 'Owner' : (isVip ? 'VIP' : (trialExpired ? 'Prueba Vencida' : 'Prueba 3 Días')),
          isTrial,
          trialExpired,
          daysRemaining
        };
      }
      return null;
    }

    const now = Date.now();
    if (user.role === 'owner') {
      return { ...session, role: 'owner', plan: 'Owner', isAdmin: true, ownerVersion: ownerVersion() };
    }

    if (user.vipCode) {
      let code = null;
      try { code = await storage.getCode(user.vipCode); } catch {}
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

  let code = null;
  try { code = await storage.getCode(session.code); } catch {}
  if (code && !code.revoked && code.isClaimed && Date.parse(code.expiresAt) > Date.now()) {
    return session;
  }
  if (!code && session.code && session.expires && session.expires > Date.now()) {
    return session;
  }
  return null;
}
export const sessionIdentifier = session => session.sessionId || sign(JSON.stringify(session));
export function ownerVersion() { return createHmac('sha256', secret()).update((CONFIG.MASTER_ADMIN_CODE || '').trim().toUpperCase()).digest('hex'); }
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
