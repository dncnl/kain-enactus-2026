/**
 * Daily nutritional needs, per person per day.
 *
 * ── OWNED BY THE DATA/BACKEND DEVELOPER ──────────────────────────────────────
 * This is the one nutrition file you are meant to edit. It holds data only: no
 * logic, no imports, nothing else lives here. Change the numbers, run
 * `npm test`, done.
 *
 * SOURCED from the Philippine Dietary Reference Intakes (PDRI 2015, revised
 * Sept 2018), DOST-FNRI, Recommended Nutrient Intakes (RNI) table, adult male
 * 19-29y: https://www.fnri.dost.gov.ph/images/images/news/PDRI-2018.pdf
 *
 * WHY MALE 19-29Y, AND NOT AGE/SEX-DISAGGREGATED: the app asks for family size
 * only, not each member's age or sex, and produces one plan for the whole
 * household — so it needs one reference figure, not a table. FDA Circular
 * No. 2023-009 ("Adoption of 2015 PDRI %REI/RNI as the New Dietary Standard of
 * All Prepackaged Processed Food"), Sec. VI.C-E, designates exactly this figure
 * — RNI for male, 19-29 years old — as the reference for "general population"
 * nutrition computations. It is the closest thing DOST/FDA publish to the US
 * FDA's generic "2,000 kcal" label reference, so it is used the same way here.
 *
 * KNOWN LIMITATION, left as a stated methodology gap rather than a silent one:
 * FNRI's own RNI for iron is 28mg for women 19-49y (menstrual losses) versus
 * 12mg for men — 2.3x higher. A single household-wide iron target will
 * systematically overstate iron adequacy for a family with a woman of
 * reproductive age in it. Fixing this needs an age/sex breakdown in the input
 * form, which is a product decision, not a data change — flag it in the pitch.
 *
 * Keep the same four keys — solver.js scores recipes against them and
 * nutrition.js reports coverage against them, so a renamed or missing key
 * silently zeroes that nutrient rather than erroring.
 *
 * WHY THIS IS A .js FILE AND NOT .json: solver.js imports it, and solver.js is
 * required to make zero network calls. Loading this as JSON would mean a fetch()
 * inside the solver's dependency graph, breaking that guarantee and failing
 * test/offline-shell.test.js. Keep it a module.
 */
export const DAILY_TARGETS_PER_PERSON = {
  calories: 2530, // kcal — PDRI 2015 RNI, male 19-29y
  protein: 71,    // g   — PDRI 2015 RNI, male 19-29y (57 was the EAR, not the RNI)
  iron: 12,       // mg  — PDRI 2015 RNI, male 19-29y (see iron limitation note above)
  vitaminA: 700   // mcg RE — PDRI 2015 RNI, male 19-29y
};
