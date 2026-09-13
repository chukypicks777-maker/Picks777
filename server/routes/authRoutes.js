import express from 'express';
import { randomUUID } from 'node:crypto';
import { CONFIG } from '../config.js';
import { storage } from '../storage.js';
import { currentSession, readSession, setSession, ownerVersion } from '../session.js';
import { rateLimit } from '../rateLimit.js';

const router = express.Router();
router.use('/verify-code', rateLimit('auth'));
router.use('/redeem-code', rateLimit('auth'));
router.use('/google', rateLimit('auth'));

function publicSession(session) {
  const isOwner = session.role === 'owner';
  const isVip = session.role === 'vip_user' || session.role === 'vip';
  const trialExpired = Boolean(session.trialExpired || session.role === 'expired_user');
  const isTrial = !isOwner && !isVip && !trialExpired;
  const valid = !trialExpired && (isOwner || isVip || isTrial);
  const now = Date.now();
  const daysRemaining = isOwner ? 365 : (session.daysRemaining !== undefined ? session.daysRemaining : Math.max(0, Math.ceil(((session.expires || 0) - now) / 86400000)));
  const plan = isOwner ? 'Owner' : (isVip ? 'VIP' : (trialExpired ? 'Prueba Vencida' : 'Prueba 3 Días'));

  return {
    success: true,
    valid,
    isAdmin: isOwner,
    role: session.role,
    isTrial,
    trialExpired,
    daysRemaining,
    user: {
      id: session.userId,
      name: session.name,
      username: session.name,
      email: session.email,
      picture: session.picture,
      expiresAt: session.expires ? new Date(session.expires).toISOString() : null,
      daysRemaining,
      plan,
      hasCode: Boolean(session.code && session.code !== 'MASTER')
    }
  };
}

async function verifyGoogleToken(credential) {
  if (!credential || typeof credential !== 'string') return null;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.email) {
        const expectedClientId = CONFIG.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
        if (expectedClientId && data.aud && data.aud !== expectedClientId) {
          return null;
        }
        return data;
      }
    }
  } catch {}

  // Fallback for offline / dev test fixtures only
  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
    try {
      const parts = credential.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (payload.email) return payload;
      }
    } catch {}
  }
  return null;
}

router.get('/google-config', (req, res) => {
  res.json({
    clientId: CONFIG.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || ''
  });
});

router.post('/google', async (req, res) => {
  try {
    const { credential, demoUser } = req.body || {};
    let googleProfile = null;

    if (credential) {
      googleProfile = await verifyGoogleToken(credential);
    } else if (demoUser && typeof demoUser === 'object' && demoUser.email) {
      googleProfile = {
        sub: String(demoUser.id || randomUUID()),
        email: String(demoUser.email),
        name: String(demoUser.name || demoUser.email.split('@')[0]),
        picture: String(demoUser.picture || '')
      };
    }

    if (!googleProfile || !googleProfile.email) {
      return res.status(400).json({ success: false, message: 'Autenticación con Google inválida o no proporcionada.' });
    }

    const deviceId = readSession(req)?.deviceId || randomUUID();
    const user = await storage.upsertGoogleUser({
      googleId: googleProfile.sub,
      email: googleProfile.email,
      name: googleProfile.name,
      picture: googleProfile.picture,
      deviceId
    });

    const now = Date.now();
    const isOwner = user.role === 'owner';
    const isVip = user.isVip || Boolean(user.vipCode);
    const trialExpired = user.trialExpired;
    const trialEnd = Date.parse(user.trialExpiresAt);
    const vipExpires = user.vipExpiresAt ? Date.parse(user.vipExpiresAt) : 0;
    const expires = isOwner ? now + 8 * 3600000 : (isVip ? vipExpires : trialEnd);

    const session = {
      role: isOwner ? 'owner' : (isVip ? 'vip_user' : (trialExpired ? 'expired_user' : 'trial_user')),
      userId: user.id,
      googleId: user.googleId,
      email: user.email,
      name: user.name,
      picture: user.picture,
      code: user.vipCode || undefined,
      deviceId,
      expires,
      ownerVersion: isOwner ? ownerVersion() : undefined,
      isTrial: !isOwner && !isVip && !trialExpired,
      trialExpired,
      daysRemaining: user.daysRemaining
    };

    setSession(res, session);
    const welcomeMsg = trialExpired
      ? 'Tu período de prueba de 3 días ha vencido. Ingresa tu clave VIP para continuar.'
      : (isVip ? `¡Bienvenido, ${user.name}! Membresía VIP activa.` : `¡Bienvenido, ${user.name}! Tienes 3 días de prueba completa.`);

    res.json({ ...publicSession(session), message: welcomeMsg });
  } catch {
    res.status(503).json({ success: false, message: 'Servicio de autenticación no disponible. Intenta de nuevo.' });
  }
});

router.post('/redeem-code', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Ingresa una clave válida.' });
    }

    const session = await currentSession(req);
    const deviceId = session?.deviceId || readSession(req)?.deviceId || randomUUID();

    if (session?.userId) {
      const result = await storage.redeemUserCode({ userId: session.userId, code: code.trim(), deviceId });
      if (!result.success) return res.status(400).json(result);

      const isOwner = result.role === 'owner';
      const updatedSession = {
        ...session,
        role: isOwner ? 'owner' : 'vip_user',
        code: result.code || 'MASTER',
        expires: Date.parse(result.expiresAt),
        daysRemaining: result.daysRemaining,
        ownerVersion: isOwner ? ownerVersion() : undefined,
        isTrial: false,
        trialExpired: false
      };
      setSession(res, updatedSession);
      return res.json({ ...publicSession(updatedSession), message: result.message });
    }

    const masterCode = (CONFIG.MASTER_ADMIN_CODE || 'DeportePicks').trim();
    let newSession;
    if (masterCode && code.trim().toUpperCase() === masterCode.toUpperCase()) {
      newSession = { role: 'owner', name: 'Dueño', deviceId, expires: Date.now() + 8 * 3600000, ownerVersion: ownerVersion() };
    } else {
      const result = await storage.claimCode(code, 'Usuario VIP', deviceId);
      if (!result.success) return res.status(401).json(result);
      newSession = { role: 'vip_user', code: result.code, name: 'Usuario VIP', deviceId, expires: Date.parse(result.expiresAt) };
    }
    setSession(res, newSession);
    res.json({ ...publicSession(newSession), message: 'Acceso concedido.' });
  } catch {
    res.status(503).json({ success: false, message: 'No se pudo canjear la clave. Intenta de nuevo.' });
  }
});

router.post('/verify-code', async (req, res) => {
  try {
    const { code, username } = req.body;
    if (typeof code !== 'string' || !code.trim() || code.length > 128) {
      return res.status(400).json({ success: false, message: 'Ingresa un código válido.' });
    }

    const existingSession = await currentSession(req);
    const deviceId = existingSession?.deviceId || readSession(req)?.deviceId || randomUUID();

    if (existingSession?.userId) {
      const result = await storage.redeemUserCode({ userId: existingSession.userId, code: code.trim(), deviceId });
      if (!result.success) return res.status(400).json(result);
      const isOwner = result.role === 'owner';
      const updatedSession = {
        ...existingSession,
        role: isOwner ? 'owner' : 'vip_user',
        code: result.code || 'MASTER',
        expires: Date.parse(result.expiresAt),
        daysRemaining: result.daysRemaining,
        ownerVersion: isOwner ? ownerVersion() : undefined,
        isTrial: false,
        trialExpired: false
      };
      setSession(res, updatedSession);
      return res.json({ ...publicSession(updatedSession), message: result.message });
    }

    const name = String(username || 'Usuario VIP').trim().slice(0, 80);
    let session;
    const masterCode = (CONFIG.MASTER_ADMIN_CODE || 'DeportePicks').trim();
    if (masterCode && code.trim().toUpperCase() === masterCode.toUpperCase()) {
      session = { role: 'owner', name, deviceId, expires: Date.now() + 8 * 3600000, ownerVersion: ownerVersion() };
    } else {
      const result = await storage.claimCode(code, name, deviceId);
      if (!result.success) return res.status(401).json(result);
      session = { role: 'vip_user', code: result.code, name, deviceId, expires: Date.parse(result.expiresAt) };
    }
    setSession(res, session);
    res.json({ ...publicSession(session), message: 'Acceso concedido.' });
  } catch {
    res.status(503).json({ success: false, message: 'Acceso no disponible. Comprueba Redis y SESSION_SECRET en el servidor.' });
  }
});

router.post('/check-session', async (req, res) => {
  const session = await currentSession(req);
  res.json(session ? publicSession(session) : { success: false, valid: false });
});

router.post('/logout', (req, res) => {
  res.clearCookie('picks_session', { path: '/' });
  res.json({ success: true, message: 'Sesión finalizada.' });
});

export default router;
