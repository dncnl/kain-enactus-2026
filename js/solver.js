/**
 * Kain core solver — bounded knapsack dynamic programming.
 *
 * ARCHITECTURAL CONSTRAINT (non-negotiable): this module is a pure client-side
 * function with ZERO network calls. Nothing it imports may perform I/O. The
 * project's Innovation and Scale claims rest on this. Do not add fetch/XHR here.
 *
 * Units: budget and all costs are in Philippine pesos.
 */

/**
 * Daily targets live in their own data-only module so the backend developer can
 * edit them without touching solver logic. Re-exported here because existing
 * callers import it from this module.
 */
export { DAILY_TARGETS_PER_PERSON } from './nutrition-targets.js';
import { DAILY_TARGETS_PER_PERSON } from './nutrition-targets.js';

/**
 * Relative importance when maximizing nutrition. Protein and iron are weighted
 * above calories deliberately: the problem Kain addresses is stunting, which is
 * a protein/micronutrient failure, not a pure calorie shortfall. Without this,
 * the optimizer degenerates to "buy the cheapest calories" (all rice).
 */
const NUTRIENT_WEIGHTS = { calories: 1, protein: 1.5, iron: 1.25, vitaminA: 1 };

const VALUE_SCALE = 10000; // float ratios -> integers, so DP compares exactly

/** Nutritional value of one serving, as a weighted fraction of daily need. */
function servingValue(recipe) {
  let score = 0;
  for (const [nutrient, weight] of Object.entries(NUTRIENT_WEIGHTS)) {
    const amount = recipe.nutritionPerServing?.[nutrient] ?? 0;
    const target = DAILY_TARGETS_PER_PERSON[nutrient];
    score += weight * (amount / target);
  }
  return Math.round(score * VALUE_SCALE);
}

/**
 * Expand bounded quantities into binary-split items so a 0/1 knapsack pass
 * covers every achievable count (1,2,4,... portions) without looping per unit.
 */
function expandItems(recipes, familySize) {
  const items = [];
  recipes.forEach((recipe, index) => {
    const unitCost = recipe.costPerServing * familySize;
    // Round UP for DP capacity: guarantees the plan can never overspend the
    // budget once real decimal costs are summed back.
    const unitCostCeil = Math.ceil(unitCost);
    const unitValue = servingValue(recipe);
    if (unitCostCeil <= 0 || unitValue <= 0) return;

    let remaining = Math.max(0, recipe.maxPortions ?? 1);
    let chunk = 1;
    while (remaining > 0) {
      const take = Math.min(chunk, remaining);
      items.push({
        recipeIndex: index,
        portions: take,
        cost: unitCostCeil * take,
        value: unitValue * take
      });
      remaining -= take;
      chunk *= 2;
    }
  });
  return items;
}

/**
 * Solve for the meal plan delivering the most nutrition within a budget.
 *
 * @param {object} input
 * @param {number} input.budget      Total pesos available.
 * @param {number} input.familySize  People to feed.
 * @param {Array}  input.recipes     Recipe records (see data/recipes.json).
 * @returns {{meals: Array, totalCost: number, budget: number, familySize: number}}
 */
export function solve({ budget, familySize, recipes }) {
  const safeBudget = Number.isFinite(budget) ? Math.max(0, Math.floor(budget)) : 0;
  const safeFamily = Number.isFinite(familySize) ? Math.max(1, Math.floor(familySize)) : 1;
  const list = Array.isArray(recipes) ? recipes : [];

  const empty = {
    meals: [],
    totalCost: 0,
    budget: safeBudget,
    familySize: safeFamily
  };
  if (safeBudget === 0 || list.length === 0) return empty;

  const items = expandItems(list, safeFamily);
  if (items.length === 0) return empty;

  // best[c] = max value achievable spending at most c pesos.
  const best = new Int32Array(safeBudget + 1);
  // choice[i][c] records whether item i was taken, for reconstruction.
  const choice = items.map(() => new Uint8Array(safeBudget + 1));

  items.forEach((item, i) => {
    const row = choice[i];
    for (let c = safeBudget; c >= item.cost; c--) {
      const candidate = best[c - item.cost] + item.value;
      if (candidate > best[c]) {
        best[c] = candidate;
        row[c] = 1;
      }
    }
  });

  // Walk the choice table backwards to recover which portions were selected.
  const portionsByRecipe = new Map();
  let capacity = safeBudget;
  for (let i = items.length - 1; i >= 0; i--) {
    if (choice[i][capacity] === 1) {
      const item = items[i];
      portionsByRecipe.set(
        item.recipeIndex,
        (portionsByRecipe.get(item.recipeIndex) ?? 0) + item.portions
      );
      capacity -= item.cost;
    }
  }

  const meals = [...portionsByRecipe.entries()]
    .map(([index, portions]) => {
      const recipe = list[index];
      return {
        recipe,
        portions,
        servings: portions * safeFamily,
        cost: round2(recipe.costPerServing * safeFamily * portions)
      };
    })
    .sort((a, b) => b.cost - a.cost);

  return {
    meals,
    totalCost: round2(meals.reduce((sum, meal) => sum + meal.cost, 0)),
    budget: safeBudget,
    familySize: safeFamily
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
