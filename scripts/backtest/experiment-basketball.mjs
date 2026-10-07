// NBA 2025-26 walk-forward: current margin model versus the same model with a
// home-court term estimated from earlier games only.
import { basketballAnalysis, normalCdf } from '../../server/services/sportProbabilityModel.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const months = ['202510', '202511', '202512', '202601', '202602', '202603', '202604'];
const games = [];
for (const month of months) {
  const data = await (await fetch(`${BASE}?dates=${month}&limit=1000`)).json();
  for (const e of data.events || []) {
    const c = e.competitions?.[0], h = c?.competitors?.find(t => t.homeAway === 'home'), a = c?.competitors?.find(t => t.homeAway === 'away');
    if (!e.status?.type?.completed || e.season?.type !== 2 || !h || !a) continue;
    games.push({ id: e.id, sport: 'basquetbol', leagueId: 'nba', status: 'FINISHED', kickoff: e.date, homeTeam: { id: h.team.id, name: h.team.displayName }, awayTeam: { id: a.team.id, name: a.team.displayName },
      finalScore: { home: Number(h.score), away: Number(a.score) } });
  }
}
games.sort((x, y) => Date.parse(x.kickoff) - Date.parse(y.kickoff));
const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
const metrics = {};
const add = (name, p, won) => { const m = metrics[name] ||= { n: 0, loss: 0, brier: 0, hits: 0 }; m.n++; m.loss += ll(won ? p : 1 - p); m.brier += (p - Number(won)) ** 2; m.hits += Number((p >= 0.5) === won); };
for (const g of games) {
  const time = Date.parse(g.kickoff), prior = games.filter(x => Date.parse(x.kickoff) < time - 6 * 3600000);
  if (prior.length < 100) continue;
  const a = basketballAnalysis({ ...g, status: 'SCHEDULED', odds: {} }, prior, time);
  if (a.winner.home == null) continue;
  const won = g.finalScore.home > g.finalScore.away, margin = g.finalScore.home - g.finalScore.away;
  add('current.winner', a.winner.home / 100, won);
  // Home-court advantage from earlier games, shrunk toward zero with 30 virtual games.
  const homeEdge = prior.reduce((s, x) => s + x.finalScore.home - x.finalScore.away, 0) / (prior.length + 30);
  // Recover the model's mean and spread from two handicap lines.
  const p1 = a.handicaps.home.find(r => r.line === 1.5).probability / 100, p2 = a.handicaps.home.find(r => r.line === -1.5).probability / 100;
  const inv = p => { let lo = -8, hi = 8; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (normalCdf(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
  const z1 = inv(Math.min(0.9999, Math.max(0.0001, p1))), z2 = inv(Math.min(0.9999, Math.max(0.0001, p2)));
  const deviation = 3 / (z1 - z2), mean = z1 * deviation - 1.5;
  for (const [name, edge] of [['home.full', homeEdge], ['home.half', homeEdge / 2]]) {
    add(`${name}.winner`, normalCdf((mean + edge) / deviation), won);
    for (const line of [5.5, -5.5]) add(`${name}.cover${line}`, normalCdf((mean + edge + line) / deviation), margin + line > 0);
  }
  for (const line of [5.5, -5.5]) add(`current.cover${line}`, a.handicaps.home.find(r => r.line === line).probability / 100, margin + line > 0);
}
console.log('NBA regular season games', games.length);
for (const [name, m] of Object.entries(metrics)) console.log(name.padEnd(22), 'n', m.n, 'acc', (m.hits / m.n * 100).toFixed(1), 'brier', (m.brier / m.n).toFixed(4), 'logloss', (m.loss / m.n).toFixed(4));
