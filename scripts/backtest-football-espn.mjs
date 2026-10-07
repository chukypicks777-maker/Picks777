// Walk-forward check on ESPN league histories (also covers Liga MX, MLS and the
// Champions League, which football-data.co.uk does not provide with corners).
// 2025 results warm the ratings; every 2026 forecast uses earlier days only.
// Usage: node --import ./tests/setup.js scripts/backtest-football-espn.mjs
import fs from 'node:fs/promises';
import { parseHistoryEvent } from '../server/services/footballHistory.js';
import { applyLegacyFootballForecast } from '../server/services/probabilityModel.js';
import { totalLines } from '../src/utils/probability.js';
import * as fm from '../src/utils/footballModel.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const LEAGUES = { 'mex.1': 'Liga MX', 'usa.1': 'MLS', 'uefa.champions': 'UEFA Champions League', 'eng.1': 'Premier League', 'esp.1': 'LaLiga', 'ita.1': 'Serie A', 'fra.1': 'Ligue 1' };
const DAY = 86400000, TEST_FROM = Date.parse('2026-01-01T00:00:00Z');
const ll = p => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)));
const score = () => ({ n: 0, loss: 0, brier: 0, hits: 0 });
const add = (m, p, happened) => { const q = happened ? p : 1 - p; m.n++; m.loss += ll(q); m.brier += (p - Number(happened)) ** 2; m.hits += Number((p >= 0.5) === happened); };
const add3 = (m, probs, index) => { m.n++; m.loss += ll(probs[index]); m.brier += probs.reduce((s, p, i) => s + (p - Number(i === index)) ** 2, 0); m.hits += Number(probs.indexOf(Math.max(...probs)) === index); };
const show = m => m.n ? { n: m.n, accuracy: +(m.hits / m.n * 100).toFixed(1), brier: +(m.brier / m.n).toFixed(4), logLoss: +(m.loss / m.n).toFixed(4) } : null;

const report = {};
for (const [code, name] of Object.entries(LEAGUES)) {
  const responses = await Promise.all([2025, 2026].map(year => fetch(`${BASE}/${code}/scoreboard?dates=${year}&limit=1000`).then(r => r.json())));
  const rows = [...new Map(responses.flatMap(d => (d.events || []).map(parseHistoryEvent).filter(Boolean)).map(r => [r.id, r])).values()].sort((a, b) => a.time - b.time);
  // Odds of completed events are the provider's last published prices.
  const odds = new Map(responses.flatMap(d => (d.events || []).map(e => {
    const o = e.competitions?.[0]?.odds?.[0];
    const dec = v => { const n = Number(v); return Number.isFinite(n) && Math.abs(n) >= 100 ? (n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n)) : null; };
    const side = s => dec(o?.moneyline?.[s]?.close?.odds ?? o?.moneyline?.[s]?.open?.odds);
    return [String(e.id), o ? { homeWin: side('home'), draw: dec(o?.moneyline?.draw?.close?.odds ?? o?.drawOdds?.moneyLine), awayWin: side('away') } : null];
  })));
  const seasonStart = Date.parse(responses[1]?.leagues?.[0]?.season?.startDate);
  const m = { stat1x2: score(), statOld1x2: score(), market1x2: score(), statO25: score(), statOldO25: score(), marketO25: score(),
    cornersNew85: score(), cornersOld85: score(), cornersNew95: score(), cornersOld95: score(), cardsNew35: score(), cardsOld35: score() };
  const days = [...new Set(rows.filter(r => r.time >= TEST_FROM).map(r => Math.floor(r.time / DAY) * DAY))];
  for (const day of days) {
    const history = rows.filter(r => r.time < day);
    if (history.length < 60) continue;
    const fits = fm.fitFootballLeague(history, { asOf: day, seasonStart: Number.isFinite(seasonStart) && seasonStart < day ? seasonStart : null });
    for (const g of rows.filter(r => r.time >= day && r.time < day + DAY)) {
      const outcome = g.hg > g.ag ? 0 : g.hg === g.ag ? 1 : 2;
      // Previous production: season-to-date Poisson and last-ten averages.
      const season = history.filter(r => !Number.isFinite(seasonStart) || r.time >= seasonStart);
      const team = id => {
        const own = season.filter(r => r.home === id || r.away === id), last = history.filter(r => r.home === id || r.away === id).slice(-10);
        const avg = pick => { const v = last.map(pick).filter(Number.isFinite); return v.length >= 5 ? v.reduce((a, b) => a + b, 0) / v.length : null; };
        return { id, gamesPlayed: own.length, goalsFor: own.reduce((s, r) => s + (r.home === id ? r.hg : r.ag), 0), goalsAgainst: own.reduce((s, r) => s + (r.home === id ? r.ag : r.hg), 0),
          corners: avg(r => r.home === id ? r.hc : r.ac), cards: avg(r => r.home === id ? r.hy : r.ay) };
      };
      const home = team(g.home), away = team(g.away);
      const old = applyLegacyFootballForecast({ id: g.id, status: 'SCHEDULED', kickoff: new Date(g.time).toISOString(), homeTeam: home, awayTeam: away, odds: {}, espnCode: 'backtest' });
      const next = fm.forecastFootball(fits, g.home, g.away, {});
      if (old.model?.probabilities?.homeWin != null && next) {
        const o = old.model.probabilities, n = next.probabilities;
        add3(m.statOld1x2, [o.homeWin, o.draw, o.awayWin].map(v => v / 100), outcome);
        add3(m.stat1x2, [n.homeWin, n.draw, n.awayWin].map(v => v / 100), outcome);
        add(m.statOldO25, o.over25 / 100, g.hg + g.ag > 2.5);
        add(m.statO25, n.over25 / 100, g.hg + g.ag > 2.5);
        const quote = odds.get(g.id);
        const market = quote && fm.devigPower(quote, ['homeWin', 'draw', 'awayWin']);
        if (market) {
          const priced = fm.forecastFootball(fits, g.home, g.away, quote);
          add3(m.market1x2, ['homeWin', 'draw', 'awayWin'].map(k => market.probabilities[k] / 100), outcome);
          add(m.marketO25, priced.probabilities.over25 / 100, g.hg + g.ag > 2.5);
        }
      }
      if (next?.corners && Number.isFinite(home.corners) && Number.isFinite(away.corners) && Number.isFinite(g.hc) && Number.isFinite(g.ac)) {
        const oldLines = totalLines(home.corners + away.corners, [8.5, 9.5]);
        add(m.cornersOld85, oldLines.over85 / 100, g.hc + g.ac > 8.5); add(m.cornersNew85, next.corners.total.over85 / 100, g.hc + g.ac > 8.5);
        add(m.cornersOld95, oldLines.over95 / 100, g.hc + g.ac > 9.5); add(m.cornersNew95, next.corners.total.over95 / 100, g.hc + g.ac > 9.5);
      }
      if (next?.cards && Number.isFinite(home.cards) && Number.isFinite(away.cards) && Number.isFinite(g.hy) && Number.isFinite(g.ay)) {
        add(m.cardsOld35, totalLines(home.cards + away.cards, [3.5]).over35 / 100, g.hy + g.ay > 3.5);
        add(m.cardsNew35, next.cards.total.over35 / 100, g.hy + g.ay > 3.5);
      }
    }
  }
  report[name] = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, show(v)]));
  console.log(name, JSON.stringify(report[name]));
}
await fs.mkdir('artifacts/opt-2026-10-07', { recursive: true });
await fs.writeFile('artifacts/opt-2026-10-07/backtest-football-espn.json', JSON.stringify({ checkedAt: new Date().toISOString(),
  method: 'ESPN: resultados de liga 2025-2026; pronósticos de 2026 con datos de días anteriores. stat = modelo nuevo sin cuotas; statOld = Poisson de temporada anterior; market = cuotas del proveedor sin margen (power).', report }, null, 2));
