// Football blind test: European leagues with goals, corners, cards and halves
// (football-data.co.uk 2024-25 to 2026-27) and Liga MX / MLS winners against
// Pinnacle's closing prices. Forecasts use only earlier matches.
import fs from 'node:fs/promises';
import { collect } from '../backtest-football.mjs';
import { parseCsv } from '../backtest/footballData.mjs';
import * as fm from '../../src/utils/footballModel.js';
import { Binary, Multi, VersusCasino, CACHE, writeReport } from './common.mjs';

const pct = v => Number.isFinite(v) ? v / 100 : NaN;
const argmax = values => values.indexOf(Math.max(...values));
const pickWon = (key, h, a) => ({ homeWin: h > a, awayWin: a > h, dc1X: h >= a, dcX2: a >= h, bttsYes: h > 0 && a > 0, bttsNo: h === 0 || a === 0,
  over15: h + a > 1.5, under15: h + a < 1.5, over25: h + a > 2.5, under25: h + a < 2.5, over35: h + a > 3.5, under35: h + a < 3.5 })[key];

async function europe() {
  const records = (await collect()).filter(r => !r.train && r.new && r.close);
  const m = {
    winnerModel: new Multi(), winnerCasino: new Multi(), winnerApp: new Multi(),
    homeVsCasino: new VersusCasino(), over25VsCasino: new VersusCasino(), favouriteAgreement: { n: 0, same: 0 },
    over15: new Binary(), over25: new Binary(), over35: new Binary(), btts: new Binary(), doubleChanceFavourite: new Binary(),
    corners75: new Binary(), corners85: new Binary(), corners95: new Binary(), corners105: new Binary(), homeCorners45: new Binary(), awayCorners45: new Binary(),
    cards35: new Binary(), cards45: new Binary(), firstHalf05: new Binary(), firstHalf15: new Binary(), secondHalf05: new Binary()
  };
  const picks = { withOdds: new Binary(), withoutOdds: new Binary() }, pickMarkets = {};
  for (const r of records) {
    const { hg, ag, hc, ac, hy, ay, hthg, htag } = r.game, outcome = hg > ag ? 0 : hg === ag ? 1 : 2, total = hg + ag;
    const model = [r.new.homeWin, r.new.draw, r.new.awayWin].map(pct), casino = [r.close.homeWin, r.close.draw, r.close.awayWin].map(pct);
    m.winnerModel.add(model, outcome); m.winnerCasino.add(casino, outcome);
    m.winnerApp.add([r.newMarket.homeWin, r.newMarket.draw, r.newMarket.awayWin].map(pct), outcome);
    m.favouriteAgreement.n++; m.favouriteAgreement.same += Number(argmax(model) === argmax(casino));
    m.homeVsCasino.add(model[0], casino[0], outcome === 0);
    m.over25VsCasino.add(pct(r.new.over25), pct(r.close.over25), total > 2.5);
    m.over15.add(pct(r.new.over15), total > 1.5); m.over25.add(pct(r.new.over25), total > 2.5); m.over35.add(pct(r.new.over35), total > 3.5);
    m.btts.add(pct(r.new.bttsYes), hg > 0 && ag > 0);
    const favouriteSide = model[0] >= model[2] ? 0 : 2;
    m.doubleChanceFavourite.add(model[favouriteSide] + model[1], outcome !== (favouriteSide === 0 ? 2 : 0));
    if (r.newCorners && Number.isFinite(hc)) {
      for (const [key, line] of [['corners75', 7.5], ['corners85', 8.5], ['corners95', 9.5], ['corners105', 10.5]]) m[key].add(pct(r.newCorners.total[`over${String(line).replace('.', '')}`]), hc + ac > line);
      m.homeCorners45.add(pct(r.newCorners.home.over45), hc > 4.5); m.awayCorners45.add(pct(r.newCorners.away.over45), ac > 4.5);
    }
    if (r.newCards && Number.isFinite(hy)) { m.cards35.add(pct(r.newCards.total.over35), hy + ay > 3.5); m.cards45.add(pct(r.newCards.total.over45), hy + ay > 4.5); }
    if (r.newHalves && Number.isFinite(hthg)) {
      m.firstHalf05.add(pct(r.newHalves.first.over05), hthg + htag > 0.5); m.firstHalf15.add(pct(r.newHalves.first.over15), hthg + htag > 1.5);
      m.secondHalf05.add(pct(r.newHalves.second.over05), total - hthg - htag > 0.5);
    }
    for (const [name, pick] of [['withOdds', r.picks.newMarket], ['withoutOdds', r.picks.new]]) {
      if (!pick) continue;
      const won = pickWon(pick.key, hg, ag);
      // The pick is always the favoured side, so its probability is "yes".
      picks[name].add(pick.probability / 100, won);
      if (name === 'withOdds') { const s = pickMarkets[pick.key] ||= { n: 0, won: 0, said: 0 }; s.n++; s.won += Number(won); s.said += pick.probability; }
    }
  }
  const out = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.report ? v.report() : { n: v.n, sameFavourite: Number((v.same / v.n * 100).toFixed(1)) }]));
  out.bankerPick = { withOdds: picks.withOdds.report(), withoutOdds: picks.withoutOdds.report(),
    byMarket: Object.fromEntries(Object.entries(pickMarkets).map(([k, s]) => [k, { n: s.n, hitRate: Number((s.won / s.n * 100).toFixed(1)), said: Number((s.said / s.n).toFixed(1)) }])) };
  return out;
}

async function americas() {
  const out = {};
  for (const [file, name] of [['MEX', 'Liga MX'], ['USA', 'MLS']]) {
    const rows = parseCsv(await fs.readFile(`${CACHE}/${file}.csv`, 'utf8')).map(row => {
      const [d, mo, y] = row.Date.split('/').map(Number);
      return { time: Date.UTC(y < 100 ? 2000 + y : y, mo - 1, d, 12), home: row.Home, away: row.Away, hg: Number(row.HG), ag: Number(row.AG),
        close: { homeWin: Number(row.PSCH) || Number(row.AvgCH), draw: Number(row.PSCD) || Number(row.AvgCD), awayWin: Number(row.PSCA) || Number(row.AvgCA) } };
    }).filter(r => Number.isInteger(r.hg) && Number.isInteger(r.ag) && r.time >= Date.UTC(2021, 0, 1)).sort((a, b) => a.time - b.time);
    const winnerModel = new Multi(), winnerCasino = new Multi(), homeVsCasino = new VersusCasino(), agreement = { n: 0, same: 0 };
    const days = [...new Set(rows.map(r => Math.floor(r.time / 86400000)))];
    let cursor = 0;
    for (const day of days) {
      const start = day * 86400000;
      while (cursor < rows.length && rows[cursor].time < start) cursor++;
      if (start < Date.UTC(2024, 6, 1)) continue;
      const fits = fm.fitFootballLeague(rows.slice(0, cursor), { asOf: start });
      for (const g of rows.filter(r => r.time >= start && r.time < start + 86400000)) {
        const forecast = fm.forecastFootball(fits, g.home, g.away, {}), casino = fm.devigPower(g.close, ['homeWin', 'draw', 'awayWin']);
        if (!forecast || !casino) continue;
        const outcome = g.hg > g.ag ? 0 : g.hg === g.ag ? 1 : 2;
        const model = [forecast.probabilities.homeWin, forecast.probabilities.draw, forecast.probabilities.awayWin].map(pct);
        const market = [casino.probabilities.homeWin, casino.probabilities.draw, casino.probabilities.awayWin].map(pct);
        winnerModel.add(model, outcome); winnerCasino.add(market, outcome); homeVsCasino.add(model[0], market[0], outcome === 0);
        agreement.n++; agreement.same += Number(argmax(model) === argmax(market));
      }
    }
    out[name] = { winnerModel: winnerModel.report(), winnerCasino: winnerCasino.report(), homeVsCasino: homeVsCasino.report(),
      favouriteAgreement: { n: agreement.n, sameFavourite: Number((agreement.same / agreement.n * 100).toFixed(1)) } };
  }
  return out;
}

if (process.argv[1]?.endsWith('football.mjs')) {
  const report = { checkedAt: new Date().toISOString(), europe: await europe(), americas: await americas(),
    method: 'Prueba ciega walk-forward: cada pronóstico usa solo partidos de días anteriores. Europa: Premier, LaLiga, Serie A, Ligue 1 y Bundesliga 2024-25 a 2026-27. Casino: cierre de Pinnacle (o promedio de cierre) sin margen. Liga MX y MLS: julio de 2024 en adelante, solo goles y resultado (sin córners en la fuente).' };
  await writeReport('football', report);
  console.log(JSON.stringify(report, (k, v) => k === 'calibration' ? undefined : v, 1).slice(0, 6000));
}
