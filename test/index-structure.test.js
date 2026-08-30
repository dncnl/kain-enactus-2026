import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/**
 * MARKUP INVARIANTS. Static assertions over index.html — no jsdom, because the
 * repo is deliberately dependency-free.
 *
 * Each test here locks in a bug that actually shipped once. They are cheap and
 * blunt, but they fail in CI instead of on a phone during the pitch.
 */

test('the coverage canvas sits in a container with a determinate height', () => {
  // REGRESSION: with `maintainAspectRatio: false`, Chart.js sizes the canvas to
  // its parent. When that parent was height:auto the canvas grew, the parent
  // grew to fit it, the resize observer refired, and the chart expanded until
  // the page locked up. A responsive canvas needs a fixed-height container.
  const wrapper = html.match(/<div([^>]*)>\s*<canvas id="coverage-chart"/);
  assert.ok(wrapper, 'the #coverage-chart canvas must be wrapped in its own <div>');

  const attrs = wrapper[1];
  assert.match(attrs, /\brelative\b/, 'chart container must be positioned (relative)');
  assert.match(attrs, /\bh-\d/, 'chart container must declare an explicit height (e.g. h-56)');
});

test('the canvas does not carry a height attribute that responsive mode ignores', () => {
  const canvas = html.match(/<canvas id="coverage-chart"[^>]*>/)[0];
  assert.doesNotMatch(canvas, /\sheight=/, 'height= is ignored in responsive mode and misleads');
});

test('the budget input declares an upper bound', () => {
  // REGRESSION: unbounded budget -> Int32Array/Uint8Array allocations scaling
  // with the number entered -> tab crash. See app-state.test.js for the guard
  // that actually enforces it; this only checks the input agrees.
  const input = html.match(/<input id="budget"[\s\S]*?\/>/)[0];
  assert.match(input, /\bmax="(\d+)"/, 'budget input needs a max attribute');
  assert.match(input, /\bmin="1"/, 'budget input should keep its min');
});

test('the family size input declares an upper bound', () => {
  // REGRESSION: no max clamp meant a slipped extra digit (450 instead of 4)
  // silently multiplied every recipe's cost 100x. See app-state.test.js's
  // MAX_FAMILY_SIZE guard for the actual enforcement; this checks the markup
  // agrees.
  const input = html.match(/<input id="familySize"[\s\S]*?\/>/)[0];
  assert.match(input, /\bmax="(\d+)"/, 'familySize input needs a max attribute');
  assert.match(input, /\bmin="1"/, 'familySize input should keep its min');
});

test('validation errors and app-level failures have separate elements', () => {
  // REGRESSION: render() rewrites #form-error from state.error on every
  // notification, which wiped the "recipe data failed to load" message as soon
  // as the user touched anything. Two owners need two elements.
  assert.match(html, /id="form-error"/, 'validation errors need #form-error');
  assert.match(html, /id="app-error"/, 'app-level failures need their own #app-error');
});

test('the submit button starts disabled until recipe data has loaded', () => {
  // REGRESSION: submitting before data/recipes.json resolved solved against an
  // empty array, landing on the empty screen advising "Try at least ₱0".
  const submit = html.match(/<button type="submit"[\s\S]*?>/)[0];
  assert.match(submit, /\bdisabled\b/, 'submit must ship disabled and be enabled on load');
});

test('main is not a blanket aria-live region', () => {
  // REGRESSION: aria-live="polite" on <main> re-announced the entire results
  // screen (plan, chart data, shopping list) on every single state change.
  // app.js now moves focus to the transitioned-to screen instead — see
  // moveFocus() — so the live region has to go, not just move.
  const main = html.match(/<main[^>]*>/)[0];
  assert.doesNotMatch(main, /aria-live/, '<main> must not carry aria-live');
});

test('every screen is a programmatic focus target for screen transitions', () => {
  // app.js focuses screens.get(state.screen) on transition; each <section
  // data-screen="..."> must be focusable via tabindex="-1" (not tab-reachable,
  // focusable only from JS) for that to do anything.
  const sections = [...html.matchAll(/<section data-screen="[^"]+"([^>]*)>/g)];
  assert.equal(sections.length, 4, 'expected 4 screens (input, calculating, results, empty)');
  for (const [, attrs] of sections) {
    assert.match(attrs, /tabindex="-1"/, 'every screen section needs tabindex="-1"');
  }
});

test('form-error and app-error are focusable so moveFocus() can land on them', () => {
  const formError = html.match(/<p id="form-error"[^>]*>/)[0];
  const appError = html.match(/<p id="app-error"[^>]*>/)[0];
  assert.match(formError, /tabindex="-1"/);
  assert.match(appError, /tabindex="-1"/);
});

test('Tagalog UI copy is marked lang="tl" since the page is lang="en"', () => {
  for (const phrase of ['Magkano ang budget?', 'Gawin ang plano', 'Mga putahe', 'Kabuuan', 'Kulang pa ang budget']) {
    const idx = html.indexOf(phrase);
    assert.ok(idx !== -1, `expected to find "${phrase}" in index.html`);
    const tagStart = html.lastIndexOf('<', idx);
    const tag = html.slice(tagStart, idx);
    assert.match(tag, /lang="tl"/, `"${phrase}" should be inside an element with lang="tl"`);
  }
});

test('the results screen has a hidden capped-plan note wired to data-bind="cappedNote"', () => {
  // See app-state.js `capped` and app.js renderResults() — surfaces the
  // "maxPortions caps the plan" case from the DEVNOTES UX-polish backlog.
  const note = html.match(/<p data-bind="cappedNote"[^>]*>/)[0];
  assert.match(note, /\bhidden\b/, 'cappedNote must start hidden; app.js reveals it');
});
