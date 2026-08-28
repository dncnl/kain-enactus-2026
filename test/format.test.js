import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPeso, formatQuantity, barWidth, formatPortions } from '../js/format.js';

/**
 * Presentation formatting lives here, not in app.js, so the strings a user
 * actually reads are covered by the suite. Expected values are written by hand
 * from how a Filipino wet-market shopper would read them.
 */

test('whole pesos render without needless centavos', () => {
  assert.equal(formatPeso(280), '₱280');
  assert.equal(formatPeso(0), '₱0');
});

test('centavos are shown to exactly two places when present', () => {
  assert.equal(formatPeso(280.5), '₱280.50');
  assert.equal(formatPeso(12.25), '₱12.25');
});

test('thousands are separated so a weekly budget stays readable', () => {
  assert.equal(formatPeso(1200), '₱1,200');
  assert.equal(formatPeso(10500.75), '₱10,500.75');
});

test('quantities drop trailing zeros and keep their unit', () => {
  assert.equal(formatQuantity(60, 'g'), '60 g');
  assert.equal(formatQuantity(0.5, 'ml'), '0.5 ml');
  assert.equal(formatQuantity(1.0, 'pc'), '1 pc');
});

test('a bar can never overflow its track even when coverage exceeds the target', () => {
  // protein at budget 300 / family 4 is 103.5% -- the label says 103.5%,
  // but the bar must stop at the end of its track.
  assert.equal(barWidth(103.5), 100);
  assert.equal(barWidth(55), 55);
  assert.equal(barWidth(0), 0);
});

test('a bar never goes negative on malformed input', () => {
  assert.equal(barWidth(-10), 0);
  assert.equal(barWidth(NaN), 0);
});

test('portions are described in batches and the servings they yield', () => {
  assert.equal(formatPortions(3, 12), '3 batches · 12 servings');
  assert.equal(formatPortions(1, 4), '1 batch · 4 servings');
});
