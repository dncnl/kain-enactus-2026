/**
 * Turns a solved meal plan into a single wet-market shopping list.
 * Pure — no network, no DOM. Safe for the solver's dependency graph.
 */

/**
 * Identity of a shopping-list line: name AND unit, never name alone.
 *
 * This is the same key buildShoppingList() merges on, exported so market mode
 * ticks the exact rows the list produced. One definition, so a ticked item can
 * never drift away from the line it belongs to.
 */
export function itemKey(item) {
  return `${item?.name ?? ''}__${item?.unit ?? ''}`;
}

/**
 * Pesos worth of the list already in the basket.
 *
 * Pure arithmetic over the rendered lines, so the running "spent" figure on
 * the results screen can never disagree with the rows the user actually
 * ticked. Unknown keys are ignored rather than guessed at — a plan solved
 * against different prices legitimately has different lines.
 *
 * @param {Array} items        buildShoppingList().items
 * @param {Set<string>|Array<string>} checkedKeys  keys from itemKey()
 * @returns {number} pesos, rounded to centavos
 */
export function sumChecked(items, checkedKeys) {
  const keys = checkedKeys instanceof Set ? checkedKeys : new Set(checkedKeys ?? []);
  const total = (items ?? []).reduce(
    (sum, item) => (keys.has(itemKey(item)) ? sum + (Number.isFinite(item?.cost) ? item.cost : 0) : sum),
    0
  );
  return round2(total);
}

/**
 * Keys that still name a line on this list. Ticks are persisted across
 * reloads, but the plan is re-solved rather than restored (prices move), so a
 * stored key must be re-validated against the list actually on screen.
 */
export function knownKeys(items, checkedKeys) {
  const present = new Set((items ?? []).map(itemKey));
  return [...new Set(checkedKeys ?? [])].filter((key) => present.has(key));
}

/**
 * @param {object} plan  Output of solve().
 * @returns {{items: Array, totalCost: number}}
 */
export function buildShoppingList(plan) {
  const meals = plan?.meals ?? [];
  const merged = new Map();

  for (const meal of meals) {
    const { recipe, servings } = meal;
    // Ingredient quantities are stated for recipe.servings; scale to what the
    // plan actually cooks.
    const scale = servings / recipe.servings;

    for (const ingredient of recipe.ingredients ?? []) {
      // Same name AND unit merge; differing units stay separate lines so we
      // never silently add millilitres to grams.
      const key = itemKey(ingredient);
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += ingredient.quantity * scale;
        existing.cost += ingredient.cost * scale;
        existing.usedIn.push(recipe.name);
      } else {
        merged.set(key, {
          name: ingredient.name,
          unit: ingredient.unit,
          quantity: ingredient.quantity * scale,
          cost: ingredient.cost * scale,
          usedIn: [recipe.name]
        });
      }
    }
  }

  const items = [...merged.values()]
    .map((item) => ({
      ...item,
      quantity: round2(item.quantity),
      cost: round2(item.cost)
    }))
    .sort((a, b) => b.cost - a.cost);

  // The results screen shows the plan total and this list total side by side,
  // so they must be equal. They are reached by different rounding paths --
  // solve() rounds costPerServing * familySize * portions, while the lines here
  // are each rounded and then summed -- which drifts by a centavo or two once
  // costs carry decimals. Settle the difference on the largest line, the one
  // where a centavo is least visible, so the two figures agree by construction.
  const lineSum = round2(items.reduce((sum, item) => sum + item.cost, 0));
  const planTotal = Number.isFinite(plan?.totalCost) ? plan.totalCost : lineSum;
  const residual = round2(planTotal - lineSum);
  if (residual !== 0 && items.length > 0) {
    items[0].cost = round2(items[0].cost + residual);
  }

  return {
    items,
    totalCost: round2(items.reduce((sum, item) => sum + item.cost, 0))
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
