import express from 'express';
import { mobileAuth } from '../mobileAuth.js';
import { verifyGoogleToken, verifyAppleToken } from '../auth/googleVerifier.js';
import { rateLimit, consumeLimits, clientIdentity } from '../rateLimit.js';
const router = express.Router();
router.post('/start', rateLimit('auth'), async (req, res) => {
  try { res.json({ success: true, ...await mobileAuth.start(req.body?.challenge) }); }
  catch { res.status(503).json({ success: false, message: 'No se pudo preparar el acceso móvil.' }); }
});
router.post('/complete', rateLimit('auth'), async (req, res) => {
  const credential = req.body?.credential;
  const provider = req.body?.provider || 'google';
  if (!['google', 'apple'].includes(provider) || typeof credential !== 'string' || credential.length > 16000 || !await (provider === 'apple' ? verifyAppleToken : verifyGoogleToken)(credential)) {
    return res.status(400).json({ success: false, message: 'Identidad inválida.' });
  }
  if (!await mobileAuth.complete(req.body?.id, credential)) return res.status(410).json({ success: false, message: 'Solicitud vencida o ya utilizada. Vuelve a la app e inténtalo otra vez.' });
  res.json({ success: true });
});
router.post('/poll', async (req, res) => {
  const limit = await consumeLimits([{ key: 'mobile-poll:' + clientIdentity(req), limit: 600, windowMs: 300000 }]);
  if (!limit.allowed) return res.status(429).json({ success: false, message: 'Espera unos minutos antes de reintentar.' });
  const credential = await mobileAuth.consume(req.body?.id, req.body?.verifier);
  if (!credential) return res.status(410).json({ success: false, message: 'El acceso móvil venció. Vuelve a intentarlo.' });
  res.json(credential === 'pending' ? { success: true, pending: true } : { success: true, credential });
});
export default router;
