import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const source = await readFile(new URL('../src/components/NumberCounter.jsx', import.meta.url), 'utf8');
const { code } = await transformWithOxc(source, 'NumberCounter.jsx', { jsx: { runtime: 'classic' } });
const moduleCode = code.replace('"react"', JSON.stringify(import.meta.resolve('react')));
const { default: NumberCounter } = await import('data:text/javascript;base64,' + Buffer.from(moduleCode).toString('base64'));
test('probability display never turns unavailable data into 0% or animates false intermediate values', () => {
  for (const value of [null, undefined, NaN, Infinity, '']) {
    const html = renderToStaticMarkup(React.createElement(NumberCounter, { value, suffix: '%' }));
    assert.match(html, /N\/D/); assert.doesNotMatch(html, /0%/);
  }
  assert.match(renderToStaticMarkup(React.createElement(NumberCounter, { value: 81, suffix: '%' })), /81%/);
  assert.match(renderToStaticMarkup(React.createElement(NumberCounter, { value: 0, suffix: '%' })), /0%/);
  assert.match(renderToStaticMarkup(React.createElement(NumberCounter, { value: 1.200332222, decimals: 12 })), /1\.20</);
});
