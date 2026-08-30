import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSources, buildRecipes, serialize, buildMeta, serializeMeta } from '../scripts/build-data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * data/recipes.json is GENERATED from data/prices.json and
 * data/recipes.source.json. These tests keep that true. Without them, someone
 * edits the generated file by hand, it silently stops matching its sources, and
 * the next `npm run build:data` quietly reverts their work.
 */

test('the committed data/recipes.json matches what the generator produces', () => {
  const { recipes, errors } = buildRecipes(loadSources(ROOT));
  assert.deepEqual(errors, [], 'the committed source data must build cleanly');

  const committed = readFileSync(join(ROOT, 'data/recipes.json'), 'utf8');
  assert.equal(
    serialize(recipes),
    committed,
    'data/recipes.json is out of sync with its sources — run `npm run build:data`'
  );
});

test('the committed data/meta.json matches what the generator produces', () => {
  const meta = buildMeta(loadSources(ROOT));
  const committed = readFileSync(join(ROOT, 'data/meta.json'), 'utf8');
  assert.equal(
    serializeMeta(meta),
    committed,
    'data/meta.json is out of sync with its sources — run `npm run build:data`'
  );
});

test('the metadata is deterministic, so CI can diff it', () => {
  // A build timestamp would make this file differ on every run and turn the
  // staleness check in .github/workflows/test.yml into a permanent red. Every
  // field must derive from the source data instead.
  const sources = loadSources(ROOT);
  assert.equal(serializeMeta(buildMeta(sources)), serializeMeta(buildMeta(sources)));
});

test('the metadata counts sourced prices honestly and excludes mock ones', () => {
  // 3 ingredients are confirmed untracked by DA, PSA and BFAR and carry a null
  // pricedOn (see DEVNOTES). They are part of the dataset but must never be
  // counted as sourced, and must never contribute a date the app then displays.
  const sources = loadSources(ROOT);
  const meta = buildMeta(sources);
  const undated = sources.prices.filter((entry) => !entry.pricedOn).length;

  assert.equal(meta.prices.total, sources.prices.length);
  assert.equal(meta.prices.sourced, sources.prices.length - undated);
  assert.ok(meta.prices.sourced < meta.prices.total, 'the mock prices must still be visible as a gap');
});

test('the reported date range only contains dates that actually exist in prices.json', () => {
  const sources = loadSources(ROOT);
  const meta = buildMeta(sources);
  const dates = sources.prices.map((entry) => entry.pricedOn).filter(Boolean);

  assert.ok(dates.includes(meta.prices.earliest), 'earliest must be a real pricedOn value');
  assert.ok(dates.includes(meta.prices.latest), 'latest must be a real pricedOn value');
  assert.ok(meta.prices.earliest <= meta.prices.latest, 'the range must not be inverted');
  for (const date of dates) {
    assert.ok(date >= meta.prices.earliest && date <= meta.prices.latest, `${date} sits outside the range`);
  }
});

test('a dataset with no dated prices reports no range rather than an invented one', () => {
  const sources = loadSources(ROOT);
  sources.prices = sources.prices.map((entry) => ({ ...entry, pricedOn: null }));
  const meta = buildMeta(sources);
  assert.equal(meta.prices.sourced, 0);
  assert.equal(meta.prices.earliest, null);
  assert.equal(meta.prices.latest, null);
});

test('the generator refuses data with an impossible price', () => {
  const sources = loadSources(ROOT);
  sources.prices[0] = { ...sources.prices[0], pricePerUnit: -1 };
  const { errors } = buildRecipes(sources);
  assert.ok(
    errors.some((e) => /positive pricePerUnit/.test(e)),
    'a negative price must be reported'
  );
});

test('the generator refuses an ingredient with no price entry', () => {
  const sources = loadSources(ROOT);
  sources.recipes[0].ingredients.push({ name: 'Unobtainium', quantity: 1, unit: 'g' });
  const { errors } = buildRecipes(sources);
  assert.ok(
    errors.some((e) => /no price entry for "Unobtainium\|g"/.test(e)),
    'a missing price must name the ingredient that needs one'
  );
});

test('the generator catches a misplaced decimal in nutrition data', () => {
  // The realistic data-entry slip: 3.5 mg of iron typed as 350.
  const sources = loadSources(ROOT);
  sources.recipes[0].nutritionPerServing = { ...sources.recipes[0].nutritionPerServing, iron: 350 };
  const { errors } = buildRecipes(sources);
  assert.ok(
    errors.some((e) => /iron = 350 exceeds the plausible ceiling/.test(e)),
    'an implausible nutrient value must be reported'
  );
});

test('generated recipes satisfy the reconciliation invariant', () => {
  // The whole reason the pipeline exists: every recipe's ingredient costs must
  // sum to costPerServing * servings, so the shopping list can never contradict
  // the plan total.
  const { recipes } = buildRecipes(loadSources(ROOT));
  for (const recipe of recipes) {
    const sum = Math.round(recipe.ingredients.reduce((s, i) => s + i.cost, 0) * 100) / 100;
    const batch = Math.round(recipe.costPerServing * recipe.servings * 100) / 100;
    assert.equal(sum, batch, `${recipe.id} does not reconcile`);
  }
});

test('every ingredient resolves to one price, so merged lines are honest', () => {
  // The bug this pipeline replaced: the same ingredient carried different
  // implied unit prices in different recipes (cooking oil varied by 36%), so a
  // merged shopping-list line showed a blended price matching no real stall.
  const { recipes } = buildRecipes(loadSources(ROOT));
  const seen = new Map();

  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      const key = `${ingredient.name}|${ingredient.unit}`;
      const unitPrice = ingredient.cost / ingredient.quantity;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push({ recipe: recipe.id, unitPrice });
    }
  }

  for (const [key, uses] of seen) {
    if (uses.length < 2) continue;
    const prices = uses.map((u) => u.unitPrice);
    const spread = (Math.max(...prices) - Math.min(...prices)) / Math.min(...prices);
    // A cent of rounding slack per line is expected (largest-remainder
    // allocation lands the residual somewhere); a real price disagreement is
    // orders of magnitude larger than that.
    assert.ok(spread < 0.1, `${key} varies by ${(spread * 100).toFixed(0)}% across recipes`);
  }
});
