import { verifyGoogleToken } from '../auth/googleVerifier.js';
export { verifyGoogleToken } from '../auth/googleVerifier.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { CONFIG, isProduction, secureConfiguration, ownerGoogleEmail } from '../config.js';
import { storage } from '../storage.js';
import { currentSession, readSession, setSession, ownerVersion, sessionIdentifier } from '../session.js';
import { rateLimit } from '../rateLimit.js';

const router = express.Router();
router.use((req, res, next) => {
  if (isProduction() && !secureConfiguration()) {
    return res.status(503).json({ success: false, message: 'Configuración segura requerida.' });
  }
  next();
});
router.use('/verify-code', rateLimit('auth'));
router.use('/redeem-code', rateLimit('auth'));
router.use('/google', rateLimit('auth'));
router.use('/delete-account', rateLimit('auth'));

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

router.get('/google-config', (req, res) => {
  res.json({
    clientId: CONFIG.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || ''
  });
});

router.post('/google', async (req, res) => {
  try {
    const googleProfile = await verifyGoogleToken(req.body?.credential);
    if (!googleProfile || !googleProfile.email) {
      return res.status(400).json({ success: false, message: 'Autenticación con Google inválida o no proporcionada.' });
    }

    const deviceId = readSession(req)?.deviceId || randomUUID();
    const user = await storage.upsertGoogleUser({
      googleId: googleProfile.sub, email: googleProfile.email,
      name: googleProfile.name, picture: googleProfile.picture, deviceId
    });

    const now = Date.now();
    const isOwner = user.role === 'owner';
    const isVip = user.isVip === true;
    const trialExpired = user.trialExpired;
    const expires = isOwner ? now + 8 * 3600000 : user.expires;

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
    const welcomeMsg = isOwner ? 'Bienvenido, Owner.' : trialExpired
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
      const result = await storage.redeemUserCode({
        userId: session.userId,
        code: code.trim(),
        deviceId,
        userFallback: {
          id: session.userId,
          email: session.email,
          name: session.name,
          picture: session.picture,
          googleId: session.googleId
        }
      });
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

    const masterCode = (CONFIG.MASTER_ADMIN_CODE || '').trim();
    let newSession;
    if (!ownerGoogleEmail() && masterCode && code.trim().toUpperCase() === masterCode.toUpperCase()) {
      newSession = { role: 'owner', name: 'Dueño', deviceId, expires: Date.now() + 8 * 3600000, ownerVersion: ownerVersion() };
    } else {
      return res.status(401).json({ success: false, message: 'Inicia sesión con Google para vincular el código a tu cuenta.' });
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
      const result = await storage.redeemUserCode({
        userId: existingSession.userId,
        code: code.trim(),
        deviceId,
        userFallback: {
          id: existingSession.userId,
          email: existingSession.email,
          name: existingSession.name,
          picture: existingSession.picture,
          googleId: existingSession.googleId
        }
      });
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
    const masterCode = (CONFIG.MASTER_ADMIN_CODE || '').trim();
    if (!ownerGoogleEmail() && masterCode && code.trim().toUpperCase() === masterCode.toUpperCase()) {
      session = { role: 'owner', name, deviceId, expires: Date.now() + 8 * 3600000, ownerVersion: ownerVersion() };
    } else {
      return res.status(401).json({ success: false, message: 'Inicia sesión con Google para vincular el código a tu cuenta.' });
    }
    setSession(res, session);
    res.json({ ...publicSession(session), message: 'Acceso concedido.' });
  } catch {
    res.status(503).json({ success: false, message: 'Acceso no disponible. Comprueba Redis y SESSION_SECRET en el servidor.' });
  }
});

const handleCheckSession = async (req, res) => {
  try {
    const session = await currentSession(req);
    res.json(session ? publicSession(session) : { success: false, valid: false });
  } catch {
    res.json({ success: false, valid: false });
  }
};
router.get('/check-session', handleCheckSession);
router.post('/check-session', handleCheckSession);
router.get('/session', handleCheckSession);
router.post('/session', handleCheckSession);

router.post('/logout', async (req, res) => {
  const session = readSession(req);
  if (session) await storage.revokeSession(sessionIdentifier(session), Math.max(session.expires || 0, (session.issuedAt || 0) + 30 * 86400000));
  res.clearCookie('picks_session', { path: '/' });
  res.json({ success: true, message: 'Sesión finalizada.' });
});

router.post('/delete-account', async (req, res) => {
  const session = await currentSession(req);
  if (!session?.userId) return res.status(401).json({ success: false, message: 'Inicia sesión con la cuenta que deseas eliminar.' });
  const identity = await verifyGoogleToken(req.body?.credential);
  if (!identity || identity.email.toLowerCase() !== session.email?.toLowerCase()) {
    return res.status(403).json({ success: false, message: 'Confirma la misma cuenta de Google para eliminarla.' });
  }
  // Delete only this application's Firebase identity, never the Google account itself.
  const key = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyBgSdnJJMaR2yIJqk3mRUIbUSimn7e7Lj8';
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete?key=' + encodeURIComponent(key), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: req.body.credential }), signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return res.status(503).json({ success: false, message: 'No se pudo eliminar la identidad. Vuelve a confirmar tu cuenta e inténtalo otra vez.' });
  await storage.deleteUserData(session.userId);
  await storage.revokeSession(sessionIdentifier(session), Math.max(session.expires || 0, (session.issuedAt || 0) + 30 * 86400000));
  res.clearCookie('picks_session', { path: '/' });
  res.json({ success: true, message: 'Cuenta y datos de perfil eliminados de 777 Picks.' });
});

export default router;
