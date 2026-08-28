import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const recipes = JSON.parse(readFileSync(new URL('../data/recipes.json', import.meta.url)));

/**
 * DATA CONTRACT. These tests define the shape the backend developer must
 * preserve when swapping mock data for real FNRI/DA-sourced data.
 */

test('dataset has the documented 18 recipes with unique ids', () => {
  assert.equal(recipes.length, 18);
  assert.equal(new Set(recipes.map((r) => r.id)).size, 18);
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
    const batch = r.ingredients.reduce((sum, i) => sum + i.cost, 0);
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
