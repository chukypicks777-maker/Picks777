import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_PARLAY, normalizeParlayLeg, parlayTicketReducer } from '../src/utils/parlayTicket.js';
import { calculateParlay } from '../src/utils/parlayCalculation.js';
import { calculateParlay as serverCalculateParlay } from '../server/services/parlayEngine.js';
import { getEffectiveOdds } from '../src/utils/mathProbabilities.js';
import { formatOdds } from '../src/utils/oddsFormatter.js';

const pick = (id, odds = 2, selection = 'Gana local') => ({ matchId: id, odds, selection, probability: 60 });
const add = (state, ...legs) => parlayTicketReducer(state, { type: 'add', legs });

test('adding different matches multiplies raw decimal odds without changing either pick', () => {
  const first = pick('a', 2.05), second = pick('b', 1.87);
  const state = add(EMPTY_PARLAY, first, second);
  const result = calculateParlay(state.legs, 100);
  assert.equal(result.totalDecimalOdds, 2.05 * 1.87);
  assert.equal(result.potentialPayout, 383.35);
  assert.equal(result.netProfit, 283.35);
  assert.equal(first.odds, 2.05);
  assert.equal(second.odds, 1.87);
  assert.deepEqual(serverCalculateParlay(state.legs, 100), result);
  for (const format of ['decimal', 'american', 'fractional']) {
    assert.equal(formatOdds(result.totalDecimalOdds, format), formatOdds(2.05 * 1.87, format));
  }
});

test('numeric and string match IDs replace or toggle one selection rather than multiply duplicates', () => {
  let state = add(EMPTY_PARLAY, pick(123, 1.5));
  state = add(state, pick('123', 2.5, 'Más de 2.5 Goles'));
  assert.equal(state.legs.length, 1);
  assert.equal(calculateParlay(state.legs).totalDecimalOdds, 2.5);
  state = parlayTicketReducer(state, { type: 'toggle', leg: pick(123, 2.5, 'Más de 2.5 Goles') });
  assert.deepEqual(state.legs, []);
  assert.throws(() => calculateParlay([pick(123), pick('123')]), /mismo partido/);
});

test('a refreshed odd updates the existing selection without adding a leg', () => {
  const initial = add(EMPTY_PARLAY, pick('a', 1.5));
  const updated = add(initial, pick('a', 1.95));
  assert.equal(updated.legs.length, 1);
  assert.equal(updated.legs[0].odds, 1.95);
  assert.equal(initial.legs[0].odds, 1.5);
});

test('replacing a selection still works when the ticket reaches its 20-match limit', () => {
  const full = add(EMPTY_PARLAY, ...Array.from({ length: 20 }, (_, index) => pick(index + 1)));
  const updated = add(full, pick(1, 1.5, 'Ambos anotan'), pick('extra'));
  assert.equal(updated.legs.length, 20);
  assert.equal(updated.legs[0].selection, 'Ambos anotan');
  assert.equal(updated.legs[0].odds, 1.5);
  assert.ok(!updated.legs.some(leg => leg.matchId === 'extra'));
});

test('decimal commas keep their exact value across parsing, normalization and effective odds', () => {
  const state = add(EMPTY_PARLAY, pick('a', '2,05'), pick('b', '1,87'));
  assert.deepEqual(state.legs.map(leg => leg.odds), [2.05, 1.87]);
  assert.equal(getEffectiveOdds({ odds: '2,50' }), 2.5);
  assert.equal(getEffectiveOdds({ odds: '1,95' }), 1.95);
  assert.equal(calculateParlay(state.legs, 100).potentialPayout, 383.35);
  for (const bad of ['2.5oops', NaN, Infinity, -150, 1, 1001]) assert.equal(normalizeParlayLeg(pick('bad', bad)), null);
});

test('successive batched actions use the latest ticket and removing or clearing resets its product', () => {
  let state = add(EMPTY_PARLAY, pick('a', 2));
  state = add(state, pick('b', 3));
  state = add(state, pick('a', 1.5, 'Ambos anotan'));
  assert.equal(calculateParlay(state.legs).totalDecimalOdds, 4.5);
  state = parlayTicketReducer(state, { type: 'remove', leg: pick('b') });
  assert.equal(calculateParlay(state.legs).totalDecimalOdds, 1.5);
  state = parlayTicketReducer(state, { type: 'clear' });
  assert.equal(calculateParlay(state.legs).potentialPayout, 0);
  state = add(state, pick('fresh', 1.87));
  assert.equal(calculateParlay(state.legs).totalDecimalOdds, 1.87);
});

test('loading daily picks replaces the complete previous ticket and rejects malformed responses', () => {
  const initial = add(EMPTY_PARLAY, pick('old', 5));
  const daily = parlayTicketReducer(initial, { type: 'replace', legs: [pick('new', 1.5), pick('other', 2)] });
  assert.deepEqual(daily.legs.map(leg => leg.matchId), ['new', 'other']);
  assert.equal(calculateParlay(daily.legs).totalDecimalOdds, 3);
  for (const legs of [null, [], [pick('bad', NaN)], [pick(1), pick('1')]]) {
    const rejected = parlayTicketReducer(initial, { type: 'replace', legs });
    assert.deepEqual(rejected.legs, initial.legs);
    assert.match(rejected.notice, /No se pudo cargar/);
  }
});

test('invalid legs and invalid amounts never yield a fake neutral multiplier or payout', () => {
  for (const legs of [[null], [{ matchId: {}, odds: 2 }], [pick('a', NaN)], [pick('a', 0)], [{ ...pick('a'), probability: 101 }]]) {
    assert.throws(() => calculateParlay(legs, 50));
  }
  for (const stake of [NaN, Infinity, -1, 1000001]) assert.throws(() => calculateParlay([pick('a')], stake));
  assert.equal(calculateParlay([pick('a')], 0).potentialPayout, 0);
});
