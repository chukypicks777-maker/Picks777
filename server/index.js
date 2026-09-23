import { protectMutations } from './security.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';
import { readiness } from './health.js';
import { requireSession } from './session.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import matchRoutes from './routes/matchRoutes.js';
import parlayRoutes from './routes/parlayRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import { getEffectiveAiConfig } from './services/aiService.js';
import { storage } from './storage.js';
const app = express();
app.disable('x-powered-by');
app.use('/api', protectMutations);
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'same-origin'); res.set('X-Frame-Options', 'DENY'); next(); });
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
app.get('/api/health', readiness);
app.use('/api/auth', authRoutes);
app.get('/api/community', async (req, res) => {
  res.json({ success: true, settings: await storage.getSocialSettings() });
});
app.get('/api/settings/active-model', async (req, res) => {
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
      provider: 'custom',
      selectedModel: 'deepseek-v4.1',
      modelName: 'DeepSeek V4.1 Flash',
      isConfigured: false
    });
  }
});
app.use('/api', requireSession);
app.use('/api/admin', adminRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/boost', (req, res, next) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  req.url = '/boost' + query;
  matchRoutes(req, res, next);
});
app.use('/api/goal', (req, res, next) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  req.url = '/goal' + query;
  matchRoutes(req, res, next);
});
app.use('/api/btts', (req, res, next) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  req.url = '/btts' + query;
  matchRoutes(req, res, next);
});
app.use('/api/parlays', parlayRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Endpoint no encontrado.' }));
const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (!process.env.VERCEL) {
  app.use(express.static(dist));
  app.use((req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(error.status === 400 ? 400 : 503).json({ success: false, message: error.status === 400 ? 'Petición inválida.' : 'Servicio no disponible temporalmente.' });
});
if (!process.env.VERCEL && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(CONFIG.PORT, () => console.log(`${CONFIG.APP_NAME}: http://localhost:${CONFIG.PORT}`));
}
export default app;
