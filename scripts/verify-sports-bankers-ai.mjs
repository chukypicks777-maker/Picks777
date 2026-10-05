// Real provider verification. No users, membership or credentials are changed.
import fs from 'node:fs/promises';
import { getSportsBankerCandidates, getSportsMatch } from '../server/services/sportsDataService.js';
import { generateAiSportsReport } from '../server/services/sportsAiService.js';
import { getEffectiveAiConfig } from '../server/services/aiService.js';
import { rankSportWinners } from '../src/utils/sportPicks.js';

const keepAlive = setInterval(() => {}, 1000), checks = [], samples = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
try {
  const config = await getEffectiveAiConfig();
  const results = [];
  for (const sport of ['beisbol', 'tenis', 'basquetbol']) {
    const started = Date.now(), pool = await getSportsBankerCandidates(sport), ranked = rankSportWinners(pool.matches);
    check(`${sport}:maximum-ten`, ranked.length <= 10);
    check(`${sport}:unique`, new Set(ranked.map(match => match.id)).size === ranked.length);
    check(`${sport}:descending`, ranked.every((match, index) => index === 0 || ranked[index - 1].bankerPick.probability >= match.bankerPick.probability));
    check(`${sport}:only-upcoming`, ranked.every(match => match.status === 'SCHEDULED' && Date.parse(match.kickoff) > Date.now()));
    samples.push({ sport, milliseconds: Date.now() - started, examined: pool.ranking.examined, estimable: pool.ranking.available,
      top10: ranked.map(match => ({ id: match.id, rank: match.bankerRank, selection: match.bankerPick.selection, probability: match.bankerPick.probability, kickoff: match.kickoff, sourceUrl: match.sourceUrl })) });
    results.push({ sport, match: ranked[0] || pool.matches[0] });
  }
  for (const { sport, match } of results) {
    if (!match) continue;
    const detail = await getSportsMatch(sport, match.id, { leagueId: match.leagueId });
    if (sport === 'tenis') for (const side of ['home', 'away']) {
      const team = detail[`${side}Team`];
      if (team.logo) {
        const response = await fetch(team.logo, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
        check(`${sport}:${side}:published-image`, response.ok && response.headers.get('content-type')?.startsWith('image/'));
        samples.push({ sport, side, identity: team.name, imageKind: team.imageKind, image: team.logo, imageStatus: response.status });
      }
    }
    if (!config.isConfigured) { samples.push({ sport, aiAvailable: false, note: 'No configured local provider; none simulated.' }); continue; }
    const report = await generateAiSportsReport(detail, { deadline: Date.now() + 45000 });
    check(`${sport}:ai-confirmed`, report.aiAvailable && report.dataGrounded && report.modelUsed);
    check(`${sport}:probabilities-unchanged`, JSON.stringify(report.probabilities) === JSON.stringify(detail.analysis.winner));
    check(`${sport}:facts-only`, report.tacticalKeypoints?.every(fact => report.facts.includes(fact)));
    samples.push({ sport, matchId: detail.id, aiAvailable: report.aiAvailable, modelUsed: report.modelUsed, aiStatus: report.aiStatus, generatedAt: report.generatedAt, probabilities: report.probabilities });
  }
  const report = { checkedAt: new Date().toISOString(), pass: checks.every(check => check.pass), aiConfigured: config.isConfigured, configuredModel: config.selectedModel, checks, samples,
    limitations: ['Only forecasts with sufficient real data enter Banqueros.', 'AI selects source facts; it cannot alter estimates or invent observations.', 'Provider pictures may be unavailable; country flags are explicitly identified as flags.', 'Prospective predictive accuracy remains unvalidated.'] };
  await fs.writeFile('artifacts/sports-bankers-ai-live-2026-10-05.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally { clearInterval(keepAlive); }
