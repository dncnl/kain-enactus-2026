import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../js/solver.js';
import { THREE_RECIPES } from './fixtures.js';

test('plan total cost never exceeds the entered budget', () => {
  const plan = solve({ budget: 100, familySize: 4, recipes: THREE_RECIPES });
  assert.ok(plan.totalCost <= 100, `totalCost ${plan.totalCost} exceeded budget 100`);
});

test('picks the optimal combination, not merely an affordable one', () => {
  // Hand-worked: at budget 100 / family 4, affordable options are
  // lugaw x1 (40), lugaw x2 (80), monggo x1 (80). Weighted nutrition values
  // are 3557/portion for lugaw and 10162 for monggo, so monggo x1 wins.
  const plan = solve({ budget: 100, familySize: 4, recipes: THREE_RECIPES });

  assert.equal(plan.meals.length, 1);
  assert.equal(plan.meals[0].recipe.id, 'ginisang-monggo');
  assert.equal(plan.meals[0].portions, 1);
  assert.equal(plan.totalCost, 80);
});

test('spends the budget rather than returning an empty plan', () => {
  // Guards against a vacuously-passing "never exceeds budget" solver.
  const plan = solve({ budget: 300, familySize: 4, recipes: THREE_RECIPES });
  assert.ok(plan.meals.length > 0, 'expected a non-empty plan at budget 300');
  assert.ok(plan.totalCost > 0, 'expected non-zero spend at budget 300');
});

test('zero budget yields an empty plan, not a crash', () => {
  const plan = solve({ budget: 0, familySize: 4, recipes: THREE_RECIPES });
  assert.deepEqual(plan.meals, []);
  assert.equal(plan.totalCost, 0);
});

test('budget far above any plan is capped by portion limits', () => {
  // maxPortions caps the plan: 3 lugaw + 3 monggo + 2 adobo at family 4
  // = 3*40 + 3*80 + 2*180 = 120 + 240 + 360 = 720.
  const plan = solve({ budget: 100000, familySize: 4, recipes: THREE_RECIPES });
  assert.equal(plan.totalCost, 720);
});

test('single person costs a quarter of a family of four', () => {
  const solo = solve({ budget: 100000, familySize: 1, recipes: THREE_RECIPES });
  assert.equal(solo.totalCost, 180); // 720 / 4
});

test('large family scales cost without exceeding budget', () => {
  const plan = solve({ budget: 500, familySize: 10, recipes: THREE_RECIPES });
  assert.ok(plan.totalCost <= 500);
  assert.ok(plan.meals.length > 0);
});

test('missing or malformed input degrades safely', () => {
  assert.equal(solve({ budget: NaN, familySize: 4, recipes: THREE_RECIPES }).totalCost, 0);
  assert.equal(solve({ budget: 500, familySize: 4, recipes: [] }).totalCost, 0);
  assert.equal(solve({ budget: -50, familySize: 4, recipes: THREE_RECIPES }).totalCost, 0);
});
