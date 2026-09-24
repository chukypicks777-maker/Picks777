import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  formatOdds,
  decimalToAmerican,
  decimalToFraction,
  gcd,
  oddsToProbability
} from '../src/utils/oddsFormatter.js';

test('GCD calculates the greatest common divisor correctly', () => {
  assert.equal(gcd(150, 100), 50);
  assert.equal(gcd(50, 100), 50);
  assert.equal(gcd(400, 100), 100);
  assert.equal(gcd(350, 100), 50);
  assert.equal(gcd(125, 100), 25);
  assert.equal(gcd(25, 100), 25);
  assert.equal(gcd(0, 5), 5);
  assert.equal(gcd(0, 0), 1);
});

test('Decimal to American conversion adheres to exact sports betting standards', () => {
  // Positive American odds (decimal >= 2.00)
  assert.equal(decimalToAmerican(2.00), '+100');
  assert.equal(decimalToAmerican(2.50), '+150');
  assert.equal(decimalToAmerican(3.00), '+200');
  assert.equal(decimalToAmerican(4.50), '+350');
  assert.equal(decimalToAmerican(5.00), '+400');
  assert.equal(decimalToAmerican(2.10), '+110');

  // Negative American odds (decimal < 2.00)
  assert.equal(decimalToAmerican(1.50), '-200');
  assert.equal(decimalToAmerican(1.95), '-105');
  assert.equal(decimalToAmerican(1.80), '-125');
  assert.equal(decimalToAmerican(1.33), '-303');
  assert.equal(decimalToAmerican(1.10), '-1000');
  assert.equal(decimalToAmerican(1.05), '-2000');
  assert.equal(decimalToAmerican(1.01), '-10000');

  // Edge cases and invalid values
  assert.equal(decimalToAmerican(1.00), 'N/D');
  assert.equal(decimalToAmerican(0.90), 'N/D');
  assert.equal(decimalToAmerican(0), 'N/D');
  assert.equal(decimalToAmerican(-200), 'N/D');
  assert.equal(decimalToAmerican(null), 'N/D');
  assert.equal(decimalToAmerican(undefined), 'N/D');
  assert.equal(decimalToAmerican(NaN), 'N/D');
  assert.equal(decimalToAmerican(Infinity), 'N/D');
});

test('Decimal to Fractional conversion produces simplified fractions with standard betting GCD', () => {
  // Exact terminating decimals from task requirements
  assert.equal(decimalToFraction(2.50), '3/2');
  assert.equal(decimalToFraction(1.50), '1/2');
  assert.equal(decimalToFraction(5.00), '4/1');
  assert.equal(decimalToFraction(2.00), '1/1');
  assert.equal(decimalToFraction(3.00), '2/1');
  assert.equal(decimalToFraction(4.00), '3/1');
  assert.equal(decimalToFraction(3.50), '5/2');
  assert.equal(decimalToFraction(4.50), '7/2');
  assert.equal(decimalToFraction(6.00), '5/1');

  // Common quarter and fifth fractions
  assert.equal(decimalToFraction(1.25), '1/4');
  assert.equal(decimalToFraction(1.75), '3/4');
  assert.equal(decimalToFraction(2.25), '5/4');
  assert.equal(decimalToFraction(1.20), '1/5');
  assert.equal(decimalToFraction(1.40), '2/5');
  assert.equal(decimalToFraction(1.60), '3/5');
  assert.equal(decimalToFraction(1.80), '4/5');

  // Standard recurring betting decimals with tolerance
  assert.equal(decimalToFraction(1.33), '1/3');
  assert.equal(decimalToFraction(1.67), '2/3');
  assert.equal(decimalToFraction(1.83), '5/6');
  assert.equal(decimalToFraction(1.17), '1/6');

  // Low odds
  assert.equal(decimalToFraction(1.10), '1/10');
  assert.equal(decimalToFraction(1.05), '1/20');
  assert.equal(decimalToFraction(1.01), '1/100');

  // Invalid / non-betting inputs
  assert.equal(decimalToFraction(1.00), 'N/D');
  assert.equal(decimalToFraction(0.50), 'N/D');
  assert.equal(decimalToFraction(null), 'N/D');
  assert.equal(decimalToFraction(undefined), 'N/D');
  assert.equal(decimalToFraction(NaN), 'N/D');
  assert.equal(decimalToFraction(Infinity), 'N/D');
});

test('formatOdds dynamically routes between american, decimal, and fractional formats with alias support', () => {
  // Decimal format
  assert.equal(formatOdds(2.5, 'decimal'), '2.50');
  assert.equal(formatOdds(1.95, 'decimal'), '1.95');
  assert.equal(formatOdds('2.50', 'decimal'), '2.50');
  assert.equal(formatOdds(2.5), '2.50'); // default

  // American format
  assert.equal(formatOdds(2.5, 'american'), '+150');
  assert.equal(formatOdds(1.5, 'american'), '-200');
  assert.equal(formatOdds('1.95', 'american'), '-105');
  assert.equal(formatOdds(2.5, 'AMERICAN'), '+150');
  assert.equal(formatOdds(1.5, 'Americano'), '-200');

  // Fractional format
  assert.equal(formatOdds(2.5, 'fractional'), '3/2');
  assert.equal(formatOdds(1.5, 'fractional'), '1/2');
  assert.equal(formatOdds(5.0, 'fractional'), '4/1');
  assert.equal(formatOdds(2.5, 'FRACTIONAL'), '3/2');
  assert.equal(formatOdds(1.5, 'fraccionario'), '1/2');

  // Invalid or null
  assert.equal(formatOdds(null, 'american'), 'N/D');
  assert.equal(formatOdds(null, 'fractional'), 'N/D');
  assert.equal(formatOdds(null, 'decimal'), 'N/D');
  assert.equal(formatOdds(Infinity, 'american'), 'N/D');
  assert.equal(formatOdds(-10, 'decimal'), 'N/D');
  assert.equal(formatOdds('abc', 'fractional'), 'N/D');
});

test('oddsToProbability correctly inverts decimal odds into percentage', () => {
  assert.equal(oddsToProbability(2.0), 50);
  assert.equal(oddsToProbability(2.5), 40);
  assert.equal(oddsToProbability(1.25), 80);
  assert.equal(oddsToProbability(1.0), 0);
  assert.equal(oddsToProbability(null), 0);
  assert.equal(oddsToProbability(NaN), 0);
});

test('Navbar renders odds format selector visibly with Americano, Decimal and Fraccionario options', async () => {
  const socialSource = await readFile(new URL('../src/components/SocialIcons.jsx', import.meta.url), 'utf8');
  const { code: socialCode } = await transformWithOxc(socialSource, 'SocialIcons.jsx', { jsx: { runtime: 'classic' } });
  const modSocialCode = socialCode.replaceAll('"react"', JSON.stringify(import.meta.resolve('react')));
  const socialIconsDataUri = 'data:text/javascript;base64,' + Buffer.from(modSocialCode).toString('base64');

  const mockSocialSettingsUri = 'data:text/javascript;base64,' + Buffer.from(
    'export const useSocialLinks = () => [{ id: "telegram", name: "Telegram", url: "https://t.me/test" }, { id: "whatsapp", name: "WhatsApp", url: "https://wa.me/test" }, { id: "instagram", name: "Instagram", url: "https://instagram.com/test" }]; export const getSocialLink = (links, id) => links.find(l => l.id === id) || { url: "#", label: id };'
  ).toString('base64');

  const compSource = await readFile(new URL('../src/components/Navbar.jsx', import.meta.url), 'utf8');
  const { code: compCode } = await transformWithOxc(compSource, 'Navbar.jsx', { jsx: { runtime: 'classic' } });
  const modCode = compCode
    .replaceAll('"react"', JSON.stringify(import.meta.resolve('react')))
    .replaceAll('"lucide-react"', JSON.stringify(import.meta.resolve('lucide-react')))
    .replaceAll('"./SocialIcons"', JSON.stringify(socialIconsDataUri))
    .replaceAll('"../utils/audioEffects"', JSON.stringify(import.meta.resolve('../src/utils/audioEffects.js')))
    .replaceAll('"../utils/socialSettings"', JSON.stringify(mockSocialSettingsUri));
  const { default: Navbar } = await import('data:text/javascript;base64,' + Buffer.from(modCode).toString('base64'));

  // Test rendering with 'decimal'
  const htmlDecimal = renderToStaticMarkup(React.createElement(Navbar, {
    currency: 'USD',
    oddsFormat: 'decimal',
    setCurrency: () => {},
    setOddsFormat: () => {},
    auth: { valid: true, user: { name: 'Tester' } }
  }));

  // Verify the odds select exists, is accessible, and has no hidden md:block class
  assert.match(htmlDecimal, /aria-label="Formato de Momios"/);
  assert.match(htmlDecimal, /<option[^>]*value="american"[^>]*>Americano<\/option>/);
  assert.match(htmlDecimal, /<option[^>]*value="decimal"[^>]*>Decimal<\/option>/);
  assert.match(htmlDecimal, /<option[^>]*value="fractional"[^>]*>Fraccionario<\/option>/);
  assert.doesNotMatch(htmlDecimal, /hidden md:block[^>]*>[\s\S]*?Americano/);

  // Currency select is also present
  assert.match(htmlDecimal, /USD<\/option>/);
  assert.match(htmlDecimal, /MXN<\/option>/);

  // Test rendering with 'american'
  const htmlAmerican = renderToStaticMarkup(React.createElement(Navbar, {
    currency: 'MXN',
    oddsFormat: 'american',
    setCurrency: () => {},
    setOddsFormat: () => {},
    auth: { valid: true, user: { name: 'Tester' } }
  }));
  assert.match(htmlAmerican, /aria-label="Formato de Momios"/);
});
