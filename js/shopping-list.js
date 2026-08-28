/**
 * Turns a solved meal plan into a single wet-market shopping list.
 * Pure — no network, no DOM. Safe for the solver's dependency graph.
 */

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
      const key = `${ingredient.name}__${ingredient.unit}`;
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

  return {
    items,
    totalCost: round2(items.reduce((sum, item) => sum + item.cost, 0))
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
