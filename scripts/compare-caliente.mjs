// App forecasts vs Caliente.mx prices (margin removed), every category.
// Input: a JSON of Caliente events read from its public pages
//   { futbol: [{home,h,d,away,a}], mlb|npb|lmp|nba|wnba|tenis: [{first,f,second,s}] }
// (American odds; two-way lists show the away side first). Prices are only used
// to measure the distance: they never enter the app's percentages.
//   node --import ./tests/setup.js scripts/compare-caliente.mjs caliente.json [report.md]
import fs from 'node:fs/promises';
process.env.KALSHI_TENNIS_ODDS = 'on';
process.env.NBA_AVAILABILITY = 'on';
const { getFootballFeed } = await import('../server/services/footballDataService.js');
const { getSportsFeed, getSportsDetails } = await import('../server/services/sportsDataService.js');
const { loadBasketballHistory } = await import('../server/services/basketballHistory.js');
const { getBestBankerPick } = await import('../src/utils/mathProbabilities.js');
const { sportWinnerPick } = await import('../src/utils/sportPicks.js');
for (const league of ['nba', 'wnba']) for (let i = 0; i < 40 && !(await loadBasketballHistory(league)); i++) await new Promise(r => setTimeout(r, 3000));

const casa = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const prob = a => a < 0 ? -a / (-a + 100) : 100 / (a + 100);
const SYN = { napoles: 'napoli', genova: 'genoa', 'ac milan': 'milan', inter: 'internazionale', psg: 'paris saint germain', 'sporting lisboa': 'sporting cp',
  'bodo glimt': 'bodo glimt', 'athletic bilbao': 'athletic club', 'celta de vigo': 'celta vigo', 'tijuana xolos de caliente': 'tijuana', 'chivas guadalajara': 'guadalajara',
  'saint louis fc': 'st louis city', 'la galaxy': 'la galaxy', 'l a galaxy': 'la galaxy', 'unam pumas': 'pumas unam', 'uanl tigres': 'tigres uanl', 'club america': 'america',
  'queretaro': 'queretaro', 'club tijuana': 'tijuana', 'club necaxa': 'necaxa', 'leon': 'leon', 'yokohama dena baystars': 'dena', 'hanshin tigers': 'hanshin',
  'hokkaido nippon ham fighters': 'nippon ham', 'fukuoka softbank hawks': 'softbank', 'los angeles clippers': 'la clippers', 'rc lens': 'lens', 'cd alaves': 'alaves',
  'deportivo la coruna': 'deportivo la coruna', 'man city': 'manchester city', 'atletico madrid': 'atletico madrid' };
const STOP = new Set(['fc', 'cf', 'sc', 'club', 'de', 'la', 'the', 'm', 'cd', 'ac', 'as', 'rc', 'afc', 'calcio', 'the']);
const norm = s => { let x = String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(m\)/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); return SYN[x] || x; };
const tokens = s => new Set(norm(s).split(' ').filter(t => t && !STOP.has(t)));
function sim(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const A = tokens(a), B = tokens(b);
  const inter = [...A].filter(t => B.has(t)).length;
  return inter / (A.size + B.size - inter || 1);
}
function best(app, home, away) {
  let top = null;
  for (const m of app) {
    const names = side => [m[`${side}Team`]?.name, m[`${side}Team`]?.shortName].filter(Boolean);
    const s = (side, name) => Math.max(...names(side).map(n => sim(n, name)));
    const straight = Math.min(s('home', home), s('away', away)), swapped = Math.min(s('home', away), s('away', home));
    const score = Math.max(straight, swapped);
    if (score >= 0.5 && (!top || score > top.score || (score === top.score && Date.parse(m.kickoff) < Date.parse(top.m.kickoff)))) top = { m, score, swapped: swapped > straight };
  }
  return top;
}

const rows = [];
// ---------------- Football ----------------
const men = (await getFootballFeed({ sport: 'futbol' })).matches.filter(m => m.status === 'SCHEDULED' && m.sport !== 'femenil' && m.leagueId !== 'mexico_femenil');
const women = (await getFootballFeed({ sport: 'femenil' })).matches.filter(m => m.status === 'SCHEDULED');
for (const e of casa.futbol || []) {
  // Caliente marks women's teams "(M)": never match them with the men's fixture.
  const hit = best(/\(M\)/.test(`${e.home} ${e.away}`) ? women : men, e.home, e.away);
  if (!hit) { rows.push({ sport: 'Fútbol', event: `${e.home} vs ${e.away}`, missing: true }); continue; }
  const m = hit.m, p = m.model?.probabilities || m.probabilities || {};
  const [ph, pd, pa] = [prob(e.h), prob(e.d), prob(e.a)], sum = ph + pd + pa;
  const c = hit.swapped ? { home: pa / sum * 100, draw: pd / sum * 100, away: ph / sum * 100 } : { home: ph / sum * 100, draw: pd / sum * 100, away: pa / sum * 100 };
  const pick = getBestBankerPick(m);
  let pickCasa = null;
  if (pick && ['homeWin', 'awayWin', 'dc1X', 'dcX2'].includes(pick.key)) pickCasa = pick.key === 'homeWin' ? c.home : pick.key === 'awayWin' ? c.away : pick.key === 'dc1X' ? c.home + c.draw : c.away + c.draw;
  rows.push({ sport: 'Fútbol', league: m.leagueName, event: `${m.homeTeam.name} vs ${m.awayTeam.name}`, source: m.probabilitySource,
    app: Number.isFinite(p.homeWin) ? { home: p.homeWin, draw: p.draw, away: p.awayWin } : null, casa: c, overround: (sum - 1) * 100,
    pick: pick ? `${pick.selection} ${pick.probability}%` : null, pickCasa });
}
// ---------------- Baseball, basketball, tennis ----------------
const two = { beisbol: ['mlb', 'npb', 'lmp'], basquetbol: ['nba', 'wnba'], tenis: ['tenis'] };
for (const [sport, keys] of Object.entries(two)) {
  const feed = await getSportsFeed(sport, { calendarOnly: true });
  const scheduled = feed.matches.filter(m => m.status === 'SCHEDULED');
  const details = [];
  for (let i = 0; i < scheduled.length; i += 12) details.push(...(await getSportsDetails(sport, scheduled.slice(i, i + 12).map(m => m.id), {})).matches);
  for (const key of keys) for (const e of casa[key] || []) {
    // US-style lists show the away side first.
    const hit = best(details, e.second, e.first);
    const label = { beisbol: 'Béisbol', basquetbol: 'Básquetbol', tenis: 'Tenis' }[sport];
    if (!hit) { rows.push({ sport: label, event: `${e.first} @ ${e.second}`, missing: true }); continue; }
    const m = hit.m, w = m.analysis?.winner || {};
    // first = away unless the names matched the other way round.
    const [pf, ps] = [prob(e.f), prob(e.s)], sum = pf + ps;
    const homeIsSecond = !hit.swapped;
    const c = homeIsSecond ? { home: ps / sum * 100, away: pf / sum * 100 } : { home: pf / sum * 100, away: ps / sum * 100 };
    const pick = sportWinnerPick(m);
    rows.push({ sport: label, league: m.leagueName || m.tournamentName, event: `${m.homeTeam.name} vs ${m.awayTeam.name}`, source: m.analysis?.probabilitySource,
      app: Number.isFinite(w.home) ? { home: w.home, away: w.away } : null, casa: c, overround: (sum - 1) * 100,
      pick: pick ? `${pick.selection} ${pick.probability}%` : null, pickCasa: pick ? (pick.side === 'home' ? c.home : c.away) : null,
      starters: m.analysis?.starters ? `${m.analysis.starters.home?.name} vs ${m.analysis.starters.away?.name}` : null });
  }
}

// ---------------- Summary ----------------
const r1 = v => Number.isFinite(v) ? Math.round(v * 10) / 10 : 'N/D';
const summary = {};
for (const row of rows) {
  const s = summary[row.sport] ||= { casa: 0, matched: 0, withPercent: 0, gaps: [], sameFavourite: 0, pickGaps: [], pickAgree: 0, picks: 0 };
  s.casa++;
  if (row.missing) continue;
  s.matched++;
  if (!row.app) continue;
  s.withPercent++;
  const gap = Math.abs(row.app.home - row.casa.home);
  s.gaps.push(gap);
  const appFav = row.app.home >= row.app.away ? 'home' : 'away', casaFav = row.casa.home >= row.casa.away ? 'home' : 'away';
  if (appFav === casaFav) s.sameFavourite++;
  if (Number.isFinite(row.pickCasa)) { s.picks++; const pp = Number(String(row.pick).match(/([\d.]+)%$/)?.[1]); s.pickGaps.push(Math.abs(pp - row.pickCasa)); if (row.pickCasa >= 50) s.pickAgree++; }
}
const out = Object.fromEntries(Object.entries(summary).map(([k, s]) => [k, { casa: s.casa, matched: s.matched, withPercent: s.withPercent,
  meanGap: r1(s.gaps.reduce((a, b) => a + b, 0) / (s.gaps.length || 1)), within5: s.gaps.filter(g => g <= 5).length, over10: s.gaps.filter(g => g > 10).length, over15: s.gaps.filter(g => g > 15).length,
  sameFavourite: `${s.sameFavourite}/${s.withPercent}`, picks: s.picks, pickMeanGap: r1(s.pickGaps.reduce((a, b) => a + b, 0) / (s.pickGaps.length || 1)), picksCasaAlsoFavours: `${s.pickAgree}/${s.picks}` }]));
const lines = rows.map(r => r.missing ? `| ${r.sport} | ${r.event} | sin partido en la app | | | |`
  : `| ${r.sport} | ${r.event} | ${r.app ? `${r1(r.app.home)}${r.app.draw != null ? ` / ${r1(r.app.draw)}` : ''} / ${r1(r.app.away)}` : 'N/D'} | ${r1(r.casa.home)}${r.casa.draw != null ? ` / ${r1(r.casa.draw)}` : ''} / ${r1(r.casa.away)} | ${r.app ? r1(Math.abs(r.app.home - r.casa.home)) : ''} | ${r.pick || 'N/D'}${Number.isFinite(r.pickCasa) ? ` (casa ${r1(r.pickCasa)}%)` : ''}${r.starters ? ` · ${r.starters}` : ''} |`);
if (process.argv[3]) await fs.writeFile(process.argv[3], `| Categoría | Partido | App % | Caliente % (sin margen) | Dif. local | Pick de la app |\n|---|---|---|---|---|---|\n${lines.join('\n')}\n`);
console.log(JSON.stringify(out, null, 1));
console.log(rows.filter(r => !r.missing && r.app && Math.abs(r.app.home - r.casa.home) > 10).map(r => `${r.sport} ${r.event}: app ${r1(r.app.home)} vs casa ${r1(r.casa.home)} (${r.source})`).join('\n'));
console.log('SIN PARTIDO:', rows.filter(r => r.missing).map(r => `${r.sport}: ${r.event}`).join(' | '));
process.exit(0);
