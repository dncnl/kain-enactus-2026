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
| Offline / PWA | Built and deployed — offline retest on the live URL is still outstanding, see below |
| Recipe + price data | **43/46 ingredients** now real, dated prices from DA Bantay Presyo, PSA OpenSTAT, DTI SRP, and named retailers. 3 ingredients (dried fish, sitsaro, togue) are confirmed absent from every PH government price series checked (DA, PSA, BFAR) and stay mock — flagged in `data/prices.json`. See "Backend handoff notes" below. |
| Nutrition targets | Real: PDRI 2015 RNI (male 19-29y), per FDA Circular 2023-009's "general population" reference — see `js/nutrition-targets.js` |
| PWA icons | Real 192×192 / 512×512, `any` + `maskable`, generated from the logo via `scripts/generate-icons.py` |
| Deployment | **Live: https://kain-enactus.vercel.app** — HTTPS, service worker headers verified from this machine. A human still needs to do the real-device airplane-mode test, see "Deploy checklist". |

Tests: **63 passing** (`npm test`).

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

Recomputed 2026-08-30 after the real-price data swap (both passes). The figures
below will move again once the 3 still-mock ingredients (dried fish, sitsaro,
togue — see Status table) get real prices.

| Input | Expected |
|---|---|
| 300 / 4 | ₱290.40 spent, ₱9.60 left, *Munggo with Malunggay ×3* + *Ginisang Monggo ×1* + *Lugaw ×1*, 10 list items = ₱290.40 |
| | Energy 59.3% · Protein 111.3% · Iron 139.2% · Vitamin A 177.9% |
| 150 / 3 | ₱146.61, *Munggo with Malunggay ×3* — **capped note should show** (all 3 batches used, ₱3.39 left unspent) |
| 1000 / 5 | ₱991.25, six dishes (*Sardinas with Kangkong ×3*, *Ginisang Monggo ×3*, *Munggo with Malunggay ×3*, *Ginisang Sayote with Egg ×1*, *Lugaw ×2*, *Ginisang Togue ×1*), 17 items |
| 40 / 4 | ₱29.24 spent, *Lugaw ×1* — no longer empty at this budget now that rice is real-priced and cheaper than the old mock |
| 20 / 4 | Empty screen, suggests ₱30 |
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
- [x] ~~`aria-live="polite"` sits on the whole `<main>`~~ — removed. `app.js`
      `moveFocus()` now focuses the validation alert or the newly-shown screen's
      `<section tabindex="-1">` on transition instead of re-announcing everything.
- [x] ~~No focus management when screens change~~ — see `moveFocus()` above.
- [x] ~~`<html lang="en">` but most UI copy is Tagalog~~ — `lang="tl"` added to
      each Tagalog element individually (headings, buttons, `#app-error`); the
      page stays `lang="en"` since the field labels and descriptions are English.

### UX polish
- [ ] `window.scrollTo({ behavior: 'smooth' })` fires on *every* state change,
      including validation errors where the page has not moved.
- [ ] Family-size stepper has no upper clamp, and typing directly into the field
      bypasses the `min` entirely.
- [x] ~~Beyond a certain budget `maxPortions` caps the plan, so more money
      changes nothing~~ — `app-state.js` now computes `state.capped` (every meal
      at its `maxPortions`, budget left over) and the results screen shows a note
      when it's true. See `test/app-state.test.js`.
- [ ] The solver often picks one dish ×3 at realistic budgets — nutritionally
      optimal, monotonous to eat. Variety would require a solver change, which
      is out of scope without an explicit decision.

### Platform
- [ ] Tailwind CDN applies styles after JS runs — flash of unstyled content on
      slow phones. A build step would fix it but removes the no-bundler property.
- [x] ~~Real 192×192 and 512×512 maskable PWA icons~~ — generated by
      `scripts/generate-icons.py` from `assets/kain-logo.png`, wired into
      `manifest.webmanifest` (both `any` and `maskable` purposes) and precached
      in `sw.js`.
- [ ] `sw.js` precaches both `'./'` and `'index.html'` — two cache entries for
      one document.
- [ ] Offline behaviour has been verified from this machine (live URL serves
      the app shell, correct headers, service worker registers) but **not** on a
      real device in true airplane mode — see Deploy checklist.

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
currently `kain-v4`). Bump it in the same commit as any data change. This is the
single easiest thing here to get wrong, because it works perfectly on your
machine and fails only for returning users.

### 3. Filling in real prices — 43/46 done, 3 still need a market visit

Each entry carries provenance fields:

```jsonc
{
  "name": "Ampalaya",
  "unit": "g",
  "pricePerUnit": 0.1705,
  "source": "DA Bantay Presyo Monitoring, Weekly Average Retail Price of Selected Agri-Fishery Commodities in NCR Markets",
  "market": "DA Bantay Presyo NCR retail price bulletin (public markets across Metro Manila) — not Pampanga-specific",
  "pricedOn": "2026-08-23"
}
```

Fill `source`, `market` and `pricedOn` as you replace each mock price. Judges are
likely to ask where a number came from, and "we can point at the stall and the
date" is a much better answer than a spreadsheet nobody can trace.

**As of 2026-08-30, 43 of 46 ingredients carry real, dated prices** from DA
Bantay Presyo bulletins (fresh produce/meat/fish), PSA OpenSTAT (its public
PX-Web API, not the HTML site — the front-end 403s automated fetches but the
underlying data API doesn't), the DTI SRP bulletin, and named PH supermarket/
retailer listings (see each entry's `source`). Caveats worth knowing before
citing these to judges:

- **Every DA-sourced price is NCR, not Pampanga.** DA's Region III bulletin
  ("Bantay Presyo ng Gitnang Luzon") is only published as Facebook photos and
  scanned/image-only PDFs, and DA-RFO3's own site (rfo3.da.gov.ph) has no
  text-based price data either — checked twice. If a Pampanga-specific number
  matters more than a dated NCR/national figure, that means an actual visit to
  an Angeles City market, camera in hand.
- **3 ingredients stay mock**, confirmed genuinely untracked by DA, PSA
  (checked all 11 commodity tables), and the BFAR fisheries price report —
  **dried fish (tuyo)**, **sitsaro**, **togue**. Their `source` field
  documents exactly what was checked. These are the last real gap; either find
  a source or price them at an actual stall.
- **Saging saba** is a computed figure, not a direct market price: DA's
  ₱64.00/kg (NCR, 2026-08-23) × a DOST-FNRI Food Exchange List standard piece
  weight (70g). The weight was seen via secondary reproductions of the FNRI
  document, not the primary PDF (which is login-gated) — solid enough to use,
  but worth a footnote if asked directly.
- **Ground pork** and generic **Pork** share one derived price (₱0.3532/g) —
  DA doesn't track ground pork/giniling separately, so it's a disclosed proxy
  (the DA average of Kasim and Liempo, the cuts usually ground to order).
- **Shrimp paste** was re-sourced from WalterMart's official site (Puregold's
  entire product catalog went offline mid-research, so that source could no
  longer be verified and was replaced, not kept).

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
   for service worker registration). **Already live** at
   https://kain-enactus.vercel.app — redeploy (`vercel --prod`, or push to the
   branch Vercel tracks) to pick up anything committed since.
4. **Retest offline on the live URL**, not `localhost`: load once, go offline,
   hard-reload, run the full flow. Service worker behaviour on first load
   differs between `localhost` and a real origin. **Still outstanding** — only
   verified from this machine that the deploy serves correctly over HTTPS with
   the right headers; nobody has actually gone offline against it yet.
5. Test on an actual mid-range Android phone, not just a desktop viewport.
   **Still outstanding.**
6. Tag the handoff commit (e.g. `frontend-v1-handoff`) so Developer 2 has a
   known-good baseline to diff against.

## Regenerating PWA icons

`scripts/generate-icons.py` (needs Pillow: `pip install pillow`) rebuilds all
four icon files from `assets/kain-logo.png` — run it again if the logo changes:

```bash
python scripts/generate-icons.py
```

Produces `assets/icon-{192,512}.png` (`any` purpose, transparent background) and
`assets/icon-{192,512}-maskable.png` (`maskable` purpose, opaque cream
background, logo kept inside the safe zone). After regenerating, bump
`CACHE_NAME` in `sw.js` — the icon paths themselves don't change, but their
bytes do, and `sw.js` serves cache-first.
