/**
 * Nutrition coverage: how much of a family's daily need a plan actually meets.
 * Pure — no network, no DOM.
 */
import { DAILY_TARGETS_PER_PERSON } from './solver.js';

/** Display metadata for each tracked nutrient. Order drives the chart. */
export const NUTRIENTS = [
  { key: 'calories', label: 'Energy', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'iron', label: 'Iron', unit: 'mg' },
  { key: 'vitaminA', label: 'Vitamin A', unit: 'mcg' }
];

/**
 * @param {object} plan  Output of solve().
 * @returns {Record<string, {amount:number,target:number,percent:number,label:string,unit:string}>}
 */
export function calculateCoverage(plan) {
  const meals = plan?.meals ?? [];
  const familySize = plan?.familySize ?? 1;
  const coverage = {};

  for (const { key, label, unit } of NUTRIENTS) {
    const amount = meals.reduce(
      (sum, meal) => sum + (meal.recipe.nutritionPerServing?.[key] ?? 0) * meal.servings,
      0
    );
    const target = DAILY_TARGETS_PER_PERSON[key] * familySize;
    coverage[key] = {
      label,
      unit,
      amount: round2(amount),
      target: round2(target),
      percent: target > 0 ? round1((amount / target) * 100) : 0
    };
  }

  return coverage;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
