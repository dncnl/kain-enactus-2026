# Kain — Development Notes

Working notes for the Kain frontend. Tracks what is done, what is deliberately
not done, and what the next developer needs to know before touching anything.

**Project:** Kain — price-optimized nutrition engine for Filipino families.
Enactus Philippines 2026, Early-Stage Project Track, Angeles University Foundation.

| | |
|---|---|
| Application deadline | **31 Aug 2026** |
| National Competition | 9–10 Oct 2026, De La Salle University, Manila |
| Frontend / UI | Daniel Canlapan |
| Logic / data / backend | Developer 2 — *handoff pending* |
| Pitch / business | Developer 3 |

---

## Status

| Area | State |
|---|---|
| Solver (bounded knapsack DP) | Built, tested, **treat as stable** |
| Nutrition coverage | Built, tested |
| Shopping list | Built, tested |
| Screen state machine | Built, tested |
| UI shell (4 screens) | Built |
| Offline / PWA | Built — needs testing on the live HTTPS origin |
| Recipe + price data | **Mock, 18 recipes.** Real FNRI/DA sourcing outstanding |
| PWA icons | Placeholder — 192/512 maskable icons outstanding |
| Deployment | Not deployed |

Tests: **48 passing** (`npm test`).

---

## Run and test

```bash
npm test          # node --test, no dependencies
npm run serve     # python -m http.server 8000
npm run build:data  # regenerate data/recipes.json from its sources
```

The app has no build step and no `node_modules`. This is deliberate: it must
stay a set of static files that a service worker can cache wholesale.
`build:data` is a data pipeline, not an app build — its output is committed and
deployment is unaffected.

### Manual smoke test

| Input | Expected |
|---|---|
| 300 / 4 | ₱260.28 spent, ₱39.72 left, *Munggo with Malunggay ×3*, 6 list items = ₱260.28 |
| | Energy 45% · Protein 94.7% · Iron 100% · Vitamin A 204% |
| 150 / 3 | ₱130.14, *Munggo with Malunggay ×2*, 6 items = ₱130.14 |
| 1000 / 5 | ₱983.40, four dishes, 12 items |
| 40 / 4 | Empty screen, suggests ₱62 |
| 100001 / 4 | Validation error, stays on input |
| 0 / 4 | Validation error, stays on input |

The plan total and the shopping-list **Kabuuan must always be identical**. They
are computed by different rounding paths, so a mismatch there is a real bug.

---

## Architecture rules

**1. The solver graph makes zero network calls.** `js/solver.js` and everything
it imports must stay pure. The Innovation and Scale claims in the submitted
application depend on this. Enforced by `test/offline-shell.test.js`, which
scans the dependency graph for `fetch` / `XMLHttpRequest` / `navigator.onLine`.

**2. Logic lives outside `js/app.js`.** `app.js` is a thin DOM writer with no
testable decisions in it — transitions belong in `app-state.js`, arithmetic in
`solver.js` / `nutrition.js` / `shopping-list.js`, and user-visible strings in
`format.js`. If you are writing an `if` about what a plan *means* inside
`app.js`, it is in the wrong file.

**3. Everything reachable at runtime must be precached.** `test/offline-shell.test.js`
walks the import graph from `js/app.js` and fails if a module is not listed in
`PRECACHE_URLS` in `sw.js`. Add a file, add it to the list.

**4. `data/recipes.json` is generated. Never edit it by hand.** See the data
pipeline below. `test/data-build.test.js` fails if the committed file stops
matching its sources.

---

## Data pipeline

```
data/prices.json          one price per ingredient + unit, with provenance
data/recipes.source.json  recipes: quantities only, no costs
          |
          |  npm run build:data   (scripts/build-data.mjs)
          v
data/recipes.json         GENERATED — the shape the solver reads
```

**To change a price:** edit `data/prices.json`, run `npm run build:data`, bump
`CACHE_NAME` in `sw.js`, commit all three. One line changes one price
everywhere it is used.

**To add or change a recipe:** edit `data/recipes.source.json` (quantities only —
costs are derived), then the same three steps.

The generator validates before it writes and refuses to produce bad data:
missing price entries, non-positive prices or quantities, duplicate ids, and
nutrition values beyond plausible per-serving ceilings (which catches a
misplaced decimal such as `iron: 350` for `3.5`). It reports every problem at
once rather than one per run.

### Why this exists

Prices used to live directly in each recipe — 113 hand-maintained rows — and the
invariant `sum(ingredients.cost) === costPerServing × servings` had to be
satisfied manually. People back-filled costs until the sum worked, so the same
ingredient drifted to different prices in different recipes: cooking oil varied
by 36%, garlic by 33%, across 15 of 23 shared ingredients. Since
`buildShoppingList()` merges ingredients across recipes, a merged line showed a
blended price matching no actual stall — directly undercutting the "real local
wet-market prices" claim. Deriving costs from a single price table makes that
class of drift impossible, and `test/data-build.test.js` asserts it stays so.

### Costs are decimal now

`costPerServing` is derived, so it is rarely a whole peso (`lugaw` is ₱15.33).
That is intended. The generator uses largest-remainder allocation — settling the
rounding residual on the largest ingredient line — so the reconciliation
invariant holds exactly.

---

## Fixed in this pass

| # | Bug | Root cause |
|---|---|---|
| P0-1 | Nutrition chart expanded forever and froze the page | `maintainAspectRatio: false` sizes the canvas to its parent; the parent was `height: auto`, so canvas and container grew off each other. Now wrapped in `.relative.h-56`. |
| P0-2 | Large budget crashed the tab | Budget input had no `max`. `solver.js` allocates ~36 bytes per peso, so ₱1B asked for 33.5 GB. Capped at ₱100,000 in `app-state.js` (`MAX_BUDGET`) and in the markup. |
| P1-3 | Submitting before recipes loaded said *"Try at least ₱0"* | `solve()` ran against an empty array and the empty plan was reported as "nothing fits your budget" — a wrong answer, not a visible failure. Submit now ships `disabled`. |
| P1-4 | "Recipe data failed to load" vanished on next interaction | `render()` rewrites `#form-error` on every state change. Fatal errors moved to their own `#app-error`. |
| P1-5 | Blank chart panel when offline without Chart.js cached | The fixed-height container stayed visible with nothing in it. Now hidden; the coverage list still shows every number. |
| D-1 | Same ingredient priced differently across recipes (up to 36%) | Prices were denormalized across 113 rows. Now derived from `data/prices.json` — see the data pipeline above. |
| D-2 | Shopping-list total disagreed with the plan total by a centavo | `solve()` rounds `costPerServing × familySize × portions`; `buildShoppingList()` rounded each line and summed. Invisible with whole-peso mock data, guaranteed with derived decimals. The list now settles the residual on its largest line. |
| D-3 | Reconciliation test compared a raw float sum to a rounded product | `0.1 + 0.2 !== 0.3`, so decimal costs reported mismatches that did not exist in pesos. Both sides now round to centavos. |
| D-4 | Nutrition targets lived inside the "never touch" solver | `DAILY_TARGETS_PER_PERSON` moved to `js/nutrition-targets.js`, re-exported by `solver.js`. |

Regression tests: `test/index-structure.test.js` (markup invariants),
`test/data-build.test.js` (pipeline and price consistency), the `MAX_BUDGET`
cases in `test/app-state.test.js`, and the `DECIMAL_RECIPES` fixture in
`test/shopping-list.test.js`.

---

## Tracked backlog

Known, deliberately unfixed. Roughly in priority order.

### Accessibility
- [ ] `aria-live="polite"` sits on the whole `<main>` (`index.html`), so every
      screen change re-announces the entire results screen. Should be a targeted
      live region plus focus management on transition.
- [ ] No focus management when screens change — focus stays on the pressed
      button while the visible content is replaced.
- [ ] `<html lang="en">` but most UI copy is Tagalog. Needs `lang="tl"` on the
      Tagalog strings, or a documented decision to set `lang="tl"` globally.

### UX polish
- [ ] `window.scrollTo({ behavior: 'smooth' })` fires on *every* state change,
      including validation errors where the page has not moved.
- [ ] Family-size stepper has no upper clamp, and typing directly into the field
      bypasses the `min` entirely.
- [ ] Beyond a certain budget `maxPortions` caps the plan, so more money changes
      nothing. Worth saying so instead of silently returning the same plan.
- [ ] The solver often picks one dish ×3 at realistic budgets — nutritionally
      optimal, monotonous to eat. Variety would require a solver change, which
      is out of scope without an explicit decision.

### Platform
- [ ] Tailwind CDN applies styles after JS runs — flash of unstyled content on
      slow phones. A build step would fix it but removes the no-bundler property.
- [ ] Real 192×192 and 512×512 maskable PWA icons; `manifest.webmanifest`
      currently points at `assets/kain-logo.png` with `"sizes": "any"`.
- [ ] `sw.js` precaches both `'./'` and `'index.html'` — two cache entries for
      one document.
- [ ] Offline behaviour has not been verified on a real HTTPS origin, only on
      `localhost`, where service workers are always trusted.

---

## Backend handoff notes

Start here. `npm test` and `npm run build:data` between every change — the suite
is the contract, and it runs in about a second.

### 1. The three files you own

| File | What it is |
|---|---|
| `data/prices.json` | One price per ingredient + unit. **Real DA e-Presyo data goes here.** |
| `data/recipes.source.json` | Recipes: quantities, servings, nutrition. No costs. |
| `js/nutrition-targets.js` | FNRI RENI daily targets per person. |

Everything else is generated or is frontend code. You should not need to touch
`solver.js`, `nutrition.js`, `shopping-list.js` or anything in `js/` besides
`nutrition-targets.js`.

### 2. `data/recipes.json` is served cache-first

`sw.js` serves cached responses before the network. **New data will not reach
anyone who has already opened the app until `CACHE_NAME` is bumped** (`sw.js`,
currently `kain-v2`). Bump it in the same commit as any data change. This is the
single easiest thing here to get wrong, because it works perfectly on your
machine and fails only for returning users.

### 3. Filling in real prices

Each entry carries provenance fields that are currently null:

```jsonc
{
  "name": "Garlic",
  "unit": "g",
  "pricePerUnit": 0.35,
  "source": "mock (median of prior hand-entered values)",
  "market": null,        // e.g. "Angeles City Public Market"
  "pricedOn": null       // e.g. "2026-09-14"
}
```

Fill `source`, `market` and `pricedOn` as you replace each mock price. Judges are
likely to ask where a number came from, and "we can point at the stall and the
date" is a much better answer than a spreadsheet nobody can trace.

**Units are never converted.** Ingredients merge across recipes only when *both*
name and unit match, so `g` and `kg` entries for the same item stay separate
lines on the shopping list. Pick one unit per ingredient and keep it.

### 4. The generated shape

For reference — this is what the solver reads, and what the generator produces:

```jsonc
{
  "id": "unique-string",
  "name": "Display Name",
  "servings": 4,              // servings one batch yields
  "costPerServing": 22.38,    // pesos, DERIVED from prices.json
  "maxPortions": 3,           // batches/day cap; bounds the DP
  "nutritionPerServing": { "calories": 0, "protein": 0, "iron": 0, "vitaminA": 0 },
  "ingredients": [
    { "name": "Monggo", "quantity": 250, "unit": "g", "cost": 35.02 }  // cost DERIVED
  ]
}
```

`sum(ingredients[].cost)` must equal `costPerServing × servings`. You no longer
maintain this by hand — the generator guarantees it — but if you ever see the
results screen show a shopping-list total that differs from the plan total, this
invariant has broken and that is the place to look.

### 5. Changing `maxPortions` changes the answers

It caps how many batches of one dish a plan may contain. It is what stops the
optimizer from recommending the same cheap dish twenty times. Real data should
set it thoughtfully per recipe rather than copying the mock values.

### Changing the shape

Do not change the recipe object shape without agreeing it first. `solver.js`,
`nutrition.js`, `shopping-list.js`, `scripts/build-data.mjs` and the data tests
all read it directly.

### Two tests that will fail on purpose

- **`test/data-build.test.js`** fails if `data/recipes.json` stops matching its
  sources. The fix is always `npm run build:data`, never editing the generated
  file.
- **Plausibility ceilings** in the generator (calories ≤ 2000, protein ≤ 200 g,
  iron ≤ 50 mg, vitamin A ≤ 5000 mcg per serving) will reject a real food if the
  ceiling is genuinely too low. Widen the constant in `scripts/build-data.mjs`
  and say why in the commit — do not remove the check, it exists to catch
  misplaced decimals.

---

## Deploy checklist

1. `npm test` clean.
2. Bump `CACHE_NAME` in `sw.js` if any cached file changed.
3. Deploy to Vercel (static, no config needed — HTTPS is automatic and required
   for service worker registration).
4. **Retest offline on the live URL**, not `localhost`: load once, go offline,
   hard-reload, run the full flow. Service worker behaviour on first load
   differs between `localhost` and a real origin.
5. Test on an actual mid-range Android phone, not just a desktop viewport.
6. Tag the handoff commit (e.g. `frontend-v1-handoff`) so Developer 2 has a
   known-good baseline to diff against.
