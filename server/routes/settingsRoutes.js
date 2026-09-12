import express from 'express';
import { CONFIG } from '../config.js';
import { requireAdmin } from '../session.js';
import { availableModels } from '../services/aiService.js';
const router = express.Router();
router.use(requireAdmin);
router.get('/', async (req, res) => {
  let models = [];
  try { models = await availableModels(); } catch { /* Configuration stays visible if the provider fails. */ }
  res.json({ success: true, settings: { selectedModel: CONFIG.DEFAULT_MODEL, apiKeyConfigured: Boolean(CONFIG.OPENROUTER_API_KEY), availableModels: models, modelAvailable: models.some(m => m.id === CONFIG.DEFAULT_MODEL), message: 'Configura OPENROUTER_MODEL y OPENROUTER_API_KEY en las variables del servidor. No se guardan claves desde el navegador.' } });
});
export default router;
