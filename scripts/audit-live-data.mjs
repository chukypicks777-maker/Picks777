// Read-only provider audit. Its output is evidence, never application seed data.
import fs from 'node:fs/promises';
process.env.NODE_ENV = 'test';
process.env.UPSTASH_REDIS_REST_URL = '';
process.env.UPSTASH_REDIS_REST_TOKEN = '';
process.env.KV_REST_API_URL = '';
process.env.KV_REST_API_TOKEN = '';
const { getFootballFeed, enrichMatchWithRealData } = await import('../server/services/footballDataService.js');
const { readHistoricalSummary } = await import('../server/services/verifiedStats.js');
const feed = await getFootballFeed();
const checked = [], failures = [];
const consistency = [];
for (const match of feed.matches) {
  const p = match.model?.probabilities || match.probabilities || {};
  const errors = [];
  for (const [key, value] of Object.entries(p)) {
    if (key === 'predictedScore' || value == null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) errors.push('range:' + key);
  }
  if (['homeWin','draw','awayWin'].every(k => Number.isFinite(p[k])) && Math.abs(p.homeWin + p.draw + p.awayWin - 100) > 1e-6) errors.push('1x2-sum');
  for (const [a,b] of [['over05','under05'],['over15','under15'],['over25','under25'],['over35','under35'],['over45','under45'],['bttsYes','bttsNo']]) {
    if (Number.isFinite(p[a]) && Number.isFinite(p[b]) && Math.abs(p[a] + p[b] - 100) > 1e-6) errors.push('complement:' + a);
  }
  const ladder = ['over05','over15','over25','over35','over45'].map(k => p[k]).filter(Number.isFinite);
  if (ladder.some((value,i) => i > 0 && value > ladder[i - 1] + 1e-6)) errors.push('goal-ladder');
  if (Number.isFinite(p.bttsYes) && Number.isFinite(p.over15) && p.bttsYes > p.over15 + 1e-6) errors.push('btts-subset');
  for (const [key,value] of Object.entries(match.odds || {})) if (value !== null && (!Number.isFinite(value) || value <= 1)) errors.push('odds:' + key);
  if (!match.sourceUrl || !Number.isFinite(Date.parse(match.fetchedAt))) errors.push('provenance');
  consistency.push({ id: match.id, errors });
  failures.push(...errors.map(error => match.id + ':' + error));
}
const scheduled = feed.matches.filter(m => m.status === 'SCHEDULED');
for (const match of [...scheduled.filter(m => m.model).slice(0, 2), ...scheduled.filter(m => !m.model).slice(0, 1)]) {
  const detail = await enrichMatchWithRealData(match);
  const checks = [];
  for (const team of [detail.homeTeam, detail.awayTeam]) {
    const observed = [];
    for (const record of team.statsRecords || []) {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${match.espnCode}/summary?event=${record.id}`;
      const data = await (await fetch(url)).json();
      const parsed = readHistoricalSummary(data, team.id, Math.min(Date.now(), Date.parse(match.kickoff)));
      if (parsed) observed.push(parsed);
    }
    for (const [field, key] of [['avgCorners', 'corners'], ['avgYellowCards', 'cards'], ['avgFouls', 'fouls']]) {
      const values = observed.map(r => r[key]).filter(Number.isFinite);
      const mean = values.length >= 5 ? values.reduce((a, b) => a + b, 0) / values.length : null;
      const pass = mean === null ? team[field] === null : Math.abs(mean - team[field]) < 1e-9;
      checks.push({ team: team.name, metric: field, count: values.length, reported: team[field], recomputed: mean, pass });
      if (!pass) failures.push(`${match.id}:${team.id}:${field}`);
    }
  }
  checked.push({ id: match.id, title: `${match.homeTeam.name} vs ${match.awayTeam.name}`, kickoff: match.kickoff, sourceUrl: match.sourceUrl,
    modelSample: match.model?.sampleSize ?? null, halvesAvailable: Boolean(detail.halfGoals), halfSample: detail.halfGoals?.sampleSize ?? null, checks });
}
const report = { checkedAt: new Date().toISOString(), source: feed.source, coverage: feed.coverage,
  feedMatches: feed.matches.length, scheduledMatches: scheduled.length, consistency, checked, failures,
  limitation: 'Cross-check against fresh responses from the same provider, not independent confirmation or predictive-accuracy calibration.' };
await fs.mkdir('artifacts', { recursive: true });
await fs.writeFile('artifacts/live-data-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ feedMatches: report.feedMatches, checked: checked.length, metrics: checked.flatMap(c => c.checks).length, failures, halvesAvailable: checked.filter(c => c.halvesAvailable).length }));
if (failures.length || !checked.length) process.exitCode = 1;
