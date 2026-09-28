import { CONFIG, secureConfiguration, ownerGoogleEmail } from './config.js';
import { redisConfigured, redisCommand } from './services/dataCache.js';
import { sportsDiagnostic } from './services/footballDataService.js';
import { getEffectiveAiConfig } from './services/aiService.js';

export async function readiness(req, res) {
  let storage = 'local-development';
  if (redisConfigured()) {
    storage = 'redis-error';
    try {
      if (await redisCommand('PING') === 'PONG') storage = 'redis';
    } catch {
      storage = 'redis-error';
    }
  } else if (process.env.VERCEL) {
    storage = 'serverless-memory';
  }
  const ready = secureConfiguration() && Boolean(ownerGoogleEmail() || CONFIG.MASTER_ADMIN_CODE) && storage !== 'redis-error' && storage !== 'serverless-memory';
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
