import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppState, MAX_BUDGET, MAX_FAMILY_SIZE, MAX_DAYS } from '../js/app-state.js';
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

/* ── the day dimension (ROADMAP A2) ───────────────────────────────────── */

test('a plan with no days given behaves exactly as it always has', () => {
  // Every figure in DEVNOTES is a one-day figure. `days` defaults to 1 so those
  // remain reachable and this feature cannot silently move them.
  const a = createAppState();
  a.submit({ budget: 300, familySize: 4 });
  a.finish(THREE_RECIPES);

  const b = createAppState();
  b.submit({ budget: 300, familySize: 4, days: 1 });
  b.finish(THREE_RECIPES);

  assert.equal(a.days, 1);
  assert.equal(a.plan.totalCost, b.plan.totalCost);
  assert.equal(a.shoppingList.totalCost, b.shoppingList.totalCost);
  assert.equal(a.totalCost, a.plan.totalCost);
});

test('the solver is asked for ONE day at budget/days, never the whole budget', () => {
  // The ₱2000 bug: solving a week's money in one pass describes a single
  // impossible day of eating. 300/3 must solve the same day as a plain 100.
  const spread = createAppState();
  spread.submit({ budget: 300, familySize: 4, days: 3 });
  spread.finish(THREE_RECIPES);

  const oneDay = createAppState();
  oneDay.submit({ budget: 100, familySize: 4 });
  oneDay.finish(THREE_RECIPES);

  assert.equal(spread.dailyBudget, 100);
  assert.equal(spread.plan.totalCost, oneDay.plan.totalCost);
  assert.deepEqual(
    spread.plan.meals.map((m) => `${m.recipe.name} x${m.portions}`),
    oneDay.plan.meals.map((m) => `${m.recipe.name} x${m.portions}`)
  );
});

test('coverage stays per-day, so the percentages mean the same at any span', () => {
  // The whole reason for solving one day at a time: DAILY_TARGETS_PER_PERSON is
  // a daily figure. If coverage moved with `days` it would silently compare a
  // week of food against one day of need.
  const spread = createAppState();
  spread.submit({ budget: 300, familySize: 4, days: 3 });
  spread.finish(THREE_RECIPES);

  const oneDay = createAppState();
  oneDay.submit({ budget: 100, familySize: 4 });
  oneDay.finish(THREE_RECIPES);

  for (const key of ['calories', 'protein', 'iron', 'vitaminA']) {
    assert.equal(spread.coverage[key].percent, oneDay.coverage[key].percent, key);
  }
});

test('the total charged is one day repeated, and the list matches it exactly', () => {
  // The invariant the whole project protects: the figure on the plan card and
  // the shopping-list Kabuuan must be identical. Multiplying by days is a new
  // way for them to drift apart, so it is asserted at every span.
  for (const days of [1, 2, 3, 5, 7, 14]) {
    const state = createAppState();
    state.submit({ budget: 300 * days, familySize: 4, days });
    state.finish(THREE_RECIPES);
    if (state.screen !== 'results') continue;

    assert.equal(
      state.totalCost,
      Math.round(state.plan.totalCost * days * 100) / 100,
      `${days} days: total is not one day repeated`
    );
    assert.equal(
      state.shoppingList.totalCost,
      state.totalCost,
      `${days} days: Kabuuan ${state.shoppingList.totalCost} != plan total ${state.totalCost}`
    );
  }
});

test('shopping quantities scale with days — one trip, not one per day', () => {
  const oneDay = createAppState();
  oneDay.submit({ budget: 300, familySize: 4, days: 1 });
  oneDay.finish(THREE_RECIPES);

  const threeDay = createAppState();
  threeDay.submit({ budget: 900, familySize: 4, days: 3 });
  threeDay.finish(THREE_RECIPES);

  const garlic1 = oneDay.shoppingList.items.find((i) => i.name === 'Garlic');
  const garlic3 = threeDay.shoppingList.items.find((i) => i.name === 'Garlic');
  assert.equal(garlic3.quantity, garlic1.quantity * 3);
});

test('rejects a day count below one or past the freshness ceiling', () => {
  for (const days of [0, -1]) {
    const state = createAppState();
    state.submit({ budget: 300, familySize: 4, days });
    assert.equal(state.screen, 'input');
    assert.match(state.error, /day/i);
  }
  const tooLong = createAppState();
  tooLong.submit({ budget: 3000, familySize: 4, days: MAX_DAYS + 1 });
  assert.equal(tooLong.screen, 'input');
  assert.match(tooLong.error, /days/i);
});

test('accepts a day count exactly at the ceiling', () => {
  const state = createAppState();
  state.submit({ budget: 3000, familySize: 4, days: MAX_DAYS });
  assert.equal(state.screen, 'calculating');
  assert.equal(state.error, null);
});

test('a budget too thin to stretch says so instead of reporting an empty plan', () => {
  // ₱10 over 14 days is ₱0 a day. Solving that returns an empty plan, which the
  // UI would report as "nothing fits your budget" — true but useless. The
  // actionable answer is that the span, not the budget, is the problem.
  const state = createAppState();
  state.submit({ budget: 10, familySize: 4, days: 14 });
  assert.equal(state.screen, 'input');
  assert.match(state.error, /fewer days/i);
});

test('the minimum-budget advice covers the whole span, not one day of it', () => {
  // Telling a 3-day shopper they need ₱40 would send them back to a plan that
  // still does not solve.
  const oneDay = createAppState();
  oneDay.submit({ budget: 25, familySize: 4, days: 1 });
  oneDay.finish(THREE_RECIPES);

  const threeDay = createAppState();
  threeDay.submit({ budget: 75, familySize: 4, days: 3 });
  threeDay.finish(THREE_RECIPES);

  assert.equal(oneDay.minimumBudget, 40);
  assert.equal(threeDay.screen, 'empty');
  assert.equal(threeDay.minimumBudget, 120);
});

test('reset clears the span back to a single day', () => {
  const state = createAppState();
  state.submit({ budget: 900, familySize: 4, days: 3 });
  state.finish(THREE_RECIPES);
  state.reset();
  assert.equal(state.totalCost, null);
  assert.equal(state.dailyBudget, null);
});
