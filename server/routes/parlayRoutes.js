import express from 'express';
import { calculateParlay, getAiDailyParlay } from '../services/parlayEngine.js';
import { generateMatches } from '../services/footballDataService.js';
const router = express.Router();
router.get('/daily-ai', async (req, res) => res.json({ success: true, ...getAiDailyParlay(await generateMatches()) }));
router.post('/calculate', (req, res) => {
  const { legs, stake } = req.body || {};
  try { res.json({ success: true, calculation: calculateParlay(legs, stake) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});
export default router;
