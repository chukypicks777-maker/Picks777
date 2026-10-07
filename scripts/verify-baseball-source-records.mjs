// Independent official game endpoints verify the observations behind the
// corrected match, including inning-by-inning scoring and market arithmetic.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { getSportsHistory, getSportsFeed } from '../server/services/sportsDataService.js';
import { countForecast, countLines, combinedCount } from '../server/services/baseballCountModel.js';

const now = Date.now();
const { games } = await getSportsHistory('beisbol', now, { leagueId: 'mlb' });
const feed = await getSportsFeed('beisbol', { leagueId: 'mlb' });
const match = feed.matches.find(match => ['SCHEDULED', 'LIVE'].includes(match.status) && match.analysis.probabilitySource === 'published-odds' && /Padres/.test(match.homeTeam.name) && /Brewers/.test(match.awayTeam.name))
  || feed.matches.find(match => ['SCHEDULED', 'LIVE'].includes(match.status) && match.analysis.probabilitySource === 'published-odds');
assert.ok(match, 'Debe existir un encuentro real con cuotas para verificar.');
const byId = new Map(games.map(game => [game.id, game]));
const records = [...new Set([...match.analysis.records.home, ...match.analysis.records.away].map(record => record.id))].map(id => byId.get(id));
const observations = [], direct = new Map();
let cursor = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < records.length) {
    const game = records[cursor++];
    const url = `https://statsapi.mlb.com/api/v1/game/${game.providerEventId}/linescore`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, 'La observación debe poder verificarse en MLB.');
    const data = await response.json();
    for (const side of ['home', 'away']) assert.equal(data.teams[side].runs, game.finalScore[side], `${game.id}: marcador final ${side}`);
    const innings = data.innings.map(inning => ({ num: inning.num, home: inning.home?.runs ?? null, away: inning.away?.runs ?? null }));
    assert.deepEqual(innings, game.inningScores, `${game.id}: innings distintos de los datos usados`);
    assert.equal(data.currentInning, game.lastInning);
    direct.set(game.id, { ...game, finalScore: { home: data.teams.home.runs, away: data.teams.away.runs }, inningScores: innings });
    observations.push({ id: game.id, sourceUrl: url, finalScore: game.finalScore, inningsChecked: innings.length, verified: true });
  }
}));

const periodSample = side => match.analysis.records[side].flatMap(record => {
  const game = direct.get(record.id);
  const ownSide = game.homeTeam.id === match[`${side}Team`].id ? 'home' : 'away';
  const innings = game.inningScores.slice(0, 5);
  if (innings.length !== 5 || innings.some(inning => !Number.isInteger(inning.home) || !Number.isInteger(inning.away))) return [];
  return [{ id: game.id, own: innings.reduce((sum, inning) => sum + inning[ownSide], 0), against: innings.reduce((sum, inning) => sum + inning[ownSide === 'home' ? 'away' : 'home'], 0) }];
});
const home = periodSample('home'), away = periodSample('away');
const common = away.filter(game => home.some(other => other.id === game.id)).length;
const h = countForecast(home.map(game => game.own), away.map(game => game.against), common);
const a = countForecast(away.map(game => game.own), home.map(game => game.against), common);
const verifiedFive = countLines(combinedCount(h, a), match.analysis.firstFive.map(row => row.line));
assert.deepEqual(verifiedFive, match.analysis.firstFive, 'F5 debe coincidir al recalcular desde endpoints independientes.');
if (match.analysis.probabilitySource === 'published-odds') {
  const impliedHome = (1 / match.odds.homeWin) / (1 / match.odds.homeWin + 1 / match.odds.awayWin) * 100;
  assert.ok(Math.abs(impliedHome - match.analysis.winner.home) <= 0.05);
}
const report = { checkedAt: new Date(now).toISOString(), pass: true, matchId: match.id, teams: [match.homeTeam.name, match.awayTeam.name],
  winner: match.analysis.winner, odds: match.odds, verifiedRecords: observations.length, observations: observations.sort((a, b) => a.id.localeCompare(b.id)),
  firstFiveIndependentlyRecalculated: verifiedFive, limitations: 'Independent MLB endpoints confirm source consistency; this cannot rule out errors within MLB or establish future predictive accuracy.' };
await fs.writeFile('artifacts/probability-source-verification-2026-10-06.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: true, matchId: match.id, verifiedRecords: observations.length, winner: match.analysis.winner, firstFive: verifiedFive }));
