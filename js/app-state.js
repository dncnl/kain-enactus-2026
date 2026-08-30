/**
 * Screen state machine for the input -> calculating -> results flow.
 *
 * Deliberately DOM-free: js/app.js is a thin adapter that renders this state.
 * Keeping the transitions here means the flow (including the "nothing fits your
 * budget" path) is testable without a browser or jsdom.
 */
import { solve } from './solver.js';
import { buildShoppingList, sumChecked, knownKeys } from './shopping-list.js';
import { calculateCoverage } from './nutrition.js';

/**
 * Highest budget we will solve for, in pesos.
 *
 * This is a memory ceiling, not a product opinion. solve() allocates one
 * Uint8Array(budget + 1) per DP item, which is ~36 bytes per peso against the
 * 18-recipe dataset: ₱100k costs 3.4MB and solves in ~19ms, while ₱1B would ask
 * the browser for 33.5GB and kill the tab. The cap lives here rather than in
 * solver.js because the solver's logic is fixed; this is input validation.
 *
 * If the recipe set grows a lot, re-measure — the per-peso cost scales with the
 * number of binary-split items, not with the recipe count directly.
 */
export const MAX_BUDGET = 100000;

/**
 * Highest family size the form accepts.
 *
 * Unlike MAX_BUDGET this is not a crash guard — solve()'s memory cost scales
 * with budget, not family size, so nothing breaks above this number. It is
 * input sanity only: the stepper has no upper clamp and typing directly into
 * the field bypasses it entirely, so a slipped extra digit (450 instead of 4)
 * would otherwise silently multiply every recipe's cost 100x and produce a
 * baffling "nothing fits your budget" result instead of a clear error.
 */
export const MAX_FAMILY_SIZE = 20;

/** Cheapest single meal that feeds the whole family, in pesos. */
function minimumViableBudget(recipes, familySize) {
  const costs = recipes
    .map((r) => r.costPerServing * familySize)
    .filter((c) => c > 0);
  return costs.length ? Math.ceil(Math.min(...costs)) : 0;
}

/**
 * What the money actually buys when no plan feeds the whole family.
 *
 * The empty screen used to be a dead end — "try at least ₱30" to someone who
 * has ₱20 and is not going to find another ₱10 — for exactly the user Kain
 * exists for. A partial answer is still an answer: the cheapest dish, and how
 * many servings that budget reaches, even when that is fewer servings than
 * there are people.
 *
 * Not solver work: one pass for the cheapest cost-per-serving and a division.
 * The solver's own answer for this budget is genuinely empty, and that stays
 * true — this only describes the consolation prize beside it.
 */
function bestPartialMeal(recipes, budget) {
  let cheapest = null;
  for (const recipe of recipes ?? []) {
    if (!(recipe?.costPerServing > 0)) continue;
    if (!cheapest || recipe.costPerServing < cheapest.costPerServing) cheapest = recipe;
  }
  if (!cheapest) return null;

  const servings = Math.floor(budget / cheapest.costPerServing);
  if (servings < 1) return null;

  return {
    name: cheapest.name,
    servings,
    cost: Math.round(servings * cheapest.costPerServing * 100) / 100
  };
}

export function createAppState() {
  const listeners = new Set();

  const state = {
    screen: 'input',
    error: null,
    budget: null,
    familySize: null,
    plan: null,
    shoppingList: null,
    coverage: null,
    minimumBudget: null,
    capped: false,
    /** Market mode: shopping-list keys already in the basket, and their cost. */
    checkedKeys: new Set(),
    spent: 0,
    /** Empty screen: the best partial thing this budget buys, or null. */
    partial: null,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Validate input and enter the calculating screen. */
    submit({ budget, familySize }) {
      if (!Number.isFinite(budget) || budget <= 0) {
        state.error = 'Please enter a budget greater than zero.';
        state.screen = 'input';
        return notify();
      }
      if (budget > MAX_BUDGET) {
        state.error = `That budget is larger than Kain handles. Please enter ₱${MAX_BUDGET.toLocaleString('en-PH')} or less.`;
        state.screen = 'input';
        return notify();
      }
      if (!Number.isFinite(familySize) || familySize < 1) {
        state.error = 'Family size must be at least one person.';
        state.screen = 'input';
        return notify();
      }
      if (familySize > MAX_FAMILY_SIZE) {
        state.error = `That family size is larger than Kain handles. Please enter ${MAX_FAMILY_SIZE} or fewer.`;
        state.screen = 'input';
        return notify();
      }
      state.error = null;
      state.budget = Math.floor(budget);
      state.familySize = Math.floor(familySize);
      state.screen = 'calculating';
      notify();
    },

    /**
     * Run the solver and route to results or the empty state.
     *
     * @param {Array} recipes
     * @param {Array<string>} [restoredKeys]  Ticked shopping-list keys from a
     *   previous visit. Filtered against the list this solve produced, so a
     *   stale key from a plan that no longer exists is dropped rather than
     *   silently inflating the running spend.
     */
    finish(recipes, restoredKeys = []) {
      const plan = solve({
        budget: state.budget,
        familySize: state.familySize,
        recipes
      });

      if (plan.meals.length === 0) {
        state.plan = null;
        state.shoppingList = null;
        state.coverage = null;
        state.minimumBudget = minimumViableBudget(recipes, state.familySize);
        state.partial = bestPartialMeal(recipes, state.budget);
        state.capped = false;
        state.checkedKeys = new Set();
        state.spent = 0;
        state.screen = 'empty';
        return notify();
      }

      state.plan = plan;
      state.shoppingList = buildShoppingList(plan);
      state.coverage = calculateCoverage(plan);
      state.minimumBudget = null;
      state.partial = null;
      state.checkedKeys = new Set(knownKeys(state.shoppingList.items, restoredKeys));
      state.spent = sumChecked(state.shoppingList.items, state.checkedKeys);
      // True when every meal already sits at its recipe's maxPortions cap and
      // budget is left unspent — the case where a bigger budget would not have
      // changed this plan. See DEVNOTES.md "UX polish" backlog.
      state.capped =
        plan.totalCost < plan.budget &&
        plan.meals.every((meal) => meal.portions >= (meal.recipe.maxPortions ?? 1));
      state.screen = 'results';
      notify();
    },

    /**
     * Market mode: put a shopping-list line in the basket, or take it out.
     *
     * The running spend is recomputed from the list rather than accumulated,
     * so it cannot drift out of step with which rows are actually ticked.
     * Unknown keys are ignored — there is no such row to tick.
     *
     * @param {string} key  From itemKey() in shopping-list.js.
     */
    toggleChecked(key) {
      const items = state.shoppingList?.items;
      if (!items || knownKeys(items, [key]).length === 0) return;

      if (state.checkedKeys.has(key)) state.checkedKeys.delete(key);
      else state.checkedKeys.add(key);

      state.spent = sumChecked(items, state.checkedKeys);
      notify();
    },

    /** Back to the input screen for a new budget. */
    reset() {
      state.screen = 'input';
      state.error = null;
      state.plan = null;
      state.shoppingList = null;
      state.coverage = null;
      state.minimumBudget = null;
      state.capped = false;
      // A new budget means a new list; carrying ticks over would credit the
      // user for items the next plan may not even contain.
      state.checkedKeys = new Set();
      state.spent = 0;
      state.partial = null;
      notify();
    }
  };

  function notify() {
    for (const listener of listeners) listener(state);
  }

  return state;
}
