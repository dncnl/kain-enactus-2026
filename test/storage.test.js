import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../js/storage.js';

/**
 * Persistence must degrade to "the app forgets things", never to a broken app.
 * These tests drive the three cases a real phone actually produces: storage
 * that works, storage that is absent, and storage that throws — the last one
 * being what a browser with site data blocked, or a full quota, does.
 *
 * createStorage() takes its backend as an argument precisely so this can run
 * in plain node with no browser and no jsdom.
 */

/** Minimal in-memory Storage stand-in. */
function fakeBackend(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _map: map
  };
}

/** Every access throws, like Chrome with site data blocked. */
const hostileBackend = {
  getItem() {
    throw new Error('site data blocked');
  },
  setItem() {
    throw new Error('quota exceeded');
  },
  removeItem() {
    throw new Error('site data blocked');
  }
};

test('inputs survive a round trip', () => {
  const store = createStorage(fakeBackend());
  assert.equal(store.writeInputs({ budget: 300, familySize: 4, days: 3 }), true);
  assert.deepEqual(store.readInputs(), { budget: 300, familySize: 4, days: 3 });
});

test('a missing day count defaults to one rather than discarding the entry', () => {
  // Entries written by a build that predates the day dimension have no `days`.
  // Throwing them away would make the app forget a perfectly good budget and
  // family size the first time a user upgrades.
  const store = createStorage(fakeBackend({
    'kain:inputs:v1': JSON.stringify({ budget: 300, familySize: 4 })
  }));
  assert.deepEqual(store.readInputs(), { budget: 300, familySize: 4, days: 1 });
});

test('writing without a day count records one day', () => {
  const store = createStorage(fakeBackend());
  store.writeInputs({ budget: 300, familySize: 4 });
  assert.equal(store.readInputs().days, 1);
});

test('a nonsense day count falls back to one instead of reaching the solver', () => {
  for (const days of [0, -3, 'three', null]) {
    const store = createStorage(fakeBackend({
      'kain:inputs:v1': JSON.stringify({ budget: 300, familySize: 4, days })
    }));
    assert.equal(store.readInputs().days, 1, `expected ${days} to fall back to 1`);
  }
});

test('nothing stored yet reads as null, not as a zero budget', () => {
  // A zero would reach solve() and produce a bogus "nothing fits" screen; the
  // caller has to be able to tell "no saved value" from "saved value of 0".
  assert.equal(createStorage(fakeBackend()).readInputs(), null);
});

test('a corrupted entry is ignored rather than parsed into the solver', () => {
  const store = createStorage(fakeBackend({ 'kain:inputs:v1': 'not json at all' }));
  assert.equal(store.readInputs(), null);
});

test('implausible stored values are rejected on the way out', () => {
  // Anything can write to localStorage. Validating only on write would trust
  // whatever is already there from an older build or another tab.
  for (const stored of [
    { budget: 0, familySize: 4 },
    { budget: -50, familySize: 4 },
    { budget: 300, familySize: 0 },
    { budget: 'three hundred', familySize: 4 },
    { familySize: 4 },
    null
  ]) {
    const store = createStorage(fakeBackend({ 'kain:inputs:v1': JSON.stringify(stored) }));
    assert.equal(store.readInputs(), null, `expected ${JSON.stringify(stored)} to be rejected`);
  }
});

test('a non-finite input is never written', () => {
  const backend = fakeBackend();
  const store = createStorage(backend);
  assert.equal(store.writeInputs({ budget: NaN, familySize: 4 }), false);
  assert.equal(backend._map.size, 0);
});

test('ticked keys survive a round trip and non-strings are dropped', () => {
  const store = createStorage(fakeBackend());
  store.writeCheckedKeys(['Monggo__g', 'Bawang__g', 42, null, { name: 'x' }]);
  assert.deepEqual(store.readCheckedKeys(), ['Monggo__g', 'Bawang__g']);
});

test('ticked keys read as an empty array when absent or corrupted', () => {
  assert.deepEqual(createStorage(fakeBackend()).readCheckedKeys(), []);
  assert.deepEqual(
    createStorage(fakeBackend({ 'kain:checked:v1': '{"not":"an array"}' })).readCheckedKeys(),
    []
  );
});

test('clearing ticked keys leaves the saved inputs alone', () => {
  // "Bagong budget" discards the basket, not the family size the user just
  // typed — they are about to plan for the same household again.
  const store = createStorage(fakeBackend());
  store.writeInputs({ budget: 300, familySize: 4, days: 3 });
  store.writeCheckedKeys(['Monggo__g']);

  store.clearCheckedKeys();

  assert.deepEqual(store.readCheckedKeys(), []);
  assert.deepEqual(store.readInputs(), { budget: 300, familySize: 4, days: 3 });
});

test('a storage backend that throws on every call never throws at the caller', () => {
  // The whole point of the wrapper. If any of these propagate, boot dies before
  // the form is wired and the app is a blank screen on that device.
  const store = createStorage(hostileBackend);
  assert.doesNotThrow(() => {
    assert.equal(store.readInputs(), null);
    assert.equal(store.writeInputs({ budget: 300, familySize: 4 }), false);
    assert.deepEqual(store.readCheckedKeys(), []);
    assert.equal(store.writeCheckedKeys(['Monggo__g']), false);
    assert.equal(store.clearCheckedKeys(), false);
  });
});

test('no storage at all behaves exactly like empty storage', () => {
  // What node itself looks like, and what a browser with storage disabled
  // looks like once the guarded property access returns null.
  const store = createStorage(null);
  assert.equal(store.readInputs(), null);
  assert.deepEqual(store.readCheckedKeys(), []);
  assert.doesNotThrow(() => store.writeInputs({ budget: 300, familySize: 4 }));
});

/* ── locale (the Fil/En toggle) ───────────────────────────────────────── */

test('locale defaults to fil when nothing is stored', () => {
  assert.equal(createStorage(fakeBackend()).readLocale(), 'fil');
  assert.equal(createStorage(null).readLocale(), 'fil');
});

test('a chosen locale survives a round trip', () => {
  const store = createStorage(fakeBackend());
  assert.equal(store.writeLocale('en'), true);
  assert.equal(store.readLocale(), 'en');
});

test('an unsupported or corrupted locale falls back to fil rather than reaching the UI', () => {
  for (const bad of ['tl', 'EN', 'english', '', null]) {
    const store = createStorage(fakeBackend({ 'kain:locale:v1': bad }));
    assert.equal(store.readLocale(), 'fil');
  }
  assert.equal(createStorage(fakeBackend()).writeLocale('tagalog'), false);
});

test('locale storage never throws even when the backend is hostile', () => {
  const store = createStorage(hostileBackend);
  assert.doesNotThrow(() => {
    assert.equal(store.readLocale(), 'fil');
    assert.equal(store.writeLocale('en'), false);
  });
});
