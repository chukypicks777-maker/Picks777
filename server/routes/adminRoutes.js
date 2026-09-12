import express from 'express';
import { storage } from '../storage.js';
import { requireAdmin } from '../session.js';
const router = express.Router();
router.use(requireAdmin);
router.get('/codes', async (req, res) => {
  const codes = (await storage.getCodes()).map(({ devices = [], ...c }) => {
    const isExpired = Boolean(c.revoked || c.expiresAt && Date.parse(c.expiresAt) <= Date.now());
    return { ...c, deviceCount: devices.length, isExpired, daysRemaining: isExpired ? 0 : c.expiresAt ? Math.ceil((Date.parse(c.expiresAt) - Date.now()) / 86400000) : c.durationDays, status: isExpired ? 'EXPIRADO' : c.isClaimed ? 'ACTIVO' : 'DISPONIBLE' };
  });
  res.json({ success: true, codes, stats: { total: codes.length, active: codes.filter(c => c.status === 'ACTIVO').length, available: codes.filter(c => c.status === 'DISPONIBLE').length, expired: codes.filter(c => c.isExpired).length } });
});
router.post('/codes/create', async (req, res) => {
  try { res.json({ success: true, code: await storage.createCode(req.body) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});
router.post('/codes/batch', async (req, res) => {
  try { const codes = await storage.generateBatchCodes(req.body); res.json({ success: true, codes, count: codes.length }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});
router.delete('/codes/:code', async (req, res) => { await storage.deleteCode(req.params.code); res.json({ success: true }); });
router.post('/codes/:code/revoke', async (req, res) => { await storage.revokeCode(req.params.code); res.json({ success: true }); });
export default router;
