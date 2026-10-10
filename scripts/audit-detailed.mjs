// Detailed per-match review of every category: what each analysis shows, and
// flags for exaggerated or senseless values (not only broken rules): extreme
// percentages, implausible goals/runs/points, corners or cards, a most-likely
// score that contradicts the favourite, large gaps to the published price, and
// finished results whose score disagrees with its own sets, innings or form.
//   node --import ./tests/setup.js scripts/audit-detailed.mjs [report.md]
import fs from 'node:fs/promises';
process.env.KALSHI_TENNIS_ODDS = 'on';
const { getFootballFeed, enrichMatchWithRealData } = await import('../server/services/footballDataService.js');
const { getSportsFeed, getSportsDetails } = await import('../server/services/sportsDataService.js');
const { getBestBankerPick, calculateTeamDetailedStats } = await import('../src/utils/mathProbabilities.js');
const { sportWinnerPick } = await import('../src/utils/sportPicks.js');
const { marketWinner } = await import('../server/services/sportProbabilityModel.js');
const { formatOdds } = await import('../src/utils/oddsFormatter.js');

const flags = [], sections = [];
const num = v => typeof v === 'number' && Number.isFinite(v);
const r1 = v => num(v) ? Math.round(v * 10) / 10 : 'N/D';
const name = m => `${m.homeTeam?.name} vs ${m.awayTeam?.name}`;
const flag = (sport, m, kind, detail, severity = 'revisar') => flags.push({ sport, match: name(m), league: m.leagueName || m.leagueId, kind, detail, severity });
const am = odds => num(odds) && odds > 1 ? formatOdds(odds, 'american') : 'N/D';

// ---------------- Football ----------------
async function football(sport) {
  const feed = await getFootballFeed({ sport });
  const scheduled = feed.matches.filter(m => m.status === 'SCHEDULED'), rows = [];
  const full = [];
  for (let i = 0; i < scheduled.length; i += 4) full.push(...await Promise.all(scheduled.slice(i, i + 4).map(m => enrichMatchWithRealData(m).catch(() => m))));
  for (const m of full) {
    const p = m.model?.probabilities || {}, xg = m.model?.expectedGoals || {}, pick = getBestBankerPick(m);
    if (!num(p.homeWin)) { flag('Fútbol', m, 'sin porcentajes', 'No hay 1X2 propio ni de mercado'); continue; }
    const totalXg = (xg.home || 0) + (xg.away || 0);
    if (num(xg.home) && (totalXg > 4.8 || totalXg < 1.3)) flag('Fútbol', m, 'goles esperados fuera de rango', `${r1(xg.home)} + ${r1(xg.away)} = ${r1(totalXg)}`);
    if (num(xg.home) && Math.max(xg.home, xg.away) > 4.2) flag('Fútbol', m, 'un equipo con más de 4.2 goles esperados', `${r1(xg.home)} / ${r1(xg.away)}`);
    if (p.over15 >= 97) flag('Fútbol', m, 'Over 1.5 exagerado', `${r1(p.over15)}%`);
    if (p.over25 >= 90) flag('Fútbol', m, 'Over 2.5 exagerado', `${r1(p.over25)}%`);
    if (pick?.probability >= 98) flag('Fútbol', m, 'pick de 98% o más', `${pick.selection} ${pick.probability}%`);
    // Both teams to score needs both teams to score at least once.
    const minScore = Math.min(m.model?.homeGoals?.over05 ?? 100, m.model?.awayGoals?.over05 ?? 100);
    if (num(p.bttsYes) && Math.min(xg.home, xg.away) < 0.6 && p.bttsYes > 45) flag('Fútbol', m, 'ambos anotan alto con un equipo de poco gol', `BTTS ${r1(p.bttsYes)}%, goles ${r1(xg.home)}/${r1(xg.away)}`);
    if (num(p.bttsYes) && p.bttsYes > minScore + 0.5) flag('Fútbol', m, 'ambos anotan mayor que anotar un equipo', `${r1(p.bttsYes)} vs ${r1(minScore)}`, 'error');
    // The most likely score is a scenario, but it must not name the other side as winner of a clear favourite.
    const [hs, as] = String(m.model?.predictedScore || '').split('-').map(n => Number(n.trim()));
    if (Number.isInteger(hs) && Math.abs(p.homeWin - p.awayWin) > 15 && ((p.homeWin > p.awayWin && as > hs) || (p.awayWin > p.homeWin && hs > as))) flag('Fútbol', m, 'marcador probable contradice al favorito', `1X2 ${r1(p.homeWin)}/${r1(p.awayWin)}, marcador ${m.model.predictedScore}`, 'error');
    const c = m.model?.corners?.expected, k = m.model?.cards?.expected;
    if (c && (c.total > 13.5 || c.total < 6)) flag('Fútbol', m, 'córners esperados fuera de rango', `${r1(c.home)} + ${r1(c.away)} = ${r1(c.total)}`);
    if (k && (k.total > 7 || k.total < 1.8)) flag('Fútbol', m, 'tarjetas esperadas fuera de rango', `${r1(k.total)}`);
    const halves = m.halfGoals;
    if (halves?.first && (halves.firstHalfShare < 35 || halves.firstHalfShare > 50)) flag('Fútbol', m, 'reparto por mitades raro', `${halves.firstHalfShare}% de goles en la 1ª mitad`);
    const hs1 = calculateTeamDetailedStats(m.homeTeam, true, m), as1 = calculateTeamDetailedStats(m.awayTeam, false, m);
    for (const s of [hs1, as1]) if (num(s.avgGF) && (s.avgGF > 4 || s.avgGC > 4)) flag('Fútbol', m, s.gamesPlayed < 3 ? 'promedio de muy pocos partidos (la app muestra aviso de muestra pequeña)' : 'promedio de goles del equipo exagerado', `${s.name}: ${r1(s.avgGF)} a favor / ${r1(s.avgGC)} en contra en ${s.gamesPlayed} partidos`, s.gamesPlayed < 3 ? 'info' : 'revisar');
    rows.push(`| ${name(m)} | ${m.leagueName} | ${r1(p.homeWin)} / ${r1(p.draw)} / ${r1(p.awayWin)} | ${am(m.odds?.homeWin)} / ${am(m.odds?.draw)} / ${am(m.odds?.awayWin)} | ${r1(xg.home)}–${r1(xg.away)} | ${r1(p.over15)} / ${r1(p.over25)} / ${r1(p.over35)} | ${r1(p.bttsYes)} | ${m.model?.predictedScore || 'N/D'} | ${c ? r1(c.total) : 'N/D'} | ${k ? r1(k.total) : 'N/D'} | ${pick ? `${pick.selection} ${pick.probability}%` : 'N/D'} |`);
  }
  // Finished: a final score must exist and be a pair of non-negative integers.
  for (const m of feed.matches.filter(m => m.status === 'FINISHED')) if (!['home', 'away'].every(s => Number.isInteger(m.finalScore?.[s]) && m.finalScore[s] >= 0)) flag('Fútbol', m, 'resultado final incompleto', JSON.stringify(m.finalScore), 'error');
  sections.push({ title: `Fútbol${sport === 'femenil' ? ' femenil' : ''} (${full.length} partidos programados, ${feed.matches.filter(m => m.status === 'FINISHED').length} finalizados)`,
    header: '| Partido | Liga | 1X2 % | Momio 1X2 | Goles esp. | Over 1.5/2.5/3.5 % | Ambos % | Marcador probable | Córners | Tarjetas | Pick banquero |\n|---|---|---|---|---|---|---|---|---|---|---|', rows });
}

// ---------------- Tennis, baseball, basketball ----------------
async function sports(sport, label) {
  const feed = await getSportsFeed(sport, { calendarOnly: true });
  const scheduled = feed.matches.filter(m => m.status === 'SCHEDULED'), details = [], rows = [];
  for (let i = 0; i < scheduled.length; i += 12) details.push(...(await getSportsDetails(sport, scheduled.slice(i, i + 12).map(m => m.id), {})).matches);
  for (const m of details) {
    const a = m.analysis || {}, w = a.winner || {}, pick = sportWinnerPick(m);
    if (!a.available) { rows.push(`| ${name(m)} | ${m.leagueName} | N/D (sin datos propios suficientes) | ${am(m.odds?.homeWin)} / ${am(m.odds?.awayWin)} | | | |`); continue; }
    const market = marketWinner(m.odds), gap = market === null ? null : Math.abs(w.home - market * 100);
    const fav = Math.max(w.home, w.away);
    if (sport === 'tenis') {
      if (fav > 95) flag(label, m, 'ganador de más de 95%', `${r1(fav)}%`);
      if (gap > 15) flag(label, m, 'muy distinto al momio publicado (opinión del modelo)', `modelo ${r1(w.home)}% vs mercado ${r1(market * 100)}% para ${m.homeTeam.name}`, 'info');
      rows.push(`| ${name(m)} | ${m.tournamentName || m.leagueName} | ${r1(w.home)} / ${r1(w.away)} | ${am(m.odds?.homeWin)} / ${am(m.odds?.awayWin)} | 1er set ${r1(a.firstSet?.home)} | un set ${r1(a.winsSet?.home?.yes)} / ${r1(a.winsSet?.away?.yes)} | ${pick ? `${pick.selection} ${pick.probability}%` : 'N/D'} |`);
    }
    if (sport === 'beisbol') {
      const e = a.expectedRuns || {};
      if (num(e.home) && (Math.max(e.home, e.away) > 7.5 || Math.min(e.home, e.away) < 2)) flag(label, m, 'carreras esperadas fuera de rango', `${r1(e.home)} / ${r1(e.away)}`);
      if (fav > 75) flag(label, m, 'ganador de más de 75% en béisbol', `${r1(fav)}%`);
      if (num(a.extraInnings?.yes) && (a.extraInnings.yes > 18 || a.extraInnings.yes < 3)) flag(label, m, 'extra innings fuera de rango', `${r1(a.extraInnings.yes)}%`);
      if (num(a.firstInning?.draw) && (a.firstInning.draw < 35 || a.firstInning.draw > 80)) flag(label, m, 'primer inning raro', `empate ${r1(a.firstInning.draw)}%`);
      if (gap > 12) flag(label, m, 'muy distinto al momio publicado (opinión del modelo)', `modelo ${r1(w.home)}% vs mercado ${r1(market * 100)}%`, 'info');
      const total = a.totalRuns?.find(row => row.line === 8.5)?.over, f5 = a.firstFive?.find(row => row.line === 4.5)?.over;
      rows.push(`| ${name(m)} | ${m.leagueName} | ${r1(w.home)}${m.allowsDraw ? ` / X ${r1(w.draw)}` : ''} / ${r1(w.away)} | ${am(m.odds?.homeWin)} / ${am(m.odds?.awayWin)} | carreras ${r1(e.home)}–${r1(e.away)} | O8.5 ${r1(total)} · F5 O4.5 ${r1(f5)} · extra ${r1(a.extraInnings?.yes)} | ${pick ? `${pick.selection} ${pick.probability}%` : 'N/D'} |`);
    }
    if (sport === 'basquetbol') {
      const pts = a.expectedPoints || {}, margin = num(pts.home) ? pts.home - pts.away : null;
      const range = m.leagueId === 'wnba' ? [60, 115] : [85, 140];
      if (num(pts.home) && [pts.home, pts.away].some(v => v < range[0] || v > range[1])) flag(label, m, 'puntos esperados fuera de rango', `${r1(pts.home)} / ${r1(pts.away)}`);
      if (num(margin) && Math.abs(margin) > 22) flag(label, m, 'margen esperado exagerado', `${r1(margin)} puntos`);
      if (fav > 93 && a.probabilitySource !== 'published-odds') flag(label, m, 'ganador de más de 93% sin momio', `${r1(fav)}%`);
      const h = line => a.handicaps?.home?.find(row => row.line === line)?.probability;
      rows.push(`| ${name(m)} | ${m.leagueName} | ${r1(w.home)} / ${r1(w.away)}${a.probabilitySource === 'published-odds' ? ' (mercado)' : ''} | ${am(m.odds?.homeWin)} / ${am(m.odds?.awayWin)} | puntos ${r1(pts.home)}–${r1(pts.away)} | hándicap local +5.5 ${r1(h(5.5))} · −5.5 ${r1(h(-5.5))} | ${pick ? `${pick.selection} ${pick.probability}%` : 'N/D'} |`);
    }
    // Recent form shown on the card must agree with its own scores.
    for (const side of ['home', 'away']) for (const game of a.form?.[side] || []) {
      const expected = game.own > game.against ? 'W' : game.own < game.against ? 'L' : 'D';
      if (game.result !== expected) flag(label, m, 'racha W/L no coincide con el marcador', `${side}: ${game.own}-${game.against} marcado ${game.result}`, 'error');
    }
  }
  // Finished results agree with their own breakdown.
  for (const m of feed.matches.filter(m => m.status === 'FINISHED')) {
    if (sport === 'tenis' && !m.retired) {
      const won = side => (m.setScores || []).filter(s => Number.isFinite(s.home) && Number.isFinite(s.away) && s[side] > s[side === 'home' ? 'away' : 'home']).length;
      if (m.liveScore?.home != null && (m.liveScore.home !== won('home') || m.liveScore.away !== won('away'))) flag(label, m, 'sets del marcador no cuadran con los sets jugados', `${m.liveScore.home}-${m.liveScore.away} vs ${won('home')}-${won('away')}`, 'error');
    }
    if (sport === 'beisbol' && Array.isArray(m.inningScores) && m.inningScores.length) {
      const sum = side => m.inningScores.reduce((s, inning) => s + (inning[side] || 0), 0);
      if (m.finalScore?.home != null && (sum('home') !== m.finalScore.home || sum('away') !== m.finalScore.away)) flag(label, m, 'entradas no suman el resultado', `${sum('home')}-${sum('away')} vs ${m.finalScore.home}-${m.finalScore.away}`, 'error');
    }
    if (!m.retired && !['home', 'away'].every(s => Number.isInteger(m.finalScore?.[s] ?? m.liveScore?.[s]))) flag(label, m, 'resultado final incompleto', JSON.stringify(m.finalScore), 'error');
  }
  const header = sport === 'tenis' ? '| Partido | Torneo | Ganador % | Momio | Sets | Gana un set % | Pick |\n|---|---|---|---|---|---|---|'
    : sport === 'beisbol' ? '| Partido | Liga | Ganador % | Momio | Carreras esp. | Totales % | Pick |\n|---|---|---|---|---|---|---|'
    : '| Partido | Liga | Ganador % | Momio | Puntos esp. | Hándicaps % | Pick |\n|---|---|---|---|---|---|---|';
  sections.push({ title: `${label} (${details.length} partidos programados, ${feed.matches.filter(m => m.status === 'FINISHED').length} finalizados)`, header, rows });
}

for (const sport of ['futbol', 'femenil']) await football(sport);
await sports('tenis', 'Tenis'); await sports('beisbol', 'Béisbol');
// Production keeps the NBA/WNBA histories stored; locally they build in the
// background on first use, so wait for them before rating basketball.
const { loadBasketballHistory } = await import('../server/services/basketballHistory.js');
for (const league of ['nba', 'wnba']) for (let i = 0; i < 40 && !(await loadBasketballHistory(league)); i++) await new Promise(r => setTimeout(r, 3000));
await sports('basquetbol', 'Básquetbol');

const errors = flags.filter(f => f.severity === 'error'), review = flags.filter(f => f.severity === 'revisar'), info = flags.filter(f => f.severity === 'info');
const list = items => items.length ? items.map(f => `- **${f.sport}** · ${f.match} (${f.league}): ${f.kind} — ${f.detail}`).join('\n') : '- Ninguno.';
const md = `# Revisión detallada de partidos — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC\n\n`
  + `## Errores (${errors.length})\n${list(errors)}\n\n## Valores a revisar (${review.length})\n${list(review)}\n\n## Avisos informativos (${info.length})\nNo son errores: promedios de muy pocos partidos (la app muestra el aviso) y diferencias grandes entre el porcentaje del modelo propio y el momio de la casa.\n${list(info)}\n\n`
  + sections.map(s => `## ${s.title}\n${s.rows.length ? `${s.header}\n${s.rows.join('\n')}` : 'Sin partidos programados en la ventana de la app.'}`).join('\n\n') + '\n';
const out = process.argv[2];
if (out) await fs.writeFile(out, md);
console.log(JSON.stringify({ errors: errors.length, review: review.length, info: info.length, sections: sections.map(s => `${s.title}: ${s.rows.length}`), flags: [...errors, ...review].slice(0, 60) }, null, 1));
