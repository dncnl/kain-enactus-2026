import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { t, normalizeLocale, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../js/i18n.js';

/**
 * The Fil/En toggle's dictionary. The main risk with a translation table is
 * silent drift: a key added for one locale and forgotten in the other, which
 * ships as an English sentence appearing mid-Tagalog paragraph (or vice
 * versa) — exactly the kind of thing that is invisible in a code review but
 * obvious to the first Filipino user who reads it.
 */

test('the default locale is Filipino — the primary users this app is for', () => {
  assert.equal(DEFAULT_LOCALE, 'fil');
  assert.deepEqual(SUPPORTED_LOCALES, ['fil', 'en']);
});

test('every key defined for one locale is defined for the other', () => {
  // Reach into the module's private dictionary via t() itself: any key present
  // in one locale but not the other returns the raw key name in the locale
  // missing it (see t()'s fallback), which is not a valid translation for any
  // key that isn't already all-uppercase-with-no-spaces by design.
  const source = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
  const filBlockMatch = source.match(/ fil:\s*\{([\s\S]*?)\n {2}\},\n\n {2}en:/);
  const enBlockMatch = source.match(/\n {2}en:\s*\{([\s\S]*?)\n {2}\}\n\};/);
  assert.ok(filBlockMatch, 'expected a `fil: { ... }` block in js/i18n.js');
  assert.ok(enBlockMatch, 'expected an `en: { ... }` block in js/i18n.js');

  const keysOf = (block) => [...block.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  const filList = keysOf(filBlockMatch[1]);
  const enList = keysOf(enBlockMatch[1]);

  const missingFromEn = filList.filter((k) => !enList.includes(k));
  const missingFromFil = enList.filter((k) => !filList.includes(k));
  assert.deepEqual(missingFromEn, [], 'keys present in fil but missing from en');
  assert.deepEqual(missingFromFil, [], 'keys present in en but missing from fil');
});

test('an unknown key returns the key itself rather than a blank string', () => {
  assert.equal(t('thisKeyDoesNotExist', 'en'), 'thisKeyDoesNotExist');
});

test('an unsupported locale falls back to the default rather than throwing', () => {
  assert.equal(normalizeLocale('tagalog'), DEFAULT_LOCALE);
  assert.equal(normalizeLocale(undefined), DEFAULT_LOCALE);
  assert.doesNotThrow(() => t('submitButton', 'klingon'));
});

test('placeholders are substituted, and an unmatched one is left as literal text', () => {
  assert.equal(t('perDayHintOne', 'en', { amount: '₱300' }), '₱300 for one day.');
  assert.equal(t('perDayHintMulti', 'en', { amount: '₱100', days: 3 }), '₱100 a day for 3 days.');
  // No vars supplied at all: the template comes back with its placeholder
  // intact rather than throwing on a missing substitution.
  assert.match(t('perDayHintOne', 'en'), /\{amount\}/);
});

test('static UI copy round-trips through both locales', () => {
  assert.equal(t('submitButton', 'fil'), 'Gawin ang plano');
  assert.equal(t('submitButton', 'en'), 'Make my plan');
  assert.equal(t('totalLabel', 'fil'), 'Kabuuan');
  assert.equal(t('totalLabel', 'en'), 'Total');
});
