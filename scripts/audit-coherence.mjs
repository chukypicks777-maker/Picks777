// Coherence audit over the live calendars of every category, using the same
// code the app runs (server models and the browser helpers that build cards and
// the analysis window). It checks rules that can never break, for example: the
// favourite scores more, Over 1.5 is never below Over 2.5, complementary
// options add up to 100%, handicaps agree with the winner and fixtures without
// a confirmed time keep their provider date.
//   node --import ./tests/setup.js scripts/audit-coherence.mjs
import { getFootballFeed, listView, enrichMatchWithRealData } from '../server/services/footballDataService.js';
import { getSportsFeed, getSportsDetails } from '../server/services/sportsDataService.js';
import { rankSportWinners, sportWinnerPick, sportCardMarkets, hasPublishedWinnerPrice } from '../src/utils/sportPicks.js';
import { getTop3Opportunities, getBestBankerPick, getContextualPick, calculateTeamDetailedStats, calculateDifferential, fillPoissonGoalLadder } from '../src/utils/mathProbabilities.js';
import { scheduleDay, matchDayKey } from '../src/utils/matchDay.js';
import { marketQuote } from '../src/utils/oddsFormatter.js';

const issues = [], counts = {};
const EPS = 0.6; // presentation rounding (one decimal per value)
const num = value => typeof value === 'number' && Number.isFinite(value);
const label = m => `${m.sport || 'futbol'} · ${m.leagueId} · ${m.homeTeam?.name} vs ${m.awayTeam?.name}`;
const fail = (m, rule, detail) => issues.push({ match: label(m), rule, detail });
const count = key => { counts[key] = (counts[key] || 0) + 1; };

function percentRange(m, name, value) {
  if (value == null) return;
  if (!num(value) || value < 0 || value > 100) fail(m, 'porcentaje fuera de 0-100', `${name}=${value}`);
}
let checks = 0;
function sums(m, name, values, total = 100, tolerance = EPS) {
  if (values.some(v => v == null)) return;
  checks++;
  const sum = values.reduce((s, v) => s + v, 0);
  if (Math.abs(sum - total) > tolerance) fail(m, 'opciones complementarias no suman 100', `${name}: ${values.join(' + ')} = ${sum.toFixed(2)}`);
}
function decreasing(m, name, values) {
  const list = values.filter(v => v != null);
  if (list.length > 1) checks++;
  for (let i = 1; i < list.length; i++) if (list[i] > list[i - 1] + 1e-9) { fail(m, 'escalera Over no decreciente', `${name}: ${list.join(' > ')}`); return; }
}
function increasing(m, name, values) {
  const list = values.filter(v => v != null);
  if (list.length > 1) checks++;
  for (let i = 1; i < list.length; i++) if (list[i] < list[i - 1] - 1e-9) { fail(m, 'escalera no creciente', `${name}: ${list.join(' < ')}`); return; }
}
function ladder(m, name, rows, lineKey = 'line', overKey = 'over', underKey = 'under') {
  if (!Array.isArray(rows)) return;
  const sorted = [...rows].sort((a, b) => a[lineKey] - b[lineKey]);
  for (const row of sorted) { percentRange(m, `${name} ${row[lineKey]} over`, row[overKey]); if (underKey) sums(m, `${name} ${row[lineKey]}`, [row[overKey], row[underKey]]); }
  decreasing(m, name, sorted.map(row => row[overKey]));
}
function dates(m) {
  if (!Number.isFinite(Date.parse(m.kickoff))) fail(m, 'fecha inválida', String(m.kickoff));
  if (m.timeTBD) {
    count('fixtures without confirmed time');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.scheduleDate || '')) fail(m, 'partido sin hora y sin fecha del proveedor', `kickoff ${m.kickoff}`);
    else if (scheduleDay(m) !== m.scheduleDate || matchDayKey(m, 'America/Mexico_City') !== m.scheduleDate) fail(m, 'día de Hoy/Mañana distinto a la fecha del proveedor', `${m.scheduleDate} vs ${matchDayKey(m, 'America/Mexico_City')}`);
  }
  if (m.status === 'SCHEDULED' && Date.parse(m.kickoff) < Date.now() - 6 * 3600000 && !m.timeTBD) count('scheduled more than 6 h after kickoff (provider delay)');
  if (m.status === 'FINISHED' && !m.retired && !(num(m.finalScore?.home) && num(m.finalScore?.away)) && !num(m.liveScore?.home)) fail(m, 'finalizado sin marcador', JSON.stringify(m.finalScore));
}
function quoteOf(m, side, probability) {
  const quote = marketQuote(m.odds?.[`${side}Win`], probability);
  if (quote.kind === 'published' && !(quote.odds > 1)) fail(m, 'momio publicado inválido', `${side}=${m.odds?.[`${side}Win`]}`);
  if (quote.kind === 'theoretical' && Math.abs(quote.odds - 100 / probability) > 1e-9) fail(m, 'momio justo mal calculado', `${side} ${probability}% -> ${quote.odds}`);
}

// ---------- Tennis, baseball and basketball ----------
async function sports(sport) {
  const feed = await getSportsFeed(sport, { calendarOnly: true });
  const all = feed.matches;
  all.forEach(dates);
  const scheduled = all.filter(m => m.status === 'SCHEDULED');
  const details = [];
  for (let i = 0; i < scheduled.length; i += 12) details.push(...(await getSportsDetails(sport, scheduled.slice(i, i + 12).map(m => m.id), {})).matches);
  for (const m of details) {
    const a = m.analysis || {};
    count(`${sport} analysed`);
    if (!a.available) { count(`${sport} without own data (N/D)`); continue; }
    count(`${sport} with percentages`);
    const w = a.winner;
    ['home', 'draw', 'away'].forEach(side => percentRange(m, `ganador ${side}`, w[side]));
    sums(m, 'ganador', m.allowsDraw ? [w.home, w.draw, w.away] : [w.home, w.away]);
    if (a.probabilitySource === 'published-odds') count(`${sport} winner taken from the published price`);
    for (const side of ['home', 'away']) if (num(w[side])) quoteOf(m, side, w[side]);
    const pick = sportWinnerPick(m);
    if (pick) {
      const best = Math.max(w.home, w.away);
      if (pick.probability !== best) fail(m, 'pick no es el lado con más probabilidad', `${pick.selection} ${pick.probability} vs ${best}`);
      if (hasPublishedWinnerPrice(m) && pick.oddsKind !== 'published') fail(m, 'pick sin el momio publicado disponible', pick.selection);
    }
    for (const market of sportCardMarkets(m)) percentRange(m, market.label, market.value);
    const favourite = w.home >= w.away ? 'home' : 'away', other = favourite === 'home' ? 'away' : 'home';
    if (sport === 'beisbol') {
      ['home', 'away'].forEach(side => ladder(m, `carreras ${side}`, a.teamRuns?.[side]));
      ladder(m, 'carreras totales', a.totalRuns);
      ladder(m, 'innings 1-5', a.firstFive);
      if (a.extraInnings) sums(m, 'extra innings', [a.extraInnings.yes, a.extraInnings.no]);
      if (a.firstInning) sums(m, 'primer inning', [a.firstInning.home, a.firstInning.draw, a.firstInning.away]);
      const e = a.expectedRuns;
      if (num(e?.home) && num(e?.away) && Math.abs(w.home - w.away) > 1 && e[favourite] < e[other]) fail(m, 'favorito con menos carreras esperadas', `${w.home}/${w.away} vs ${e.home.toFixed(2)}/${e.away.toFixed(2)}`);
      const over = (side, line) => a.teamRuns?.[side]?.find(row => row.line === line)?.over;
      if (Math.abs(w.home - w.away) > 1 && num(over(favourite, 2.5)) && over(favourite, 2.5) + EPS < over(other, 2.5)) fail(m, 'favorito con menos Over 2.5 carreras', `${over('home', 2.5)} / ${over('away', 2.5)}`);
      // Innings 1-5 cannot exceed the full game at the same line.
      for (const row of a.firstFive || []) { const full = a.totalRuns?.find(r => r.line === row.line); if (full && num(row.over) && num(full.over) && row.over > full.over + EPS) fail(m, 'innings 1-5 mayor que el partido completo', `línea ${row.line}: ${row.over} > ${full.over}`); }
      if (a.firstInning && num(a.firstInning.home) && Math.abs(w.home - w.away) > 4 && Math.abs(a.firstInning.home - a.firstInning.away) > 2) {
        const early = a.firstInning.home > a.firstInning.away ? 'home' : 'away';
        if (early !== favourite) fail(m, 'primer inning favorece al rival del favorito', `ganador ${w.home}/${w.away}, 1er inning ${a.firstInning.home}/${a.firstInning.away}`);
      }
    }
    if (sport === 'basquetbol') {
      for (const side of ['home', 'away']) {
        const rows = [...(a.handicaps?.[side] || [])].sort((x, y) => x.line - y.line);
        increasing(m, `hándicap ${side}`, rows.map(row => row.probability));
        const minus = rows.find(row => row.line === -1.5)?.probability, plus = rows.find(row => row.line === 1.5)?.probability;
        if (num(minus) && num(plus) && !(minus <= w[side] + EPS && w[side] <= plus + EPS)) fail(m, 'hándicap no encuadra al ganador', `${side}: -1.5 ${minus} / gana ${w[side]} / +1.5 ${plus}`);
      }
      for (const row of a.handicaps?.home || []) {
        const mirror = a.handicaps?.away?.find(r => r.line === -row.line);
        if (mirror && num(row.probability) && num(mirror.probability)) sums(m, `hándicap ${row.line} espejo`, [row.probability, mirror.probability]);
      }
    }
    if (sport === 'tenis') {
      sums(m, '1er set', [a.firstSet?.home, a.firstSet?.away]);
      if (JSON.stringify(a.firstSet) !== JSON.stringify(a.secondSet)) fail(m, '1er y 2º set distintos', `${JSON.stringify(a.firstSet)} ${JSON.stringify(a.secondSet)}`);
      if (num(a.firstSet?.home) && (a.firstSet.home > 50) !== (w.home > 50) && Math.abs(w.home - 50) > 0.5) fail(m, 'set y partido favorecen a distinto jugador', `set ${a.firstSet.home} partido ${w.home}`);
      for (const side of ['home', 'away']) {
        const yes = a.winsSet?.[side]?.yes;
        sums(m, `gana un set ${side}`, [yes, a.winsSet?.[side]?.no]);
        if (num(yes) && (yes + EPS < w[side] || yes + EPS < a.firstSet[side])) fail(m, '"gana un set" menor que ganar el partido o el set', `${side}: un set ${yes}, partido ${w[side]}, set ${a.firstSet[side]}`);
      }
      if (num(a.winsSet?.home?.yes) && a.winsSet.home.yes + a.winsSet.away.yes < 100 - EPS) fail(m, 'ambos "gana un set" suman menos de 100', `${a.winsSet.home.yes} + ${a.winsSet.away.yes}`);
    }
  }
  // Banqueros: the ranked pool is ordered and each rank is its own winner pick.
  const ranked = rankSportWinners(details, Date.now());
  for (let i = 1; i < ranked.length; i++) if (ranked[i].bankerPick.probability > ranked[i - 1].bankerPick.probability) fail(ranked[i], 'Banqueros fuera de orden', `${ranked[i - 1].bankerPick.probability} < ${ranked[i].bankerPick.probability}`);
  return { sport, matches: all.length, scheduled: scheduled.length, analysed: details.length };
}

// ---------- Football (men and women) ----------
async function football(sport) {
  const feed = await getFootballFeed({ sport });
  feed.matches.forEach(dates);
  // The analysis window receives the enriched match (team statistics, halves,
  // corners and cards); the cards receive the list view of the same match.
  const raw = feed.matches.filter(m => m.status === 'SCHEDULED'), scheduled = [];
  for (let i = 0; i < raw.length; i += 4) scheduled.push(...await Promise.all(raw.slice(i, i + 4).map(match => enrichMatchWithRealData(match).catch(() => match))));
  for (const m of scheduled) {
    const card = listView(m);
    if (JSON.stringify(card.model?.probabilities) !== JSON.stringify(m.model?.probabilities)) fail(m, 'tarjeta y análisis con porcentajes distintos', 'list view vs detalle');
    count(`${sport} scheduled`);
    const p = m.model?.probabilities || m.probabilities || {};
    if (p.homeWin == null) { count(`${sport} without 1X2 percentages`); if (Number(m.odds?.homeWin) > 1) fail(m, 'momio publicado pero sin porcentaje propio', 'la tarjeta calcularía el 1X2 desde el momio'); continue; }
    if (m.probabilitySources?.homeWin === 'published-odds') count(`${sport} 1X2 taken from the published price`);
    for (const [key, value] of Object.entries(p)) if (key !== 'predictedScore' && key !== 'confidence' && typeof value === 'number') percentRange(m, key, value);
    sums(m, '1X2', [p.homeWin, p.draw, p.awayWin]);
    for (const line of ['05', '15', '25', '35', '45']) if (p[`over${line}`] != null && p[`under${line}`] != null) sums(m, `goles ${line}`, [p[`over${line}`], p[`under${line}`]]);
    decreasing(m, 'goles over', ['05', '15', '25', '35', '45', '55'].map(line => p[`over${line}`]));
    if (p.bttsYes != null) sums(m, 'ambos anotan', [p.bttsYes, p.bttsNo]);
    const xg = m.model?.expectedGoals;
    if (num(xg?.home) && num(xg?.away) && Math.abs(p.homeWin - p.awayWin) > 2 && (p.homeWin > p.awayWin) !== (xg.home > xg.away)) fail(m, 'favorito 1X2 con menos goles esperados', `1X2 ${p.homeWin}/${p.awayWin}, goles ${xg.home}/${xg.away}`);
    // Ambos anotan cannot exceed either team scoring.
    const scores = side => m.model?.[`${side}Goals`]?.over05;
    if (num(p.bttsYes) && num(scores('home')) && num(scores('away')) && p.bttsYes > Math.min(scores('home'), scores('away')) + EPS) fail(m, 'ambos anotan mayor que la probabilidad de que anote un equipo', `${p.bttsYes} vs ${scores('home')}/${scores('away')}`);
    for (const side of ['home', 'away']) decreasing(m, `goles ${side}`, ['05', '15', '25', '35'].map(line => m.model?.[`${side}Goals`]?.[`over${line}`]));
    const corners = m.model?.corners;
    if (corners) { for (const part of ['total', 'home', 'away']) decreasing(m, `córners ${part}`, Object.entries(corners[part] || {}).filter(([k]) => k.startsWith('over')).sort((x, y) => Number(x[0].slice(4)) - Number(y[0].slice(4))).map(([, v]) => v)); }
    const cards = m.model?.cards;
    if (cards) decreasing(m, 'tarjetas', Object.entries(cards.total || {}).filter(([k]) => k.startsWith('over')).sort((x, y) => Number(x[0].slice(4)) - Number(y[0].slice(4))).map(([, v]) => v));
    const halves = m.halfGoals || m.model?.halves;
    if (m.model?.corners) count('futbol with corner markets'); if (m.model?.cards) count('futbol with card markets');
    if (halves?.first && halves?.second) {
      count('futbol with half markets');
      for (const line of ['05', '15', '25']) {
        for (const part of ['first', 'second']) if (num(halves[part][`over${line}`]) && num(p[`over${line}`]) && halves[part][`over${line}`] > p[`over${line}`] + EPS) fail(m, 'una mitad con más goles que el partido completo', `${part} over${line} ${halves[part][`over${line}`]} > ${p[`over${line}`]}`);
      }
      if (num(xg?.home) && Math.abs(halves.first.expectedGoals + halves.second.expectedGoals - (xg.home + xg.away)) > 0.06) fail(m, 'goles por mitad no suman los del partido', `${halves.first.expectedGoals} + ${halves.second.expectedGoals} vs ${(xg.home + xg.away).toFixed(2)}`);
    }
    // What the cards and the analysis window display.
    const ladderShown = fillPoissonGoalLadder(p, m.odds);
    for (const line of ['15', '25', '35']) if (num(p[`over${line}`]) && Math.abs(ladderShown[`over${line}`] - p[`over${line}`]) > EPS) fail(m, 'dos valores distintos para el mismo Over', `over${line}: ${p[`over${line}`]} vs ${ladderShown[`over${line}`]}`);
    const home = calculateTeamDetailedStats(m.homeTeam, true, m), away = calculateTeamDetailedStats(m.awayTeam, false, m);
    for (const s of [home, away]) {
      decreasing(m, `goles del equipo ${s.name}`, ['05', '15', '25', '35'].map(line => s[`over${line}Rate`]));
      decreasing(m, `córners ${s.name}`, ['15', '25', '35', '45', '55', '65'].map(line => s[`cornerOver${line}`]));
      decreasing(m, `tarjetas ${s.name}`, ['05', '15', '25', '35', '45'].map(line => s[`cardsOver${line}`]));
    }
    if (Math.abs(p.homeWin - p.awayWin) > 2 && num(home.over05Rate) && num(away.over05Rate)) {
      const fav = p.homeWin > p.awayWin ? home : away, other = fav === home ? away : home;
      if (fav.over15Rate + EPS < other.over15Rate) fail(m, 'favorito con menos goles del equipo', `${fav.name} +1.5 ${fav.over15Rate} vs ${other.name} ${other.over15Rate}`);
    }
    const diff = calculateDifferential(home, away, m);
    decreasing(m, 'córners partido', ['55', '65', '75', '85', '95'].map(line => diff.matchCornersProbs?.[`over${line}`]));
    if (num(diff.over25) && num(p.over25) && Math.abs(diff.over25 - p.over25) > EPS) fail(m, 'Over 2.5 distinto en la comparativa', `${diff.over25} vs ${p.over25}`);
    const picks = getTop3Opportunities(m), banker = getBestBankerPick(m);
    for (const pick of picks) {
      const expected = pick.key === 'dc1X' ? p.homeWin + p.draw : pick.key === 'dcX2' ? p.awayWin + p.draw : p[pick.key];
      if (pick.category !== 'ai' && num(expected) && Math.abs(pick.probability - expected) > EPS) fail(m, 'pick con porcentaje distinto al mercado', `${pick.selection}: ${pick.probability} vs ${expected}`);
      if (Number(m.odds?.[pick.key]) > 1 && pick.oddsKind !== 'published') fail(m, 'pick sin el momio publicado disponible', pick.selection);
    }
    if (banker && picks[0] && banker.selection !== picks[0].selection) fail(m, 'banquero distinto del primer pick', `${banker.selection} vs ${picks[0].selection}`);
    for (const filter of ['over', 'btts', 'under']) {
      const pick = getContextualPick(m, filter);
      const key = { over: 'over25', btts: 'bttsYes', under: 'under25' }[filter];
      if (pick && num(p[key]) && Math.abs(pick.probability - p[key]) > EPS) fail(m, `pick del filtro ${filter} distinto al mercado`, `${pick.probability} vs ${p[key]}`);
    }
  }
  return { sport, matches: feed.matches.length, scheduled: scheduled.length };
}

const summary = [];
for (const sport of ['futbol', 'femenil']) summary.push(await football(sport));
for (const sport of ['tenis', 'beisbol', 'basquetbol']) summary.push(await sports(sport));
const byRule = issues.reduce((acc, issue) => { (acc[issue.rule] ||= []).push(issue); return acc; }, {});
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), summary, counts, checks,
  issues: issues.length, byRule: Object.fromEntries(Object.entries(byRule).map(([rule, list]) => [rule, { count: list.length, examples: list.slice(0, 4) }])) }, null, 1));
