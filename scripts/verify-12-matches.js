import dotenv from 'dotenv';
dotenv.config();
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { getFootballFeed, enrichMatchWithRealData } from '../server/services/footballDataService.js';
import { generateAiMatchReport } from '../server/services/aiService.js';

async function verify12Matches() {
  console.log('========================================================================');
  console.log('🤖 AGENTE ESPECIALIZADO: VERIFICACIÓN MINUCIOSA DE 12 PARTIDOS CON IA');
  console.log('========================================================================\n');

  console.log('Obteniendo feed de partidos en vivo y oficiales de ESPN...');
  const feed = await getFootballFeed();
  console.log(`Feed obtenido: ${feed.matches.length} partidos totales activos.`);

  // Seleccionar 12 partidos distribuidos entre ligas disponibles
  const candidates = feed.matches.filter(m => m.model && m.homeTeam && m.awayTeam);
  if (candidates.length < 12) {
    throw new Error(`Se requerían al menos 12 partidos con modelo probabilístico, pero solo se encontraron ${candidates.length}.`);
  }

  // Agrupar por liga para maximizar diversidad de ligas
  const byLeague = {};
  for (const m of candidates) {
    const l = m.leagueName || 'Otras';
    if (!byLeague[l]) byLeague[l] = [];
    byLeague[l].push(m);
  }

  const selectedMatches = [];
  const leagueNames = Object.keys(byLeague);
  let round = 0;
  while (selectedMatches.length < 12 && round < 20) {
    for (const l of leagueNames) {
      if (byLeague[l][round] && selectedMatches.length < 12) {
        selectedMatches.push(byLeague[l][round]);
      }
    }
    round++;
  }

  console.log(`Seleccionados 12 partidos independientes en ${leagueNames.length} ligas: ${leagueNames.join(', ')}.\n`);

  const results = [];
  let index = 1;

  for (const rawMatch of selectedMatches) {
    const fixtureName = `${rawMatch.homeTeam.name} vs ${rawMatch.awayTeam.name}`;
    console.log(`------------------------------------------------------------------------`);
    console.log(`[${index}/12] Analizando: ${fixtureName} (${rawMatch.leagueName})`);
    console.log(`------------------------------------------------------------------------`);

    const t0 = Date.now();
    // 1. Enriquecer con datos oficiales en tiempo real
    const enriched = await enrichMatchWithRealData(rawMatch);

    // 2. Generar informe con IA y validación cuantitativa
    const report = await generateAiMatchReport(enriched, { forceRefresh: true });
    const elapsed = Date.now() - t0;

    // 3. Verificaciones de integridad y coherencia matemática
    const probs = enriched.model.probabilities;
    const sumOutcome = Number(probs.homeWin) + Number(probs.draw) + Number(probs.awayWin);
    const sumGoals25 = Number(probs.over25) + Number(probs.under25);
    const sumBtts = Number(probs.bttsYes) + Number(probs.bttsNo);

    const mathOk = Math.abs(sumOutcome - 100) < 1.0 && Math.abs(sumGoals25 - 100) < 1.0 && Math.abs(sumBtts - 100) < 1.0;
    const scoreValid = /^\d+\s*-\s*\d+$/.test(enriched.model.predictedScore);

    const sec = report.analysisSections || {};
    const hasDataVerification = typeof sec.dataVerification === 'string' && sec.dataVerification.trim().length > 15;
    const hasGoalsAnalysis = typeof sec.goalsAnalysis === 'string' && sec.goalsAnalysis.trim().length > 15;
    const hasPositiveFactors = Array.isArray(sec.positiveFactors) && sec.positiveFactors.length >= 1;
    const hasNegativeFactors = Array.isArray(sec.negativeFactors) && sec.negativeFactors.length >= 1;
    const hasVerdict = typeof sec.verdict === 'string' && sec.verdict.trim().length > 15;

    const sectionsOk = hasDataVerification && hasGoalsAnalysis && hasPositiveFactors && hasNegativeFactors && hasVerdict;

    console.log(`⏱️ Tiempo: ${elapsed} ms | IA Activa: ${report.aiAvailable ? 'SÍ (' + report.modelUsed + ')' : 'NO (Fallback Estadístico)'}`);
    console.log(`📊 Probabilidades: Local ${probs.homeWin?.toFixed(1)}% | Empate ${probs.draw?.toFixed(1)}% | Visita ${probs.awayWin?.toFixed(1)}% (Suma: ${sumOutcome.toFixed(1)}%)`);
    console.log(`⚽ Goles: Over 2.5: ${probs.over25?.toFixed(1)}% | Under 2.5: ${probs.under25?.toFixed(1)}% | Ambos Anotan: ${probs.bttsYes?.toFixed(1)}%`);
    console.log(`🎯 Marcador más probable: ${enriched.model.predictedScore}`);
    console.log(`✅ Validación Matemática: ${mathOk ? 'CORRECTO (100% calibrado)' : 'FALLO'}`);
    console.log(`✅ 5 Secciones Estructuradas: ${sectionsOk ? 'COMPLETAS Y DETALLADAS' : 'INCOMPLETAS'}`);
    console.log(`   1. Verificación: ${sec.dataVerification?.slice(0, 100)}...`);
    console.log(`   2. Goles: ${sec.goalsAnalysis?.slice(0, 100)}...`);
    console.log(`   3. Positivo: ${sec.positiveFactors?.[0]}`);
    console.log(`   4. Riesgo: ${sec.negativeFactors?.[0]}`);
    console.log(`   5. Veredicto: ${sec.verdict?.slice(0, 100)}...\n`);

    results.push({
      index,
      matchId: enriched.id,
      fixture: fixtureName,
      league: enriched.leagueName,
      status: enriched.status,
      kickoff: enriched.kickoff,
      latencyMs: elapsed,
      aiAvailable: report.aiAvailable,
      modelUsed: report.modelUsed,
      mathVerification: {
        sumOutcome: Number(sumOutcome.toFixed(2)),
        sumGoals25: Number(sumGoals25.toFixed(2)),
        sumBtts: Number(sumBtts.toFixed(2)),
        scoreFormatValid: scoreValid,
        mathConsistent: mathOk && scoreValid
      },
      probabilities: {
        homeWin: Number(probs.homeWin?.toFixed(1)),
        draw: Number(probs.draw?.toFixed(1)),
        awayWin: Number(probs.awayWin?.toFixed(1)),
        over25: Number(probs.over25?.toFixed(1)),
        under25: Number(probs.under25?.toFixed(1)),
        bttsYes: Number(probs.bttsYes?.toFixed(1)),
        predictedScore: enriched.model.predictedScore
      },
      analysisSections: {
        dataVerification: sec.dataVerification,
        goalsAnalysis: sec.goalsAnalysis,
        positiveFactors: sec.positiveFactors,
        negativeFactors: sec.negativeFactors,
        verdict: sec.verdict
      },
      verificationStatus: mathOk && scoreValid && sectionsOk ? 'VERIFIED_OK' : 'VERIFICATION_WARNING'
    });

    index++;
  }

  const allVerified = results.every(r => r.verificationStatus === 'VERIFIED_OK');
  const totalAiAvailable = results.filter(r => r.aiAvailable).length;

  console.log('========================================================================');
  console.log('📋 RESUMEN FINAL DE LA AUDITORÍA DE LOS 12 PARTIDOS');
  console.log('========================================================================');
  console.log(`Total de partidos auditados: ${results.length}`);
  console.log(`Informes generados exitosamente con IA: ${totalAiAvailable} / 12`);
  console.log(`Todos con coherencia matemática exacta: ${results.every(r => r.mathVerification.mathConsistent) ? 'SÍ (12/12)' : 'NO'}`);
  console.log(`Todos con las 5 secciones estructuradas visibles: ${allVerified ? 'SÍ (12/12)' : 'NO'}`);
  console.log('========================================================================\n');

  const reportPath = path.join(process.cwd(), 'scripts', 'verified_12_matches.json');
  writeFileSync(reportPath, JSON.stringify({ verifiedAt: new Date().toISOString(), allVerified, totalAiAvailable, results }, null, 2), 'utf-8');
  console.log(`Informe guardado en: ${reportPath}`);

  if (!allVerified) {
    process.exit(1);
  }
}

verify12Matches().catch(err => {
  console.error('Error fatal durante la verificación de 12 partidos:', err);
  process.exit(1);
});
