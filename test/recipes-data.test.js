import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const recipes = JSON.parse(readFileSync(new URL('../data/recipes.json', import.meta.url)));

/**
 * DATA CONTRACT. These tests define the shape the backend developer must
 * preserve when swapping mock data for real FNRI/DA-sourced data.
 */

test('dataset is large enough to give the solver real choices, with unique ids', () => {
  // A floor, not an exact count: replacing the mock set with real FNRI/DA data
  // will change how many recipes there are, and that should not fail the suite.
  // Below roughly a dozen the optimizer has too little to work with and plans
  // collapse onto one or two dishes.
  assert.ok(recipes.length >= 12, `only ${recipes.length} recipes; expected at least 12`);
  assert.equal(new Set(recipes.map((r) => r.id)).size, recipes.length, 'recipe ids must be unique');
});

test('every recipe carries the fields the solver reads', () => {
  for (const r of recipes) {
    assert.ok(typeof r.id === 'string' && r.id.length > 0, `bad id: ${r.id}`);
    assert.ok(typeof r.name === 'string' && r.name.length > 0, `bad name on ${r.id}`);
    assert.ok(r.servings > 0, `bad servings on ${r.id}`);
    assert.ok(r.costPerServing > 0, `bad costPerServing on ${r.id}`);
    assert.ok(r.maxPortions >= 1, `bad maxPortions on ${r.id}`);
    for (const key of ['calories', 'protein', 'iron', 'vitaminA']) {
      assert.ok(
        typeof r.nutritionPerServing?.[key] === 'number',
        `${r.id} missing nutritionPerServing.${key}`
      );
    }
    assert.ok(Array.isArray(r.ingredients) && r.ingredients.length > 0, `no ingredients on ${r.id}`);
  }
});

test('ingredient costs reconcile to costPerServing (shopping list must balance)', () => {
  for (const r of recipes) {
    // Both sides are rounded to centavos: accumulating floats drifts (0.1 + 0.2
    // is not 0.3), and comparing a raw sum against a rounded product reports a
    // mismatch that does not exist in pesos.
    const batch = Math.round(r.ingredients.reduce((sum, i) => sum + i.cost, 0) * 100) / 100;
    const expected = Math.round(r.costPerServing * r.servings * 100) / 100;
    assert.equal(batch, expected, `${r.id}: ingredients sum ${batch} != batch cost ${expected}`);
  }
});

test('every ingredient has a name, positive quantity, unit and cost', () => {
  for (const r of recipes) {
    for (const i of r.ingredients) {
      assert.ok(typeof i.name === 'string' && i.name.length > 0, `${r.id}: unnamed ingredient`);
      assert.ok(i.quantity > 0, `${r.id}/${i.name}: bad quantity`);
      assert.ok(typeof i.unit === 'string' && i.unit.length > 0, `${r.id}/${i.name}: bad unit`);
      assert.ok(i.cost > 0, `${r.id}/${i.name}: bad cost`);
    }
  }
});
