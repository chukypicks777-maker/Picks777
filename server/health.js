import { CONFIG } from './config.js';
import { redisConfigured, redisCommand } from './services/dataCache.js';
import { sportsDiagnostic } from './services/footballDataService.js';
import { getEffectiveAiConfig } from './services/aiService.js';

export async function readiness(req, res) {
  let storage = 'local-development';
  if (redisConfigured()) {
    try {
      if (await redisCommand('PING') === 'PONG') storage = 'redis';
    } catch {
      storage = 'redis-error';
    }
  } else if (process.env.VERCEL) {
    storage = 'serverless-memory';
  }
  const ready = Boolean(CONFIG.MASTER_ADMIN_CODE);
  let aiConfigured = false;
  try { aiConfigured = (await getEffectiveAiConfig()).isConfigured; } catch {}
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'configuration_required',
    appName: CONFIG.APP_NAME,
    storage,
    aiConfigured,
    sports: sportsDiagnostic(),
    timestamp: new Date().toISOString()
  });
}
