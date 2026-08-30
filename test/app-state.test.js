import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppState, MAX_BUDGET, MAX_FAMILY_SIZE } from '../js/app-state.js';
import { itemKey } from '../js/shopping-list.js';
import { THREE_RECIPES } from './fixtures.js';

test('starts on the input screen', () => {
  assert.equal(createAppState().screen, 'input');
});

test('submitting a valid budget moves to the calculating screen', () => {
  const state = createAppState();
  state.submit({ budget: 300, familySize: 4 });
  assert.equal(state.screen, 'calculating');
  assert.equal(state.error, null);
});

test('a plan with meals lands on results', () => {
  const state = createAppState();
  state.submit({ budget: 300, familySize: 4 });
  state.finish(THREE_RECIPES);
  assert.equal(state.screen, 'results');
  assert.ok(state.plan.meals.length > 0);
});

test('a budget too small for any meal lands on the empty screen, not results', () => {
  // Cheapest fixture recipe is 10/serving -> 40 for a family of 4.
  const state = createAppState();
  state.submit({ budget: 25, familySize: 4 });
  state.finish(THREE_RECIPES);
  assert.equal(state.screen, 'empty');
});

test('the empty screen reports the cheapest reachable budget so the user can act', () => {
  const state = createAppState();
  state.submit({ budget: 25, familySize: 4 });
  state.finish(THREE_RECIPES);
  assert.equal(state.minimumBudget, 40); // lugaw at 10/serving x 4 people
});

test('rejects a non-positive budget without leaving the input screen', () => {
  const state = createAppState();
  state.submit({ budget: 0, familySize: 4 });
  assert.equal(state.screen, 'input');
  assert.match(state.error, /budget/i);
});

test('rejects a budget above the supported maximum', () => {
  // solver.js allocates one Uint8Array(budget+1) per DP item -- roughly 36
  // bytes per peso for the 18-recipe dataset. Without a ceiling, a 9-digit
  // entry asks the browser for tens of gigabytes and kills the tab.
  const state = createAppState();
  state.submit({ budget: MAX_BUDGET + 1, familySize: 4 });
  assert.equal(state.screen, 'input');
  assert.match(state.error, /budget/i);
});

test('accepts a budget exactly at the maximum', () => {
  const state = createAppState();
  state.submit({ budget: MAX_BUDGET, familySize: 4 });
  assert.equal(state.screen, 'calculating');
  assert.equal(state.error, null);
});

test('rejects a family size below one', () => {
  const state = createAppState();
  state.submit({ budget: 300, familySize: 0 });
  assert.equal(state.screen, 'input');
  assert.match(state.error, /family/i);
});

test('rejects a family size above the supported maximum', () => {
  // REGRESSION: the stepper has no upper clamp and typing directly into the
  // field bypasses it entirely, so a slipped extra digit (e.g. 450 instead of
  // 4) would otherwise silently multiply every recipe's cost 100x.
  const state = createAppState();
  state.submit({ budget: 300, familySize: MAX_FAMILY_SIZE + 1 });
  assert.equal(state.screen, 'input');
  assert.match(state.error, /family/i);
});

test('accepts a family size exactly at the maximum', () => {
  const state = createAppState();
  state.submit({ budget: 300, familySize: MAX_FAMILY_SIZE });
  assert.equal(state.screen, 'calculating');
  assert.equal(state.error, null);
});

test('reset returns to input and clears the previous plan', () => {
  const state = createAppState();
  state.submit({ budget: 300, familySize: 4 });
  state.finish(THREE_RECIPES);
  state.reset();
  assert.equal(state.screen, 'input');
  assert.equal(state.plan, null);
});

test('capped is false when the plan still has room to spend more, or spends it all', () => {
  const state = createAppState();
  state.submit({ budget: 300, familySize: 4 });
  state.finish(THREE_RECIPES);
  assert.equal(state.capped, false);
});

test('capped is true when every meal is already at its maxPortions and budget is left over', () => {
  // A is cheap and high-value, capped at 2 portions; B is far too expensive for
  // the leftover once A maxes out, so the solver has nothing else to spend on.
  const recipes = [
    {
      id: 'a', name: 'A', servings: 1, costPerServing: 10, maxPortions: 2,
      nutritionPerServing: { calories: 500, protein: 20, iron: 5, vitaminA: 100 },
      ingredients: [{ name: 'X', quantity: 1, unit: 'g', cost: 10 }]
    },
    {
      id: 'b', name: 'B', servings: 1, costPerServing: 100, maxPortions: 1,
      nutritionPerServing: { calories: 50, protein: 1, iron: 0.1, vitaminA: 1 },
      ingredients: [{ name: 'Y', quantity: 1, unit: 'g', cost: 100 }]
    }
  ];
  const state = createAppState();
  state.submit({ budget: 25, familySize: 1 });
  state.finish(recipes);
  assert.equal(state.plan.meals.length, 1);
  assert.equal(state.plan.meals[0].portions, 2);
  assert.ok(state.plan.totalCost < state.plan.budget);
  assert.equal(state.capped, true);
});

test('capped resets to false after a new plan is calculated', () => {
  const recipes = [
    {
      id: 'a', name: 'A', servings: 1, costPerServing: 10, maxPortions: 2,
      nutritionPerServing: { calories: 500, protein: 20, iron: 5, vitaminA: 100 },
      ingredients: [{ name: 'X', quantity: 1, unit: 'g', cost: 10 }]
    }
  ];
  const state = createAppState();
  state.submit({ budget: 25, familySize: 1 });
  state.finish(recipes);
  assert.equal(state.capped, true);
  state.reset();
  assert.equal(state.capped, false);
  state.submit({ budget: 300, familySize: 4 });
  state.finish(THREE_RECIPES);
  assert.equal(state.capped, false);
});

test('notifies subscribers on every transition so the DOM can re-render', () => {
  const seen = [];
  const state = createAppState();
  state.subscribe((s) => seen.push(s.screen));
  state.submit({ budget: 300, familySize: 4 });
  state.finish(THREE_RECIPES);
  assert.deepEqual(seen, ['calculating', 'results']);
});

/* ── market mode (ROADMAP B1) ─────────────────────────────────────────── */

/** A solved results state at the fixture's known 300 / 4 plan. */
function resultsState(restored = []) {
  const state = createAppState();
  state.submit({ budget: 300, familySize: 4 });
  state.finish(THREE_RECIPES, restored);
  return state;
}

test('a fresh plan starts with an empty basket', () => {
  const state = resultsState();
  assert.equal(state.checkedKeys.size, 0);
  assert.equal(state.spent, 0);
});

test('ticking a row adds exactly that row cost to the running spend', () => {
  const state = resultsState();
  const garlic = state.shoppingList.items.find((item) => item.name === 'Garlic');
  state.toggleChecked(itemKey(garlic));
  assert.equal(state.spent, garlic.cost);
  assert.ok(state.checkedKeys.has('Garlic__g'));
});

test('un-ticking a row takes it back out again', () => {
  const state = resultsState();
  const key = itemKey(state.shoppingList.items[0]);
  state.toggleChecked(key);
  state.toggleChecked(key);
  assert.equal(state.spent, 0);
  assert.equal(state.checkedKeys.size, 0);
});

test('ticking every row reaches the shopping-list total exactly', () => {
  // The figure printed as Kabuuan. Market mode finishing on a different number
  // would contradict the screen it sits on.
  const state = resultsState();
  for (const item of state.shoppingList.items) state.toggleChecked(itemKey(item));
  assert.equal(state.spent, state.shoppingList.totalCost);
  assert.equal(state.spent, state.plan.totalCost);
});

test('a key that names no row is ignored rather than tracked', () => {
  const state = resultsState();
  state.toggleChecked('Unobtainium__g');
  assert.equal(state.checkedKeys.size, 0);
  assert.equal(state.spent, 0);
});

test('ticking notifies subscribers so the running total repaints', () => {
  const state = resultsState();
  let notifications = 0;
  state.subscribe(() => notifications++);
  state.toggleChecked(itemKey(state.shoppingList.items[0]));
  assert.equal(notifications, 1);
});

test('an ignored key does not notify, so no repaint is triggered for nothing', () => {
  const state = resultsState();
  let notifications = 0;
  state.subscribe(() => notifications++);
  state.toggleChecked('Unobtainium__g');
  assert.equal(notifications, 0);
});

test('restored ticks are re-validated against the plan actually solved', () => {
  // Ticks persist across a closed tab, but the plan is re-solved rather than
  // restored (prices move). A stored key for a row this plan does not contain
  // must be dropped, not counted.
  const state = resultsState(['Garlic__g', 'Unobtainium__g', 'Garlic__kg']);
  assert.deepEqual([...state.checkedKeys], ['Garlic__g']);
  const garlic = state.shoppingList.items.find((item) => item.name === 'Garlic');
  assert.equal(state.spent, garlic.cost);
});

test('restoring nothing is the same as a fresh basket', () => {
  for (const restored of [undefined, []]) {
    const state = createAppState();
    state.submit({ budget: 300, familySize: 4 });
    state.finish(THREE_RECIPES, restored);
    assert.equal(state.checkedKeys.size, 0);
    assert.equal(state.spent, 0);
  }
});

test('a new budget empties the basket rather than carrying ticks into a new list', () => {
  const state = resultsState();
  state.toggleChecked(itemKey(state.shoppingList.items[0]));
  assert.ok(state.spent > 0);

  state.reset();
  assert.equal(state.checkedKeys.size, 0);
  assert.equal(state.spent, 0);
});

/* ── empty state (ROADMAP B5) ─────────────────────────────────────────── */

test('an empty plan still names what the budget does buy', () => {
  // The dead end this replaces: "try at least ₱40" and nothing else, to
  // someone holding ₱25 who is not going to find another ₱15.
  const state = createAppState();
  state.submit({ budget: 25, familySize: 4 });
  state.finish(THREE_RECIPES);

  assert.equal(state.screen, 'empty');
  assert.equal(state.minimumBudget, 40, 'the existing advice must survive');
  assert.ok(state.partial, 'expected a partial suggestion');
  assert.equal(state.partial.name, 'Lugaw', 'the cheapest dish per serving');
  assert.equal(state.partial.servings, 2); // 25 / 10 per serving, floored
  assert.equal(state.partial.cost, 20);
});

test('the partial suggestion may feed fewer people than the family, and says so honestly', () => {
  const state = createAppState();
  state.submit({ budget: 25, familySize: 4 });
  state.finish(THREE_RECIPES);
  assert.ok(state.partial.servings < state.familySize);
});

test('a budget below even one serving offers nothing rather than zero servings', () => {
  const state = createAppState();
  state.submit({ budget: 5, familySize: 4 });
  state.finish(THREE_RECIPES);
  assert.equal(state.screen, 'empty');
  assert.equal(state.partial, null);
});

test('a successful plan carries no partial suggestion', () => {
  const state = resultsState();
  assert.equal(state.partial, null);
});

test('reset clears the partial suggestion with the rest of the screen', () => {
  const state = createAppState();
  state.submit({ budget: 25, familySize: 4 });
  state.finish(THREE_RECIPES);
  assert.ok(state.partial);
  state.reset();
  assert.equal(state.partial, null);
});
