import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../js/solver.js';
import { buildShoppingList } from '../js/shopping-list.js';
import { THREE_RECIPES } from './fixtures.js';

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
