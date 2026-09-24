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
const { default: NumberCounter } = await import(numberCounterDataUri);

async function loadComponent(relativePath, filename, extraReplaces = {}) {
  const compSource = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const { code: compCode } = await transformWithOxc(compSource, filename, { jsx: { runtime: 'classic' } });
  let modCode = compCode
    .replaceAll('"react"', JSON.stringify(import.meta.resolve('react')))
    .replaceAll('"lucide-react"', JSON.stringify(import.meta.resolve('lucide-react')))
    .replaceAll('"./NumberCounter"', JSON.stringify(numberCounterDataUri))
    .replaceAll('"../utils/audioEffects"', JSON.stringify(import.meta.resolve('../src/utils/audioEffects.js')))
    .replaceAll('"../utils/probability"', JSON.stringify(import.meta.resolve('../src/utils/probability.js')));
  for (const [key, val] of Object.entries(extraReplaces)) {
    modCode = modCode.replaceAll(key, val);
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(modCode).toString('base64'))).default;
}

const HalfGoalsSection = await loadComponent('../src/components/HalfGoalsSection.jsx', 'HalfGoalsSection.jsx');
const OverUnderGroupedSection = await loadComponent('../src/components/OverUnderGroupedSection.jsx', 'OverUnderGroupedSection.jsx');

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
