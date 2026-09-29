// Explicit live audit: uses the configured provider and may consume its normal API quota.
import fs from 'node:fs/promises';
import { getFootballFeed } from '../server/services/footballDataService.js';
import { getEffectiveAiConfig, generateAiMatchReport } from '../server/services/aiService.js';
import { getTop3Opportunities } from '../src/utils/mathProbabilities.js';
const config = await getEffectiveAiConfig();
if (!config.isConfigured) throw new Error('Configura el proveedor de IA antes de esta auditoría.');
const feed = await getFootballFeed();
const checks = [];
for (const match of feed.matches) {
  const report = await generateAiMatchReport(match, { forceRefresh: true });
  const errors = [];
  const warnings = [];
  if (!report.aiAvailable) errors.push('ai-unavailable');
  if (report.aiAvailable && report.modelUsed !== config.selectedModel) warnings.push('fallback-model');
  const probabilities = match.model?.probabilities || match.probabilities;
  if (JSON.stringify(report.probabilities) !== JSON.stringify(probabilities)) errors.push('probability-mismatch');
  if (report.predictedScore !== (match.model?.predictedScore ?? match.probabilities?.predictedScore ?? null)) errors.push('score-mismatch');
  if (JSON.stringify(report.topPick) !== JSON.stringify(getTop3Opportunities(match)[0] ?? null)) errors.push('pick-mismatch');
  if (report.aiAvailable && report.analysisMode !== 'fact-selection') errors.push('ungrounded-mode');
  if (report.aiAvailable && report.tacticalKeypoints.some(text => !report.facts.includes(text))) errors.push('unsupported-fact');
  checks.push({ id: match.id, title: `${match.homeTeam.name} vs ${match.awayTeam.name}`, status: match.status, sourceUrl: match.sourceUrl, aiAvailable: report.aiAvailable, model: report.modelUsed, errors, warnings, report });
  await fs.writeFile('artifacts/real-ai-reports.json', JSON.stringify({ checkedAt: new Date().toISOString(), total: feed.matches.length, checked: checks.length, provider: config.provider, checks }, null, 2));
  console.log(JSON.stringify({ completed: checks.length, total: feed.matches.length, id: match.id, errors, warnings }));
}
if (!checks.length || checks.some(check => check.errors.length)) process.exitCode = 1;
