// Read-only provider audit. Its output is evidence, never application seed data.
import fs from 'node:fs/promises';
process.env.NODE_ENV = 'test';
process.env.UPSTASH_REDIS_REST_URL = '';
process.env.UPSTASH_REDIS_REST_TOKEN = '';
const { getFootballFeed, enrichMatchWithRealData } = await import('../server/services/footballDataService.js');
const { readHistoricalSummary } = await import('../server/services/verifiedStats.js');
const feed = await getFootballFeed();
const checked = [], failures = [];
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
  feedMatches: feed.matches.length, scheduledMatches: scheduled.length, checked, failures,
  limitation: 'Cross-check against fresh responses from the same provider, not independent confirmation or predictive-accuracy calibration.' };
await fs.mkdir('artifacts', { recursive: true });
await fs.writeFile('artifacts/live-data-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ feedMatches: report.feedMatches, checked: checked.length, metrics: checked.flatMap(c => c.checks).length, failures, halvesAvailable: checked.filter(c => c.halvesAvailable).length }));
if (failures.length || !checked.length) process.exitCode = 1;
