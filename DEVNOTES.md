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
```

There is no build step and no `node_modules`. This is deliberate: the app must
stay a set of static files that a service worker can cache wholesale.

### Manual smoke test

| Input | Expected |
|---|---|
| 300 / 4 | ₱252 spent, ₱48 left, *Munggo with Malunggay ×3*, 6 list items = ₱252 |
| | Energy 45% · Protein 94.7% · Iron 100% · Vitamin A 204% |
| 1000 / 5 | ₱990, three dishes |
| 40 / 4 | Empty screen, suggests ₱60 |
| 100001 / 4 | Validation error, stays on input |
| 0 / 4 | Validation error, stays on input |

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

---

## Fixed in this pass

| # | Bug | Root cause |
|---|---|---|
| P0-1 | Nutrition chart expanded forever and froze the page | `maintainAspectRatio: false` sizes the canvas to its parent; the parent was `height: auto`, so canvas and container grew off each other. Now wrapped in `.relative.h-56`. |
| P0-2 | Large budget crashed the tab | Budget input had no `max`. `solver.js` allocates ~36 bytes per peso, so ₱1B asked for 33.5 GB. Capped at ₱100,000 in `app-state.js` (`MAX_BUDGET`) and in the markup. |
| P1-3 | Submitting before recipes loaded said *"Try at least ₱0"* | `solve()` ran against an empty array and the empty plan was reported as "nothing fits your budget" — a wrong answer, not a visible failure. Submit now ships `disabled`. |
| P1-4 | "Recipe data failed to load" vanished on next interaction | `render()` rewrites `#form-error` on every state change. Fatal errors moved to their own `#app-error`. |
| P1-5 | Blank chart panel when offline without Chart.js cached | The fixed-height container stayed visible with nothing in it. Now hidden; the coverage list still shows every number. |

Regression tests: `test/index-structure.test.js` (markup invariants) and the
`MAX_BUDGET` cases in `test/app-state.test.js`.

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

Three things that will bite, in order of likelihood.

### 1. `data/recipes.json` is served cache-first

`sw.js` serves cached responses before the network. **New recipe data will not
reach anyone who has already opened the app until `CACHE_NAME` is bumped**
(`sw.js`, currently `kain-v1`). Bump it in the same commit as any data change.

### 2. `test/recipes-data.test.js` asserts exactly 18 recipes

```js
assert.equal(recipes.length, 18);
```

Real data will fail this. That is intentional — it forces the count change to be
deliberate. Update the number; do not delete the assertion. The rest of that
file is the actual data contract and should keep passing untouched.

### 3. The data contract

Every recipe needs:

```jsonc
{
  "id": "unique-string",
  "name": "Display Name",
  "servings": 4,              // servings one batch yields
  "costPerServing": 22,       // pesos
  "maxPortions": 3,           // batches/day cap; bounds the DP
  "nutritionPerServing": { "calories": 0, "protein": 0, "iron": 0, "vitaminA": 0 },
  "ingredients": [
    { "name": "Monggo", "quantity": 250, "unit": "g", "cost": 35 }
  ]
}
```

**Ingredient costs must reconcile:** `sum(ingredients[].cost)` must equal
`costPerServing × servings`. If they drift, the shopping-list total stops
matching the plan total and the results screen contradicts itself. This is
asserted per-recipe by `test/recipes-data.test.js`.

Units are never converted — ingredients merge across recipes only when *both*
name and unit match, so `g` and `kg` entries for the same item stay separate
lines. Keep units consistent per ingredient across the dataset.

Nutrient targets live in `DAILY_TARGETS_PER_PERSON` (`js/solver.js`) and are
currently placeholders. They should be replaced with real FNRI RENI figures,
ideally age/sex-disaggregated — that change *is* a solver change, so flag it.

### Changing the shape

Do not change the recipe object shape without agreeing it first. `solver.js`,
`nutrition.js`, `shopping-list.js` and the data tests all read it directly.

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
