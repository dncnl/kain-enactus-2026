#!/usr/bin/env node
/**
 * Generates data/recipes.json from data/prices.json + data/recipes.source.json.
 *
 *   npm run build:data
 *
 * WHY THIS EXISTS. Ingredient prices used to be written directly into every
 * recipe — 113 hand-maintained rows — and had to satisfy
 * `sum(ingredients.cost) === costPerServing * servings` by hand. In practice
 * people back-filled costs until the sum worked, so the same ingredient ended up
 * at different prices in different recipes (cooking oil ranged 36%). Prices now
 * live in one place and costs are derived, so that class of drift is impossible.
 *
 * This is a data pipeline, not an app build step. Its output is committed and
 * the site is still plain static files — nothing about deployment changes.
 *
 * EDIT data/prices.json or data/recipes.source.json. Never edit
 * data/recipes.json: it is generated, and test/data-build.test.js fails if it
 * stops matching its sources.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Sanity ceilings for a single serving. These catch data-entry slips — a
 * misplaced decimal turning 3.5 mg of iron into 35 or 350 — not unusual foods.
 * Widen them if a legitimate recipe trips one; do not delete them.
 */
const PLAUSIBLE_MAX = { calories: 2000, protein: 200, iron: 50, vitaminA: 5000 };
const NUTRIENTS = Object.keys(PLAUSIBLE_MAX);

const round2 = (value) => Math.round(value * 100) / 100;

export function loadSources(root = ROOT) {
  return {
    prices: JSON.parse(readFileSync(join(root, 'data/prices.json'), 'utf8')),
    recipes: JSON.parse(readFileSync(join(root, 'data/recipes.source.json'), 'utf8'))
  };
}

/**
 * Validate, then derive costs. Returns { recipes, errors } — every problem is
 * collected rather than thrown on the first one, so a bad import can be fixed
 * in a single pass instead of one message at a time.
 */
export function buildRecipes({ prices, recipes }) {
  const errors = [];
  const priceOf = new Map();

  for (const entry of prices) {
    const key = `${entry.name}|${entry.unit}`;
    if (priceOf.has(key)) errors.push(`prices.json: duplicate entry for ${key}`);
    if (!(entry.pricePerUnit > 0) || !Number.isFinite(entry.pricePerUnit)) {
      errors.push(`prices.json: ${key} needs a positive pricePerUnit (got ${entry.pricePerUnit})`);
    }
    priceOf.set(key, entry.pricePerUnit);
  }

  const seenIds = new Set();
  const built = [];

  for (const recipe of recipes) {
    const id = recipe.id;
    const where = `recipes.source.json: ${id ?? '(missing id)'}`;

    if (!id) errors.push(`${where}: every recipe needs an id`);
    if (seenIds.has(id)) errors.push(`${where}: duplicate id`);
    seenIds.add(id);

    if (!recipe.name) errors.push(`${where}: missing name`);
    if (!(recipe.servings > 0)) errors.push(`${where}: servings must be > 0`);
    if (!(recipe.maxPortions >= 1)) errors.push(`${where}: maxPortions must be >= 1`);

    for (const key of NUTRIENTS) {
      const value = recipe.nutritionPerServing?.[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        errors.push(`${where}: nutritionPerServing.${key} must be a non-negative number`);
      } else if (value > PLAUSIBLE_MAX[key]) {
        errors.push(
          `${where}: nutritionPerServing.${key} = ${value} exceeds the plausible ceiling ` +
            `of ${PLAUSIBLE_MAX[key]} per serving — check for a misplaced decimal`
        );
      }
    }

    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
      errors.push(`${where}: needs at least one ingredient`);
      continue;
    }

    const ingredients = recipe.ingredients.map((ingredient) => {
      const key = `${ingredient.name}|${ingredient.unit}`;
      if (!ingredient.name) errors.push(`${where}: unnamed ingredient`);
      if (!ingredient.unit) errors.push(`${where}/${ingredient.name}: missing unit`);
      if (!(ingredient.quantity > 0)) errors.push(`${where}/${ingredient.name}: quantity must be > 0`);
      if (!priceOf.has(key)) errors.push(`${where}: no price entry for "${key}" — add it to prices.json`);

      return {
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        cost: round2(ingredient.quantity * (priceOf.get(key) ?? 0))
      };
    });

    // Largest-remainder allocation. Rounding each line independently will not
    // generally reconcile against costPerServing * servings, so compute the
    // per-serving cost, then settle the difference on the largest line. Without
    // this the shopping list and the plan total disagree by a centavo.
    const lineSum = round2(ingredients.reduce((sum, i) => sum + i.cost, 0));
    const costPerServing = round2(lineSum / (recipe.servings || 1));
    const residual = round2(costPerServing * (recipe.servings || 1) - lineSum);
    if (residual !== 0) {
      const largest = ingredients.reduce((a, b) => (b.cost > a.cost ? b : a));
      largest.cost = round2(largest.cost + residual);
    }

    for (const i of ingredients) {
      if (!(i.cost > 0)) errors.push(`${where}/${i.name}: derived cost is ${i.cost}; check its price`);
    }

    built.push({
      id: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      costPerServing,
      maxPortions: recipe.maxPortions,
      nutritionPerServing: recipe.nutritionPerServing,
      ingredients
    });
  }

  // The invariant the whole pipeline exists to guarantee.
  for (const recipe of built) {
    const sum = round2(recipe.ingredients.reduce((s, i) => s + i.cost, 0));
    const batch = round2(recipe.costPerServing * recipe.servings);
    if (sum !== batch) {
      errors.push(`${recipe.id}: ingredients sum ${sum} != batch cost ${batch} (generator bug)`);
    }
  }

  return { recipes: built, errors };
}

/** Exact bytes written to data/recipes.json — shared with the sync test. */
export function serialize(recipes) {
  return JSON.stringify(recipes, null, 2) + '\n';
}

/**
 * Provenance summary for the UI: how current the prices are, and how much of
 * the dataset is actually sourced.
 *
 * WHY A SEPARATE FILE. `data/prices.json` is build-time only — it never
 * reaches the browser — and `data/recipes.json` is a bare top-level array the
 * solver reads directly, so wrapping it in an envelope would break the pinned
 * data contract. A second small file carries the metadata without touching
 * either.
 *
 * NO BUILD TIMESTAMP, deliberately. Everything here is derived from the source
 * data, so re-running the generator on unchanged sources produces identical
 * bytes. A `Date.now()` field would make `data/meta.json` differ on every run
 * and turn the CI staleness check into a permanent red.
 *
 * Entries with a null `pricedOn` are the ingredients still carrying mock
 * prices (see DEVNOTES): counted in `total`, excluded from `sourced` and from
 * the date range, so the line the app shows never claims a date it does not
 * have.
 */
export function buildMeta({ prices }) {
  const dated = prices
    .map((entry) => entry.pricedOn)
    .filter((date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();

  return {
    prices: {
      total: prices.length,
      sourced: dated.length,
      earliest: dated[0] ?? null,
      latest: dated[dated.length - 1] ?? null
    }
  };
}

/** Exact bytes written to data/meta.json — shared with the sync test. */
export function serializeMeta(meta) {
  return JSON.stringify(meta, null, 2) + '\n';
}

// Run only when invoked directly, so the test can import the functions above.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sources = loadSources();
  const { recipes, errors } = buildRecipes(sources);

  if (errors.length > 0) {
    console.error(`\n✖ ${errors.length} problem(s) — data/recipes.json was NOT written:\n`);
    for (const error of errors) console.error(`  • ${error}`);
    console.error('');
    process.exit(1);
  }

  writeFileSync(join(ROOT, 'data/recipes.json'), serialize(recipes));
  const total = recipes.reduce((n, r) => n + r.ingredients.length, 0);
  console.log(`✔ wrote data/recipes.json — ${recipes.length} recipes, ${total} ingredient rows`);

  const meta = buildMeta(sources);
  writeFileSync(join(ROOT, 'data/meta.json'), serializeMeta(meta));
  console.log(
    `✔ wrote data/meta.json — ${meta.prices.sourced}/${meta.prices.total} ingredients sourced, ` +
      `priced ${meta.prices.earliest} to ${meta.prices.latest}`
  );

  console.log('  Remember to bump CACHE_NAME in sw.js so cached clients pick this up.');
}
