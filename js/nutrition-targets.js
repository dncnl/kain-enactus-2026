/**
 * Daily nutritional needs, per person per day.
 *
 * ── OWNED BY THE DATA/BACKEND DEVELOPER ──────────────────────────────────────
 * This is the one nutrition file you are meant to edit. It holds data only: no
 * logic, no imports, nothing else lives here. Change the numbers, run
 * `npm test`, done.
 *
 * MOCK VALUES. Replace with real FNRI RENI figures, ideally age/sex-
 * disaggregated. Keep the same four keys — solver.js scores recipes against
 * them and nutrition.js reports coverage against them, so a renamed or missing
 * key silently zeroes that nutrient rather than erroring.
 *
 * WHY THIS IS A .js FILE AND NOT .json: solver.js imports it, and solver.js is
 * required to make zero network calls. Loading this as JSON would mean a fetch()
 * inside the solver's dependency graph, breaking that guarantee and failing
 * test/offline-shell.test.js. Keep it a module.
 */
export const DAILY_TARGETS_PER_PERSON = {
  calories: 2000, // kcal
  protein: 57,    // g
  iron: 12,       // mg
  vitaminA: 500   // mcg RE
};
