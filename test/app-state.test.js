import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppState, MAX_BUDGET, MAX_FAMILY_SIZE } from '../js/app-state.js';
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
