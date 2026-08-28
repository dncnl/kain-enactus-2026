/**
 * Screen state machine for the input -> calculating -> results flow.
 *
 * Deliberately DOM-free: js/app.js is a thin adapter that renders this state.
 * Keeping the transitions here means the flow (including the "nothing fits your
 * budget" path) is testable without a browser or jsdom.
 */
import { solve } from './solver.js';
import { buildShoppingList } from './shopping-list.js';
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

/** Cheapest single meal that feeds the whole family, in pesos. */
function minimumViableBudget(recipes, familySize) {
  const costs = recipes
    .map((r) => r.costPerServing * familySize)
    .filter((c) => c > 0);
  return costs.length ? Math.ceil(Math.min(...costs)) : 0;
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
      state.error = null;
      state.budget = Math.floor(budget);
      state.familySize = Math.floor(familySize);
      state.screen = 'calculating';
      notify();
    },

    /** Run the solver and route to results or the empty state. */
    finish(recipes) {
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
        state.screen = 'empty';
        return notify();
      }

      state.plan = plan;
      state.shoppingList = buildShoppingList(plan);
      state.coverage = calculateCoverage(plan);
      state.minimumBudget = null;
      state.screen = 'results';
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
      notify();
    }
  };

  function notify() {
    for (const listener of listeners) listener(state);
  }

  return state;
}
