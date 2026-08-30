import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../js/solver.js';
import { buildShoppingList, itemKey, sumChecked, knownKeys } from '../js/shopping-list.js';
import { THREE_RECIPES, DECIMAL_RECIPES } from './fixtures.js';

test('the list total matches the plan total when costs carry centavos', () => {
  // The results screen prints both figures. solve() rounds
  // costPerServing * familySize * portions; buildShoppingList() rounds each
  // merged line and sums those. With whole-peso fixtures the two agree by luck;
  // with derived decimal prices they drift by a centavo and the screen
  // contradicts itself. They must agree by construction.
  for (const [budget, familySize] of [[150, 3], [300, 4], [500, 5], [93, 2]]) {
    const plan = solve({ budget, familySize, recipes: DECIMAL_RECIPES });
    const list = buildShoppingList(plan);
    assert.equal(
      list.totalCost,
      plan.totalCost,
      `budget ${budget} / family ${familySize}: list ${list.totalCost} != plan ${plan.totalCost}`
    );
  }
});

test('merges an ingredient shared across recipes into one line', () => {
  // Hand-worked: at budget 300 / family 4 the optimal plan is
  // monggo x3 (240) + lugaw x1 (40) = 280.
  // Garlic: 15g x3 from monggo + 15g x1 from lugaw = 60g, 30 + 10 = 40 pesos.
  const plan = solve({ budget: 300, familySize: 4, recipes: THREE_RECIPES });
  const list = buildShoppingList(plan);

  const garlic = list.items.find((item) => item.name === 'Garlic');
  assert.ok(garlic, 'expected Garlic on the list');
  assert.equal(garlic.quantity, 60);
  assert.equal(garlic.unit, 'g');
  assert.equal(garlic.cost, 40);
});

test('shopping list total equals the plan cost', () => {
  const plan = solve({ budget: 300, familySize: 4, recipes: THREE_RECIPES });
  const list = buildShoppingList(plan);
  assert.equal(list.totalCost, 280);
  assert.equal(list.totalCost, plan.totalCost);
});

/* ── market mode arithmetic (ROADMAP B1) ──────────────────────────────── */

test('a row key is name AND unit, matching how lines are merged', () => {
  // The same key the list merges on. If these two ever diverge, a tick lands
  // on a row that does not exist and the running spend silently under-reports.
  assert.equal(itemKey({ name: 'Rice', unit: 'g' }), 'Rice__g');
  assert.notEqual(itemKey({ name: 'Rice', unit: 'g' }), itemKey({ name: 'Rice', unit: 'kg' }));

  const plan = solve({ budget: 300, familySize: 4, recipes: THREE_RECIPES });
  const list = buildShoppingList(plan);
  const garlic = list.items.find((item) => item.name === 'Garlic');
  assert.equal(itemKey(garlic), 'Garlic__g');
});

test('ticking every row sums to exactly the list total', () => {
  // The invariant market mode has to hold: finishing the shopping must land on
  // the same figure printed as Kabuuan, never a centavo off it.
  for (const [budget, familySize] of [[150, 3], [300, 4], [500, 5], [93, 2]]) {
    const plan = solve({ budget, familySize, recipes: DECIMAL_RECIPES });
    const list = buildShoppingList(plan);
    const everything = list.items.map(itemKey);
    assert.equal(
      sumChecked(list.items, everything),
      list.totalCost,
      `budget ${budget} / family ${familySize}: ticked sum != list total`
    );
  }
});

test('an empty basket costs nothing', () => {
  const plan = solve({ budget: 300, familySize: 4, recipes: THREE_RECIPES });
  const list = buildShoppingList(plan);
  assert.equal(sumChecked(list.items, []), 0);
  assert.equal(sumChecked(list.items, new Set()), 0);
});

test('a partial basket sums only the rows actually ticked', () => {
  const plan = solve({ budget: 300, familySize: 4, recipes: THREE_RECIPES });
  const list = buildShoppingList(plan);
  const garlic = list.items.find((item) => item.name === 'Garlic');
  const rice = list.items.find((item) => item.name === 'Rice');

  assert.equal(
    sumChecked(list.items, [itemKey(garlic), itemKey(rice)]),
    Math.round((garlic.cost + rice.cost) * 100) / 100
  );
});

test('a key from a plan that no longer exists is ignored, not guessed at', () => {
  // Ticks are persisted; plans are re-solved. A stored key for a dish this
  // budget no longer buys must not inflate the running spend.
  const plan = solve({ budget: 300, familySize: 4, recipes: THREE_RECIPES });
  const list = buildShoppingList(plan);
  assert.equal(sumChecked(list.items, ['Unobtainium__g']), 0);
  assert.deepEqual(knownKeys(list.items, ['Unobtainium__g']), []);
});

test('restoring ticks keeps the keys still on the list and drops the rest', () => {
  const plan = solve({ budget: 300, familySize: 4, recipes: THREE_RECIPES });
  const list = buildShoppingList(plan);
  const restored = knownKeys(list.items, ['Garlic__g', 'Garlic__kg', 'Unobtainium__g']);
  assert.deepEqual(restored, ['Garlic__g']);
});

test('market arithmetic survives a missing list without throwing', () => {
  assert.equal(sumChecked(undefined, ['Garlic__g']), 0);
  assert.equal(sumChecked([], undefined), 0);
  assert.deepEqual(knownKeys(undefined, undefined), []);
});
