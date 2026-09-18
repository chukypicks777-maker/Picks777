import express from 'express';
import { requireAdmin } from '../session.js';
import { storage, maskApiKey } from '../storage.js';
import { fetchProviderModels, testAiConnection, getEffectiveAiConfig } from '../services/aiService.js';
import { clearCachePattern } from '../services/dataCache.js';
import { validateAiConfig } from '../security.js';

const router = express.Router();

// GET /api/settings/active-model - Retorna el modelo activo públicamente para la interfaz de partidos
router.get('/active-model', async (req, res) => {
  try {
    const config = await getEffectiveAiConfig();
    res.json({
      success: true,
      provider: config.provider,
      selectedModel: config.selectedModel,
      modelName: config.modelName || config.selectedModel,
      isConfigured: config.isConfigured
    });
  } catch {
    res.json({
      success: true,
      provider: 'openrouter',
      selectedModel: 'nvidia/nemotron-3.5-lightning:free',
      modelName: 'nvidia/nemotron-3.5-lightning:free',
      isConfigured: false
    });
  }
});

router.use(requireAdmin);

router.get('/groups', async (req, res) => {
  res.json({ success: true, settings: await storage.getSocialSettings() });
});
router.post('/groups', async (req, res) => {
  try {
    const settings = await storage.updateSocialSettings(req.body?.links, req.body?.revision);
    res.json({ success: true, settings });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// GET /api/settings - Retorna la configuración activa
router.get('/', async (req, res) => {
  try {
    const config = await getEffectiveAiConfig();
    res.json({
      success: true,
      settings: {
        provider: config.provider,
        baseUrl: config.baseUrl,
        selectedModel: config.selectedModel,
        modelName: config.modelName,
        apiKeyMasked: maskApiKey(config.apiKey),
        isConfigured: config.isConfigured,
        updatedAt: config.updatedAt
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error al consultar la configuración de IA.' });
  }
});

// GET /api/settings/models - Consulta la lista de modelos reales del proveedor
router.post('/models', async (req, res) => {
  try {
    const current = await getEffectiveAiConfig();
    const provider = req.body?.provider || current.provider || 'openrouter';
    const apiKey = req.body?.apiKey || (provider === current.provider ? current.apiKey : '');
    const baseUrl = req.body?.baseUrl || current.baseUrl || '';

    const models = await fetchProviderModels(provider, apiKey, baseUrl);
    res.json({
      success: true,
      provider,
      count: models.length,
      models
    });
  } catch {
    res.status(500).json({ success: false, message: 'Error al consultar modelos del proveedor.' });
  }
});

// POST /api/settings/update - Guarda la configuración de IA de forma segura
router.post('/update', async (req, res) => {
  try {
    const { provider, apiKey, baseUrl, selectedModel, modelName } = validateAiConfig(req.body);
    const updated = await storage.updateAiConfig({
      provider,
      apiKey: apiKey !== undefined && apiKey !== null && apiKey !== '' ? apiKey.trim() : undefined,
      baseUrl,
      selectedModel,
      modelName
    });

    // Limpia el caché de reportes previos para que usen el nuevo motor
    clearCachePattern('ai:');

    res.json({
      success: true,
      message: 'Configuración del motor de IA guardada exitosamente.',
      settings: {
        provider: updated.provider,
        baseUrl: updated.baseUrl,
        selectedModel: updated.selectedModel,
        modelName: updated.modelName,
        apiKeyMasked: maskApiKey(updated.apiKey),
        isConfigured: Boolean(updated.apiKey && updated.apiKey.length >= 4),
        updatedAt: updated.updatedAt
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || 'Configuración inválida. Revisa proveedor, URL HTTPS y modelo.' });
  }
});

// POST /api/settings/test - Realiza un ping/test de conexión en vivo con la clave y modelo
router.post('/test', async (req, res) => {
  try {
    const current = await getEffectiveAiConfig();
    const provider = req.body?.provider || current.provider || 'openrouter';
    const apiKey = req.body?.apiKey || (provider === current.provider ? current.apiKey : '');
    const baseUrl = req.body?.baseUrl || current.baseUrl || '';
    const selectedModel = req.body?.selectedModel || current.selectedModel || '';

    const result = await testAiConnection({ provider, apiKey, baseUrl, selectedModel });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || 'No se pudo conectar con el proveedor autorizado.' });
  }
});

// POST /api/settings/cache/clear - Limpia el caché de IA
router.post('/cache/clear', (req, res) => {
  clearCachePattern('ai:');
  clearCachePattern('models:');
  res.json({ success: true, message: 'Caché de IA limpiado exitosamente.' });
});

export default router;
