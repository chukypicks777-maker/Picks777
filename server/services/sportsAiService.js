import { generateGroundedAiReport, readGroundedAiReport } from './aiService.js';
import { sportWinnerPick } from '../../src/utils/sportPicks.js';

// A stored AI selection is re-rendered with the current calendar, quotes and
// analysis, so poll timestamps never create a second paid request.
export async function readSportsAiReport(match) {
  if (!match?.homeTeam || !match?.awayTeam) return null;
  const { facts, baseline } = sportsReportInputs(match);
  return readGroundedAiReport(match, facts, baseline);
}

export function sportsReportFacts(match) {
  const a = match.analysis || {}, home = match.homeTeam.name, away = match.awayTeam.name;
  const pct = value => typeof value === 'number' && Number.isFinite(value) ? `${value}%` : 'N/D';
  const facts = [
    { id: 'fixture', text: `${home} vs ${away}. ${match.leagueName}${match.tournamentName ? ` · ${match.tournamentName}` : ''}. Inicio: ${match.kickoff}. Estado: ${match.status}.` },
    { id: 'source', text: `Registros de ${match.source || 'la fuente deportiva'}: ${match.sourceUrl || 'N/D'}. Consulta: ${match.fetchedAt || 'N/D'}.` },
    { id: 'winner', text: `Ganador previo (${a.probabilitySource === 'published-odds' ? 'mercado sin margen' : a.ratingSample || a.kind === 'tennis' ? 'modelo propio comprobado a ciegas con partidos anteriores, sin cuotas' : 'modelo experimental sin calibración de aciertos'}${match.allowsDraw ? ', tres resultados; no equivale a moneyline de dos resultados' : ''}): ${home} ${pct(a.winner?.home)}, ${away} ${pct(a.winner?.away)}${match.allowsDraw ? `, empate ${pct(a.winner?.draw)}` : ''}.` },
    { id: 'sample', text: `Muestra anterior al encuentro: ${home} ${a.sampleSize?.home ?? 0} partidos; ${away} ${a.sampleSize?.away ?? 0} partidos.` },
    { id: 'method', text: a.method || 'Sin datos suficientes para calcular el modelo.' },
    { id: 'limits', text: 'Probabilidades previas, sin validación prospectiva. No se verificaron alineaciones, lesiones ni noticias. No son garantías ni probabilidades ajustadas al marcador en vivo.' }
  ];
  if (match.liveSupported === false) facts.push({ id: 'coverage', text: 'Calendario y resultados oficiales; no hay marcador en vivo verificado ni probabilidades actualizadas al estado en vivo.' });
  if (!match.oddsProvider) facts.push({ id: 'quoteCoverage', text: 'Sin cuota publicada de una casa en esta ficha. Los precios teóricos derivados de probabilidades no son ofertas de apuestas.' });
  for (const side of ['home', 'away']) {
    const team = side === 'home' ? home : away;
    if (a.form?.[side]?.length) facts.push({ id: `form_${side}`, text: `Resultados anteriores de ${team}, más antiguo a más reciente: ${a.form[side].map(game => `${game.date} · ${game.opponent || 'rival'} · ${game.own}–${game.against} (${game.result})`).join('; ')}.` });
    if (a.teamRuns?.[side]) facts.push({ id: `runs_${side}`, text: `Carreras de ${team}: ${a.teamRuns[side].map(row => `línea ${row.line}, Over ${pct(row.over)}, Under ${pct(row.under)}`).join('; ')}.` });
    if (a.handicaps?.[side]) facts.push({ id: `handicap_${side}`, text: `Hándicaps de ${team}: ${a.handicaps[side].map(row => `${row.line > 0 ? '+' : ''}${row.line}: ${pct(row.probability)}`).join('; ')}.` });
  }
  if (match.sport === 'tenis') {
    facts.push({ id: 'sets', text: `Primer set: ${home} ${pct(a.firstSet?.home)}, ${away} ${pct(a.firstSet?.away)}. Segundo set: ${home} ${pct(a.secondSet?.home)}, ${away} ${pct(a.secondSet?.away)}. Al menos un set: ${home} Sí ${pct(a.winsSet?.home?.yes)}, No ${pct(a.winsSet?.home?.no)}; ${away} Sí ${pct(a.winsSet?.away?.yes)}, No ${pct(a.winsSet?.away?.no)}. Mejor de ${a.maxSets || match.maxSets || 3} sets.` });
  }
  if (a.firstInning) facts.push({ id: 'first_inning', text: `Primer inning: ${home} ${pct(a.firstInning.home)}, empate ${pct(a.firstInning.draw)}, ${away} ${pct(a.firstInning.away)}.` });
  if (a.firstFive) facts.push({ id: 'first_five', text: `Totales innings 1 a 5: ${a.firstFive.map(row => `${row.line}: Over ${pct(row.over)}, Under ${pct(row.under)}`).join('; ')}.` });
  if (a.extraInnings) facts.push({ id: 'extra', text: `Extra innings: Sí ${pct(a.extraInnings.yes)}, No ${pct(a.extraInnings.no)}. Muestra verificada: ${a.extraInningsSampleSize?.uniqueGames ?? 0} encuentros.` });
  return facts;
}

export function sportsReportInputs(match) {
  const facts = sportsReportFacts(match), pick = sportWinnerPick(match), a = match.analysis || {};
  const baseline = { aiAvailable: false, modelUsed: null, generatedAt: new Date().toISOString(), source: match.source, sourceUrl: match.sourceUrl,
    dataFetchedAt: match.fetchedAt, probabilities: a.winner, topPick: pick, facts: facts.map(fact => fact.text),
    analysisSections: { dataVerification: facts.find(fact => fact.id === 'sample').text, verdict: pick ? `${pick.selection}: ${pick.probability}% estimado.` : 'Sin datos suficientes para un ganador.' },
    narrativeAnalysis: facts.map(fact => fact.text).join('\n\n'), aiStatus: 'Cálculo estadístico disponible; proveedor de IA sin configurar.',
    limitations: facts.find(fact => fact.id === 'limits').text };
  return { facts, baseline };
}

export async function generateAiSportsReport(match, options = {}) {
  const { facts, baseline } = sportsReportInputs(match);
  return generateGroundedAiReport(match, facts, baseline, options);
}
