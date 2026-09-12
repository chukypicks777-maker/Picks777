import express from 'express';
import { randomUUID } from 'node:crypto';
import { CONFIG } from '../config.js';
import { storage } from '../storage.js';
import { currentSession, readSession, setSession, ownerVersion } from '../session.js';
import { rateLimit } from '../rateLimit.js';
const router = express.Router();
router.use('/verify-code', rateLimit('auth'));
function publicSession(session) {
  return { success: true, valid: true, isAdmin: session.role === 'owner', role: session.role,
    user: { name: session.name, username: session.name, expiresAt: new Date(session.expires).toISOString(), daysRemaining: Math.ceil((session.expires - Date.now()) / 86400000), plan: session.role === 'owner' ? 'Owner' : 'VIP' } };
}
router.post('/verify-code', async (req, res) => {
  try {
    const { code, username } = req.body;
    if (typeof code !== 'string' || !code.trim() || code.length > 128) return res.status(400).json({ success: false, message: 'Ingresa un código válido.' });
    const name = String(username || 'Usuario VIP').trim().slice(0, 80);
    const deviceId = readSession(req)?.deviceId || randomUUID();
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
  res.json({ success: true });
});
export default router;
