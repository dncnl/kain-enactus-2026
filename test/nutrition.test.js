import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../js/solver.js';
import { calculateCoverage } from '../js/nutrition.js';
import { THREE_RECIPES } from './fixtures.js';

test('coverage is delivered nutrition over the family daily need', () => {
  // Hand-worked for the budget-300 / family-4 plan (monggo x3, lugaw x1):
  //   servings: monggo 12, lugaw 4
  //   calories 300*12 + 200*4 = 4400  vs target 2000*4 = 8000 -> 55%
  //   protein  18*12 + 5*4    = 236   vs target 57*4   = 228  -> 103.5%
  //   iron     3*12 + 1*4     = 40    vs target 12*4   = 48   -> 83.3%
  //   vitaminA 40*12 + 10*4   = 520   vs target 500*4  = 2000 -> 26%
  const plan = solve({ budget: 300, familySize: 4, recipes: THREE_RECIPES });
  const coverage = calculateCoverage(plan);

  assert.equal(coverage.calories.percent, 55);
  assert.equal(coverage.protein.percent, 103.5);
  assert.equal(coverage.iron.percent, 83.3);
  assert.equal(coverage.vitaminA.percent, 26);
});

test('coverage reports absolute amounts alongside percentages', () => {
  const plan = solve({ budget: 300, familySize: 4, recipes: THREE_RECIPES });
  const coverage = calculateCoverage(plan);
  assert.equal(coverage.protein.amount, 236);
  assert.equal(coverage.protein.target, 228);
});

test('an empty plan reports zero coverage, not NaN', () => {
  const coverage = calculateCoverage(solve({ budget: 0, familySize: 4, recipes: THREE_RECIPES }));
  assert.equal(coverage.calories.percent, 0);
  assert.equal(coverage.protein.percent, 0);
});
