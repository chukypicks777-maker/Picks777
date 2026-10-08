import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const source = await readFile(new URL('../src/components/NumberCounter.jsx', import.meta.url), 'utf8');
const { code } = await transformWithOxc(source, 'NumberCounter.jsx', { jsx: { runtime: 'classic' } });
const moduleCode = code.replace('"react"', JSON.stringify(import.meta.resolve('react')));
const numberCounterDataUri = 'data:text/javascript;base64,' + Buffer.from(moduleCode).toString('base64');
const fairOddsCode = (await transformWithOxc(await readFile(new URL('../src/components/FairOdds.jsx', import.meta.url), 'utf8'), 'FairOdds.jsx', { jsx: { runtime: 'classic' } })).code
  .replace('"react"', JSON.stringify(import.meta.resolve('react'))).replace('"../utils/oddsFormatter.js"', JSON.stringify(import.meta.resolve('../src/utils/oddsFormatter.js')));
const fairOddsDataUri = 'data:text/javascript;base64,' + Buffer.from(fairOddsCode).toString('base64');
const { default: NumberCounter } = await import(numberCounterDataUri);

async function loadComponent(relativePath, filename, extraReplaces = {}) {
  const compSource = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const { code: compCode } = await transformWithOxc(compSource, filename, { jsx: { runtime: 'classic' } });
  let modCode = compCode
    .replaceAll('"react"', JSON.stringify(import.meta.resolve('react')))
    .replaceAll('"lucide-react"', JSON.stringify(import.meta.resolve('lucide-react')))
    .replaceAll('"../auth/platform.js"', JSON.stringify(import.meta.resolve('../src/auth/platform.js')))
    .replaceAll('"./NumberCounter"', JSON.stringify(numberCounterDataUri))
    .replaceAll('"./FairOdds"', JSON.stringify(fairOddsDataUri))
    .replaceAll('"../utils/audioEffects"', JSON.stringify(import.meta.resolve('../src/utils/audioEffects.js')))
    .replaceAll('"../utils/probability"', JSON.stringify(import.meta.resolve('../src/utils/probability.js')))
    .replaceAll('"../utils/matchSchedule.js"', JSON.stringify(import.meta.resolve('../src/utils/matchSchedule.js')))
    .replaceAll('"../utils/marketProbability.js"', JSON.stringify(import.meta.resolve('../src/utils/marketProbability.js')))
    .replaceAll('"../utils/mathProbabilities"', JSON.stringify(import.meta.resolve('../src/utils/mathProbabilities.js')));
  for (const [key, val] of Object.entries(extraReplaces)) {
    modCode = modCode.replaceAll(key, val);
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(modCode).toString('base64'))).default;
}

const HalfGoalsSection = await loadComponent('../src/components/HalfGoalsSection.jsx', 'HalfGoalsSection.jsx');
const OverUnderGroupedSection = await loadComponent('../src/components/OverUnderGroupedSection.jsx', 'OverUnderGroupedSection.jsx');
const LiveTicker = await loadComponent('../src/components/LiveTicker.jsx', 'LiveTicker.jsx');
const plainWrapper = 'data:text/javascript;base64,' + Buffer.from(`import React from ${JSON.stringify(import.meta.resolve('react'))}; export default function Wrapper({children}) { return React.createElement('div', null, children); }`).toString('base64');
const HeroFeaturedMatch = await loadComponent('../src/components/HeroFeaturedMatch.jsx', 'HeroFeaturedMatch.jsx', {
  '"../utils/oddsFormatter"': JSON.stringify(import.meta.resolve('../src/utils/oddsFormatter.js')),
  '"../utils/parlayTicket.js"': JSON.stringify(import.meta.resolve('../src/utils/parlayTicket.js')),
  '"../utils/analysisCache"': JSON.stringify(import.meta.resolve('../src/utils/analysisCache.js')),
  '"./TiltCard"': JSON.stringify(plainWrapper),
  '"./RadarScanner"': JSON.stringify(plainWrapper)
});
const MatchCard = await loadComponent('../src/components/MatchCard.jsx', 'MatchCard.jsx', {
  '"../utils/oddsFormatter"': JSON.stringify(import.meta.resolve('../src/utils/oddsFormatter.js')),
  '"../utils/parlayTicket.js"': JSON.stringify(import.meta.resolve('../src/utils/parlayTicket.js')),
  '"../utils/analysisCache"': JSON.stringify(import.meta.resolve('../src/utils/analysisCache.js')),
  '"./TiltCard"': JSON.stringify(plainWrapper)
});

test('featured fixture never invents a score, 88 percent confidence or a quote from another pick', () => {
  const match = { id: 'featured-missing-data', status: 'FINISHED', kickoff: new Date().toISOString(), homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, liveScore: { home: null, away: null }, finalScore: { home: null, away: null }, probabilities: {} };
  const missing = renderToStaticMarkup(React.createElement(HeroFeaturedMatch, { match }));
  assert.match(missing, /N\/D - N\/D/); assert.match(missing, /Sin datos suficientes/);
  assert.doesNotMatch(missing, /88%|0 - 0|Conf\./);
  const reported = renderToStaticMarkup(React.createElement(HeroFeaturedMatch, { match: { ...match, finalScore: { home: 0, away: 0 }, aiPick: { selection: 'Empate', probability: 30, confidence: '88%', odds: 3.5 } } }));
  assert.match(reported, /0 - 0/); assert.match(reported, /30% Prob\. estimada/); assert.match(reported, /Cuota publicada/);
  assert.doesNotMatch(reported, /88%/);
  const standard = renderToStaticMarkup(React.createElement(MatchCard, { match }));
  assert.doesNotMatch(standard, />0<\/span>/, 'Unknown scores must not become zero on the ordinary fixture card');
});

test('ticker never invents a 0–0 score or announces an empty feed as live', () => {
  const missing = { homeTeam: { name: 'Home' }, awayTeam: { name: 'Away' }, liveScore: { home: null, away: null }, finalScore: { home: null, away: null } };
  for (const status of ['LIVE', 'FINISHED']) {
    const html = renderToStaticMarkup(React.createElement(LiveTicker, { matches: [{ ...missing, status }] }));
    assert.match(html, /Home N\/D - N\/D Away/);
    assert.doesNotMatch(html, /Home 0 - 0 Away/);
    const genuineZero = renderToStaticMarkup(React.createElement(LiveTicker, { matches: [{ ...missing, status, liveScore: { home: 0, away: 0 }, finalScore: { home: 0, away: 0 } }] }));
    assert.match(genuineZero, /Home 0 - 0 Away/);
  }
  const empty = renderToStaticMarkup(React.createElement(LiveTicker));
  assert.doesNotMatch(empty, /LIVE ESPN/);
  assert.match(empty, /Sin partidos disponibles/);
  const onlyResults = renderToStaticMarkup(React.createElement(LiveTicker, { matches: [{ ...missing, status: 'FINISHED', aiPick: { settlement: 'WON' } }] }));
  assert.match(onlyResults, /Resultado del proveedor/);
  assert.doesNotMatch(onlyResults, /Parlay Banquero|cuotas disponibles|Pronóstico Acertado|Pick IA/);
});

test('football cards and spotlight retain published 1X2 prices, avoid unquoted winner prices, and show dates for all statuses', () => {
  const match = { id: 'quotes-and-date', kickoff: '2026-10-05T21:00:00Z', homeTeam: { name: 'Equipo A' }, awayTeam: { name: 'Equipo B' },
    probabilities: { homeWin: 50, draw: 30, awayWin: 20 }, odds: { homeWin: 1.8, draw: 3.5, awayWin: 4.5 } };
  for (const Component of [MatchCard, HeroFeaturedMatch]) {
    for (const status of ['SCHEDULED', 'LIVE', 'FINISHED']) {
      const html = renderToStaticMarkup(React.createElement(Component, { match: { ...match, status }, oddsFormat: 'american' }));
      assert.match(html, /dateTime="2026-10-05T21:00:00Z"/);
      for (const price of ['-125', '+250', '+350']) assert.ok(html.includes(price));
      assert.match(html, /Publicado/);
    }
    const theoretical = renderToStaticMarkup(React.createElement(Component, { match: { ...match, status: 'SCHEDULED', odds: {} }, oddsFormat: 'american' }));
    assert.match(theoretical, /N\/D/); assert.doesNotMatch(theoretical, /\+400/);
    assert.match(theoretical, /Sin calibración de aciertos/);
  }
});

test('probability display never turns unavailable data into 0% or animates false intermediate values', () => {
  for (const value of [null, undefined, NaN, Infinity, '']) {
    const html = renderToStaticMarkup(React.createElement(NumberCounter, { value, suffix: '%' }));
    assert.match(html, /N\/D/); assert.doesNotMatch(html, /0%/);
  }
  assert.match(renderToStaticMarkup(React.createElement(NumberCounter, { value: 81, suffix: '%' })), /81%/);
  assert.match(renderToStaticMarkup(React.createElement(NumberCounter, { value: 0, suffix: '%' })), /0%/);
  assert.match(renderToStaticMarkup(React.createElement(NumberCounter, { value: 1.200332222, decimals: 12 })), /1\.20</);
});

test('HalfGoalsSection locks 1st half with VIP overlay when isVip=false and unlocks when isVip=true', () => {
  const matchWithHalves = {
    status: 'SCHEDULED',
    halfGoals: {
      first: { over05: 65, under05: 35, over15: 30, under15: 70, over25: 10, under25: 90, over35: 2, under35: 98 },
      second: { over05: 75, under05: 25, over15: 45, under15: 55, over25: 20, under25: 80, over35: 5, under35: 95 },
      sampleSize: { home: 10, away: 10 },
      method: 'Test model'
    }
  };

  // When not VIP
  const lockedHtml = renderToStaticMarkup(React.createElement(HalfGoalsSection, { match: matchWithHalves, isVip: false }));
  assert.match(lockedHtml, /SOLO ACCESO VIP/);
  assert.match(lockedHtml, /Desbloquear con VIP/);
  assert.match(lockedHtml, /1ª Mitad · Total de Goles/);
  assert.match(lockedHtml, /blur-\[5px\]/);

  // When VIP
  const unlockedHtml = renderToStaticMarkup(React.createElement(HalfGoalsSection, { match: matchWithHalves, isVip: true }));
  assert.doesNotMatch(unlockedHtml, /SOLO ACCESO VIP/);
  assert.doesNotMatch(unlockedHtml, /Desbloquear con VIP/);
  assert.doesNotMatch(unlockedHtml, /blur-\[5px\]/);
  // Every half line shows the fair price of its probability in the chosen format.
  const american = renderToStaticMarkup(React.createElement(HalfGoalsSection, { match: matchWithHalves, isVip: true, oddsFormat: 'american' }));
  assert.match(american, /Momio justo -186/, '65% -> 1.54 decimal -> -186 American');
  assert.match(american, /Momio justo \+1900/, '5% -> 20.00 decimal -> +1900 American');
});

test('OverUnderGroupedSection locks LADO OVERS with VIP overlay when isVip=false and unlocks when isVip=true', () => {
  const match = {
    status: 'SCHEDULED',
    probabilities: { over05: 90, over15: 75, over25: 55, over35: 30, over45: 12 }
  };
  const diff = {
    matchCardsProbs: { over35: 40, under35: 60 },
    matchCornersProbs: { over55: 60, over85: 30 }
  };

  // When not VIP
  const lockedHtml = renderToStaticMarkup(React.createElement(OverUnderGroupedSection, { match, diff, isVip: false }));
  assert.match(lockedHtml, /Lado OVERS \(\+\) Exclusivo/);
  assert.match(lockedHtml, /SOLO ACCESO VIP/);
  assert.match(lockedHtml, /Desbloquear con VIP/);
  assert.match(lockedHtml, /blur-\[5px\]/);

  // When VIP
  const unlockedHtml = renderToStaticMarkup(React.createElement(OverUnderGroupedSection, { match, diff, isVip: true }));
  assert.doesNotMatch(unlockedHtml, /Lado OVERS \(\+\) Exclusivo/);
  assert.doesNotMatch(unlockedHtml, /SOLO ACCESO VIP/);
  assert.doesNotMatch(unlockedHtml, /Desbloquear con VIP/);
  assert.doesNotMatch(unlockedHtml, /blur-\[5px\]/);
});

test('OverUnderGroupedSection reconstructs goal ladder while preserving missing card data when feed only has over25', () => {
  const sparseMatch = {
    status: 'SCHEDULED',
    probabilities: { over25: 59, under25: 41 },
    odds: { over25: 1.70, under25: 2.10 }
  };
  const sparseDiff = {};

  const html = renderToStaticMarkup(React.createElement(OverUnderGroupedSection, {
    match: sparseMatch,
    homeStats: {},
    awayStats: {},
    diff: sparseDiff,
    isVip: true
  }));

  // Assert that none of the goal lines or cards show N/D
  assert.match(html, /\+0\.5 Goles[\s\S]*?(\d+)%/);
  assert.match(html, /\+1\.5 Goles[\s\S]*?(\d+)%/);
  assert.match(html, /\+2\.5 Goles[\s\S]*?Momio justo 1\.69[\s\S]*?59%/);
  assert.match(html, /-2\.5 Goles[\s\S]*?Momio justo 2\.44[\s\S]*?41%/);
  assert.match(html, /\+3\.5 Goles[\s\S]*?(\d+)%/);
  assert.match(html, /Sin muestra verificada suficiente/);

  // Extract percentages to verify monotonicity
  const p05 = Number(html.match(/\+0\.5 Goles[\s\S]*?(\d+)%/)[1]);
  const p15 = Number(html.match(/\+1\.5 Goles[\s\S]*?(\d+)%/)[1]);
  const p25 = 59;
  const p35 = Number(html.match(/\+3\.5 Goles[\s\S]*?(\d+)%/)[1]);

  assert.ok(p05 > p15, `Over 0.5 (${p05}%) must be greater than Over 1.5 (${p15}%)`);
  assert.ok(p15 > p25, `Over 1.5 (${p15}%) must be greater than Over 2.5 (${p25}%)`);
  assert.ok(p25 > p35, `Over 2.5 (${p25}%) must be greater than Over 3.5 (${p35}%)`);
});

test('football renders the full requested corner and card ladders on both sides, preserving zero', () => {
  const diff = { matchCornersProbs: { over55: 90, over65: 80, over75: 65, over85: 50, over95: 30 }, matchCardsProbs: { over25: 40, over35: 20, over45: 0 } };
  const html = renderToStaticMarkup(React.createElement(OverUnderGroupedSection, { match: { probabilities: {} }, diff, isVip: true }));
  for (const line of [5.5, 6.5, 7.5, 8.5, 9.5]) for (const sign of ['+', '-']) assert.ok(html.includes(`${sign}${line} Córners Partido`));
  for (const line of [2.5, 3.5, 4.5]) for (const sign of ['+', '-']) assert.ok(html.includes(`${sign}${line} Tarjetas`));
  assert.match(html, /\+4\.5 Tarjetas[\s\S]*?0%/);
  assert.match(html, /-4\.5 Tarjetas[\s\S]*?100%/);
});
