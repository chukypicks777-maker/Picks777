import fs from 'node:fs/promises';
import { SPORT_LEAGUES } from '../src/constants/leagues.js';
import { getMlbLeague } from '../server/services/baseballDataService.js';
import { baseballAnalysis, observedExtraInnings } from '../server/services/sportProbabilityModel.js';

const now = Date.now(), today = new Date(now).toISOString().slice(0, 10);
const checks = [], samples = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
const keepAlive = setInterval(() => {}, 1000);
try {
  for (const league of SPORT_LEAGUES.beisbol.filter(league => ['mlb', 'lmb'].includes(league.id))) {
    const feed = await getMlbLeague(league, today);
    check(`${league.id}:real-calendar`, Array.isArray(feed.matches) && Number.isFinite(Date.parse(feed.fetchedAt)));
    // Mirror the feed's identity normalization: resumed games may occur on two calendar dates.
    const games = [...new Map(feed.matches.map(game => [game.id, game])).values()];
    const match = games.filter(game => game.status === 'SCHEDULED' && Date.parse(game.kickoff) > now).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))[0]
      || games.filter(game => game.status === 'FINISHED').sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))[0];
    if (!match) { samples.push({ league: league.id, matches: feed.matches.length, fetchedAt: feed.fetchedAt, note: 'Valid empty provider calendar; no fixture substituted.' }); continue; }
    const analysis = baseballAnalysis(match, games, now);
    check(`${league.id}:total-lines`, JSON.stringify(analysis.totalRuns.map(row => row.line)) === JSON.stringify([1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5]));
    for (let i = 0; i < analysis.totalRuns.length; i++) {
      const row = analysis.totalRuns[i];
      check(`${league.id}:total:${row.line}:range-and-complement`, row.over === null && row.under === null || row.over >= 0 && row.over <= 100 && row.under >= 0 && row.under <= 100 && Math.abs(row.over + row.under - 100) < 0.01);
      if (i && row.over !== null) check(`${league.id}:total:${row.line}:monotonic`, row.over <= analysis.totalRuns[i - 1].over);
    }
    const records = ['home', 'away'].map(side => games.filter(game => game.id !== match.id && game.status === 'FINISHED'
      && Date.parse(game.kickoff) < Math.min(Date.parse(match.kickoff), now) && [game.homeTeam.id, game.awayTeam.id].includes(match[`${side}Team`].id)
      && ['home', 'away'].every(team => Number.isInteger(game.finalScore?.[team]) && game.finalScore[team] >= 0))
      .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff)).slice(0, 20)
      .filter(game => game.scheduledInnings === match.scheduledInnings && observedExtraInnings(game) !== null));
    const unique = [...new Map(records.flat().map(game => [game.id, game])).values()];
    const occurred = unique.filter(game => observedExtraInnings(game)).length;
    check(`${league.id}:extra-samples`, analysis.extraInningsSampleSize.home === records[0].length && analysis.extraInningsSampleSize.away === records[1].length
      && analysis.extraInningsSampleSize.uniqueGames === unique.length && analysis.extraInningsSampleSize.extraGames === occurred);
    if (Number.isInteger(match.scheduledInnings) && records.every(team => team.length >= 5)) {
      check(`${league.id}:extra-complement`, Math.abs(analysis.extraInnings.yes + analysis.extraInnings.no - 100) < 0.01);
      check(`${league.id}:extra-reproducible-frequency`, Math.abs(analysis.extraInnings.yes - (occurred + 0.5) / (unique.length + 1) * 100) <= 0.051);
    } else check(`${league.id}:no-invented-extra-probability`, analysis.extraInnings.yes === null && analysis.extraInnings.no === null);
    samples.push({ league: league.id, id: match.id, teams: [match.homeTeam.name, match.awayTeam.name], status: match.status, sourceUrl: match.sourceUrl,
      fetchedAt: feed.fetchedAt, scheduledInnings: match.scheduledInnings, totalRuns: analysis.totalRuns, extraInnings: analysis.extraInnings,
      extraInningsSampleSize: analysis.extraInningsSampleSize, observedRecords: unique.map(game => ({ id: game.id, date: game.kickoff, sourceUrl: game.sourceUrl,
        scheduledInnings: game.scheduledInnings, lastInning: game.lastInning, finalScore: game.finalScore, extraInnings: observedExtraInnings(game) })) });
  }
  const report = { checkedAt: new Date().toISOString(), pass: checks.every(item => item.pass), checks, samples,
    limitations: ['Totals mean the complete game including extra innings, not just runs scored in extra innings.',
      'Extra innings use a smoothed observed frequency, not a validated predictive success rate.',
      'NPB/KBO lack verified regulation-duration metadata in this integration; their extra-innings probabilities remain unavailable.',
      'Provider records are not independently guaranteed ground truth; fetchedAt is consultation time.'] };
  await fs.mkdir('artifacts', { recursive: true });
  await fs.writeFile('artifacts/baseball-extra-innings-live-verification-2026-10-05.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, checks: checks.length, samples: samples.map(sample => ({ league: sample.league, id: sample.id, extraInnings: sample.extraInnings, sample: sample.extraInningsSampleSize })) }, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally { clearInterval(keepAlive); }
