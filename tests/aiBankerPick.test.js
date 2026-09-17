import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.OPENROUTER_API_KEY = '';

import { generateAiMatchReport } from '../server/services/aiService.js';
import { storage } from '../server/storage.js';

test('AI service calibrates "Brentford gana o empata" to true banker with correct odds, probability, rich rationale, and complementary safePick', async () => {
  const originalAiConfig = await storage.getAiConfig();
  await storage.updateAiConfig({
    provider: 'openrouter',
    apiKey: 'sk-test-ai-key-12345',
    selectedModel: 'test-model'
  });

  const brentfordMatch = {
    id: 'test-brentford-chelsea',
    homeTeam: { name: 'Brentford', shortName: 'BRE', gamesPlayed: 20, goalsFor: 32, goalsAgainst: 28, points: 28, position: 10, form: ['W', 'D', 'L'] },
    awayTeam: { name: 'Chelsea', shortName: 'CHE', gamesPlayed: 20, goalsFor: 34, goalsAgainst: 30, points: 30, position: 8, form: ['L', 'W', 'D'] },
    leagueName: 'Premier League',
    kickoff: new Date(Date.now() + 86400000).toISOString(),
    status: 'SCHEDULED',
    source: 'ESPN',
    probabilities: {
      homeWin: 44,
      draw: 22,
      awayWin: 34,
      over25: 48,
      under25: 52,
      over15: 80,
      under35: 78,
      bttsYes: 54
    },
    odds: {
      homeWin: 2.75,
      draw: 3.40,
      awayWin: 2.45,
      over25: 1.95,
      under25: 1.85,
      dc1X: 1.44
    },
    model: {
      predictedScore: '2 - 1',
      expectedGoals: { home: 1.5, away: 1.2 }
    }
  };

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/chat/completions')) {
        const fakeResponse = {
          choices: [{
            message: {
              content: JSON.stringify({
                predictedScore: '2 - 1',
                tacticalAnalysis: 'Brentford demuestra una gran solidez en transiciones y control del bloque medio en el Gtech Community Stadium.',
                topPick: 'Brentford gana o empata',
                topStake: '3/5 Unidades',
                valueBet: 'Ambos Equipos Anotan: SÍ',
                cornersAnalysis: 'Promedio elevado por bandas.',
                bttsAnalysis: 'Ambos anotan probable por debilidad en pelota parada.'
              })
            }
          }]
        };
        return new Response(JSON.stringify(fakeResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('{}', { status: 200 });
    };

    const report = await generateAiMatchReport(brentfordMatch, { forceRefresh: true });

    assert.ok(report.aiAvailable, 'AI report should be available');
    assert.ok(report.topPick, 'topPick should be present');

    // 1. Selection must be standardized
    assert.ok(
      report.topPick.selection.includes('Brentford') && report.topPick.selection.includes('Empate'),
      `Selection should be Brentford o Empate, got: ${report.topPick.selection}`
    );

    // 2. Probability must be calibrated to Double Chance (44 + 22 = 66%), NOT straight win 44%
    assert.equal(report.topPick.probability, 66, `Probability should be 66%, got: ${report.topPick.probability}`);

    // 3. Odds must be calibrated to Double Chance (1.44), NOT straight win 2.75
    assert.ok(report.topPick.odds >= 1.20 && report.topPick.odds <= 1.60, `Odds should be safe (1.20-1.60), got: ${report.topPick.odds}`);
    assert.notEqual(report.topPick.odds, 2.75, 'Odds must NOT be 2.75 (straight win odds)');

    // 4. Rationale must NOT be "Brentford gana o empata". It must be a rich data-driven justification
    assert.notEqual(report.topPick.rationale.trim(), 'Brentford gana o empata', 'Rationale must not repeat the pick name');
    assert.ok(report.topPick.rationale.length > 25, 'Rationale must be descriptive and statistical');
    assert.ok(
      report.topPick.rationale.toLowerCase().includes('solidez') ||
      report.topPick.rationale.toLowerCase().includes('goles') ||
      report.topPick.rationale.toLowerCase().includes('probabilidad') ||
      report.topPick.rationale.toLowerCase().includes('poisson'),
      'Rationale should contain substantive statistical or tactical terms'
    );

    // 5. safePick must NOT be a duplicate clone of topPick
    assert.ok(report.safePick, 'safePick must be generated');
    assert.notEqual(report.safePick.selection, report.topPick.selection, 'safePick must not duplicate topPick');
    assert.ok(
      report.safePick.selection.includes('Goles') || report.safePick.selection.includes('Menos') || report.safePick.selection.includes('Más'),
      `safePick should be a complementary goals line, got: ${report.safePick.selection}`
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAiConfig) {
      await storage.updateAiConfig(originalAiConfig);
    }
  }
});

test('AI service replaces trivial rationale ("Puebla gana o empata") with rich statistical rationale', async () => {
  const originalAiConfig = await storage.getAiConfig();
  await storage.updateAiConfig({
    provider: 'openrouter',
    apiKey: 'sk-test-ai-key-puebla',
    selectedModel: 'test-model'
  });

  const pueblaMatch = {
    id: 'test-puebla-atlante',
    homeTeam: { name: 'Puebla', shortName: 'PUE', gamesPlayed: 18, goalsFor: 26, goalsAgainst: 22, points: 26, position: 6, form: ['W', 'W', 'D'] },
    awayTeam: { name: 'Atlante', shortName: 'ATL', gamesPlayed: 18, goalsFor: 18, goalsAgainst: 24, points: 19, position: 12, form: ['L', 'D', 'L'] },
    leagueName: 'Liga MX',
    kickoff: new Date(Date.now() + 86400000).toISOString(),
    status: 'SCHEDULED',
    source: 'ESPN',
    probabilities: {
      homeWin: 56,
      draw: 15,
      awayWin: 29,
      over25: 45,
      under25: 55,
      over15: 75,
      under35: 82,
      bttsYes: 50
    },
    odds: {
      homeWin: 1.91,
      draw: 3.30,
      awayWin: 3.80,
      dc1X: 1.34
    },
    model: {
      predictedScore: '2 - 0',
      expectedGoals: { home: 1.6, away: 0.8 }
    }
  };

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                predictedScore: '2 - 0',
                tacticalAnalysis: 'Puebla domina ampliamente con bloque alto y repliegue rápido.',
                topPick: {
                  selection: 'Puebla gana o empata',
                  market: 'Doble Oportunidad',
                  rationale: 'Puebla gana o empata',
                  probability: 56,
                  odds: 1.91
                },
                topStake: '3/5 Unidades',
                valueBet: {
                  selection: 'Menos de 2.5 Goles',
                  odds: 1.80,
                  probability: 55,
                  rationale: 'Ritmo bajo esperado.'
                }
              })
            }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200 });
    };

    const report = await generateAiMatchReport(pueblaMatch, { forceRefresh: true });

    assert.ok(report.aiAvailable);
    // Probability must be 56 + 15 = 71%
    assert.equal(report.topPick.probability, 71);
    // Odds must be 1.34, not 1.91
    assert.equal(report.topPick.odds, 1.34);
    // Rationale must NOT be "Puebla gana o empata"
    assert.notEqual(report.topPick.rationale.trim(), 'Puebla gana o empata');
    assert.ok(report.topPick.rationale.length > 25);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAiConfig) {
      await storage.updateAiConfig(originalAiConfig);
    }
  }
});

test('AI service converts weak straight win (<60%) to safe Double Chance and preserves rich custom rationale', async () => {
  const originalAiConfig = await storage.getAiConfig();
  await storage.updateAiConfig({
    provider: 'openrouter',
    apiKey: 'sk-test-ai-key-arsenal',
    selectedModel: 'test-model'
  });

  const balancedMatch = {
    id: 'test-arsenal-liverpool',
    homeTeam: { name: 'Arsenal', shortName: 'ARS', gamesPlayed: 25, goalsFor: 45, goalsAgainst: 22, points: 55, position: 2, form: ['W', 'D', 'W'] },
    awayTeam: { name: 'Liverpool', shortName: 'LIV', gamesPlayed: 25, goalsFor: 48, goalsAgainst: 26, points: 54, position: 3, form: ['W', 'W', 'L'] },
    leagueName: 'Premier League',
    kickoff: new Date(Date.now() + 86400000).toISOString(),
    status: 'SCHEDULED',
    source: 'ESPN',
    probabilities: {
      homeWin: 48,
      draw: 27,
      awayWin: 25,
      over25: 55,
      under25: 45,
      over15: 84,
      under35: 75,
      bttsYes: 60
    },
    odds: {
      homeWin: 2.10,
      draw: 3.40,
      awayWin: 3.20,
      dc1X: 1.33
    },
    model: {
      predictedScore: '2 - 1',
      expectedGoals: { home: 1.7, away: 1.3 }
    }
  };

  const richRationaleText = 'Arsenal mantiene un récord invicto de 8 partidos en Emirates Stadium con presión alta y transiciones punzantes.';

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                predictedScore: '2 - 1',
                tacticalAnalysis: 'Duelo táctico de alta intensidad con ventaja de posesión para los locales.',
                topPick: {
                  selection: 'Gana Arsenal', // Straight win with 48% prob -> must convert to DC for banker safety!
                  market: '1X2',
                  rationale: richRationaleText,
                  probability: 48,
                  odds: 2.10
                },
                topStake: '3/5 Unidades',
                valueBet: {
                  selection: 'Ambos Equipos Anotan: SÍ',
                  odds: 1.75,
                  probability: 60,
                  rationale: 'Poder ofensivo demostrado en ambas escuadras.'
                }
              })
            }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200 });
    };

    const report = await generateAiMatchReport(balancedMatch, { forceRefresh: true });

    assert.ok(report.aiAvailable);
    // 1. Weak straight win (48%) converted to Double Chance (48 + 27 = 75%)
    assert.ok(report.topPick.selection.includes('Arsenal') && report.topPick.selection.includes('Empate'));
    assert.equal(report.topPick.probability, 75);
    assert.ok(report.topPick.odds >= 1.20 && report.topPick.odds <= 1.50);

    // 2. Rich custom rationale was preserved
    assert.equal(report.topPick.rationale, richRationaleText);

    // 3. safePick is not duplicate DC
    assert.ok(report.safePick.selection.includes('Goles'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAiConfig) {
      await storage.updateAiConfig(originalAiConfig);
    }
  }
});

test('AI service correctly recognizes away Double Chance ("Visita o Empate") without inverting to home team, and preserves real DC market odds', async () => {
  const originalAiConfig = await storage.getAiConfig();
  await storage.updateAiConfig({
    provider: 'openrouter',
    apiKey: 'sk-test-away-dc',
    selectedModel: 'test-model'
  });

  const awayFavoredMatch = {
    id: 'test-mallorca-realmadrid',
    homeTeam: { name: 'Mallorca', shortName: 'MAL', gamesPlayed: 24, goalsFor: 19, goalsAgainst: 28, points: 22, position: 15, form: ['L', 'D', 'L'] },
    awayTeam: { name: 'Real Madrid', shortName: 'RMA', gamesPlayed: 24, goalsFor: 52, goalsAgainst: 18, points: 58, position: 1, form: ['W', 'W', 'W'] },
    leagueName: 'La Liga',
    kickoff: new Date(Date.now() + 86400000).toISOString(),
    status: 'SCHEDULED',
    source: 'ESPN',
    probabilities: {
      homeWin: 16,
      draw: 22,
      awayWin: 62,
      over25: 58,
      under25: 42,
      over15: 84,
      under35: 76,
      bttsYes: 48
    },
    odds: {
      homeWin: 5.50,
      draw: 3.80,
      awayWin: 1.62,
      dc1X: 2.30,
      dcX2: 1.16
    },
    model: {
      predictedScore: '0 - 2',
      expectedGoals: { home: 0.7, away: 2.1 }
    }
  };

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                predictedScore: '0 - 2',
                tacticalAnalysis: 'Con un xG de 2.1 goles esperados, Real Madrid ejerce control absoluto frente al repliegue bajo local.',
                topPick: {
                  selection: 'Visita o Empate', // Away DC phrase without exact team name -> must NOT invert to Mallorca (1X)!
                  market: 'Doble Oportunidad',
                  rationale: 'Real Madrid sostiene superioridad de posesión y efectividad en transiciones ofensivas.',
                  probability: 84,
                  odds: 1.16
                },
                topStake: '4/5 Unidades',
                valueBet: {
                  selection: 'Más de 2.5 Goles',
                  odds: 1.85,
                  probability: 58,
                  rationale: 'Capacidad rematadora de los atacantes blancos.'
                }
              })
            }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200 });
    };

    const report = await generateAiMatchReport(awayFavoredMatch, { forceRefresh: true });

    assert.ok(report.aiAvailable);
    // Selection must be Real Madrid (X2), NOT Mallorca (1X)!
    assert.ok(report.topPick.selection.includes('Real Madrid') && report.topPick.selection.includes('X2'));
    assert.ok(!report.topPick.selection.includes('Mallorca'), 'Must NOT invert away DC to home team');
    assert.equal(report.topPick.probability, 84); // 62 + 22 = 84%
    assert.equal(report.topPick.odds, 1.16); // Preserved real market dcX2 odds
    assert.ok(report.safePick.selection.includes('Goles'), 'safePick should provide complementary goals line');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAiConfig) {
      await storage.updateAiConfig(originalAiConfig);
    }
  }
});

test('AI service does not overwrite legitimate goals pick with team harmonization and baseline includes complete distinct picks', async () => {
  const originalAiConfig = await storage.getAiConfig();
  await storage.updateAiConfig({
    provider: 'openrouter',
    apiKey: 'sk-test-goals-banker',
    selectedModel: 'test-model'
  });

  const defensiveMatch = {
    id: 'test-getafe-leganes',
    homeTeam: { name: 'Getafe', shortName: 'GET', gamesPlayed: 20, goalsFor: 14, goalsAgainst: 16, points: 24, position: 12, form: ['D', 'D', 'W'] },
    awayTeam: { name: 'Leganés', shortName: 'LEG', gamesPlayed: 20, goalsFor: 12, goalsAgainst: 18, points: 21, position: 14, form: ['L', 'D', 'D'] },
    leagueName: 'La Liga',
    kickoff: new Date(Date.now() + 86400000).toISOString(),
    status: 'SCHEDULED',
    source: 'ESPN',
    probabilities: {
      homeWin: 45,
      draw: 35,
      awayWin: 20,
      over25: 28,
      under25: 72,
      over15: 55,
      under35: 86,
      bttsYes: 38
    },
    odds: {
      homeWin: 2.15,
      draw: 2.90,
      awayWin: 4.20,
      under25: 1.48,
      under35: 1.18,
      dc1X: 1.25
    },
    model: {
      predictedScore: '1 - 0',
      expectedGoals: { home: 1.0, away: 0.6 }
    }
  };

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                predictedScore: '1 - 0',
                tacticalAnalysis: 'Con un xG combinado de 1.6 goles esperados, ambos equipos forman bloques ultradefensivos con poca llegada.',
                topPick: {
                  selection: 'Menos de 2.5 Goles',
                  market: 'Total Goles Under 2.5',
                  rationale: 'Con 1.6 xG proyectado y defensas férreas, la probabilidad de menos de 3 goles es altísima.',
                  probability: 72,
                  odds: 1.48
                },
                topStake: '3/5 Unidades',
                valueBet: {
                  selection: 'Getafe o Empate (1X)',
                  odds: 1.25,
                  probability: 80,
                  rationale: 'Ventaja de localía de Getafe en el Coliseum.'
                }
              })
            }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200 });
    };

    const report = await generateAiMatchReport(defensiveMatch, { forceRefresh: true });

    assert.ok(report.aiAvailable);
    // 1. Goal line pick was NOT overwritten by team harmonization
    assert.equal(report.topPick.selection, 'Menos de 2.5 Goles');
    assert.equal(report.topPick.probability, 72);
    assert.equal(report.topPick.odds, 1.48);

    // 2. safePick should be Double Chance because topPick was NOT Double Chance
    assert.ok(report.safePick.selection.includes('Getafe') && report.safePick.selection.includes('Empate'));

    // 3. Baseline check when AI is disabled
    await storage.updateAiConfig({ apiKey: '' });
    const baselineReport = await generateAiMatchReport(defensiveMatch, { forceRefresh: true });
    assert.equal(baselineReport.aiAvailable, false);
    assert.ok(baselineReport.topPick, 'Baseline must have topPick when match has probabilities');
    assert.ok(baselineReport.safePick, 'Baseline must have safePick when match has probabilities');
    assert.ok(baselineReport.secondaryPick, 'Baseline must have secondaryPick when match has probabilities');
    assert.notEqual(baselineReport.topPick.selection, baselineReport.safePick.selection, 'Baseline picks must be complementary');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAiConfig) {
      await storage.updateAiConfig(originalAiConfig);
    }
  }
});

