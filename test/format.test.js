import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPeso,
  formatQuantity,
  barWidth,
  formatPortions,
  coverageVerdict,
  energyGapNote,
  describePlanSpan,
  formatPriceDate,
  priceVintageLine,
  marketProgress,
  formatPlanAsText,
  describeDayPlan,
  shoppingSpanNote
} from '../js/format.js';

/**
 * Presentation formatting lives here, not in app.js, so the strings a user
 * actually reads are covered by the suite. Expected values are written by hand
 * from how a Filipino wet-market shopper would read them.
 */

test('whole pesos render without needless centavos', () => {
  assert.equal(formatPeso(280), '₱280');
  assert.equal(formatPeso(0), '₱0');
});

test('centavos are shown to exactly two places when present', () => {
  assert.equal(formatPeso(280.5), '₱280.50');
  assert.equal(formatPeso(12.25), '₱12.25');
});

test('thousands are separated so a weekly budget stays readable', () => {
  assert.equal(formatPeso(1200), '₱1,200');
  assert.equal(formatPeso(10500.75), '₱10,500.75');
});

test('quantities drop trailing zeros and keep their unit', () => {
  assert.equal(formatQuantity(60, 'g'), '60 g');
  assert.equal(formatQuantity(0.5, 'ml'), '0.5 ml');
  assert.equal(formatQuantity(1.0, 'pc'), '1 pc');
});

test('a bar can never overflow its track even when coverage exceeds the target', () => {
  // protein at budget 300 / family 4 is 103.5% -- the label says 103.5%,
  // but the bar must stop at the end of its track.
  assert.equal(barWidth(103.5), 100);
  assert.equal(barWidth(55), 55);
  assert.equal(barWidth(0), 0);
});

test('a bar never goes negative on malformed input', () => {
  assert.equal(barWidth(-10), 0);
  assert.equal(barWidth(NaN), 0);
});

test('portions are described in batches and the servings they yield', () => {
  assert.equal(formatPortions(3, 12), '3 batches · 12 servings');
  assert.equal(formatPortions(1, 4), '1 batch · 4 servings');
});

test('with a family size, portions also say what each person gets', () => {
  // "12 servings" is a figure you have to divide; "3 per person" is not.
  assert.equal(formatPortions(3, 12, 4), '3 batches · 12 servings · 3 per person');
  assert.equal(formatPortions(1, 4, 4), '1 batch · 4 servings · 1 per person');
});

test('a serving is never called a meal', () => {
  // A serving is one portion of ONE dish. A day's plan stacks several dishes,
  // so at ₱666/day for four people it is 40 servings — ten portions each, and
  // about one day of energy. "Ten meals each" would be false by roughly the
  // number of dishes in the plan.
  assert.doesNotMatch(formatPortions(3, 12, 4), /meal/);
  assert.doesNotMatch(describePlanSpan({ familySize: 4, meals: [{ servings: 40 }] }).text, /meal/);
});

test('a missing family size leaves the two-argument output untouched', () => {
  // DEVNOTES and the pitch materials quote the two-argument form verbatim.
  for (const bad of [undefined, null, 0, -2, NaN]) {
    assert.equal(formatPortions(3, 12, bad), '3 batches · 12 servings');
  }
});

/* ── plain-language verdicts (ROADMAP B2) ─────────────────────────────── */

test('coverage percentages carry a Tagalog verdict a non-expert can act on', () => {
  // The real figures from the DEVNOTES smoke test at 300 / 4.
  assert.deepEqual(coverageVerdict(59.3), { label: 'Kulang', tone: 'low' });
  assert.deepEqual(coverageVerdict(111.3), { label: 'Sapat', tone: 'ok' });
  assert.deepEqual(coverageVerdict(177.9), { label: 'Sobra', tone: 'over' });
  assert.deepEqual(coverageVerdict(85), { label: 'Halos sapat', tone: 'near' });
});

test('verdict bands meet exactly at their boundaries', () => {
  assert.equal(coverageVerdict(70).label, 'Halos sapat');
  assert.equal(coverageVerdict(69.9).label, 'Kulang');
  assert.equal(coverageVerdict(100).label, 'Sapat');
  assert.equal(coverageVerdict(99.9).label, 'Halos sapat');
  assert.equal(coverageVerdict(150).label, 'Sobra');
  assert.equal(coverageVerdict(149.9).label, 'Sapat');
});

test('a malformed percentage still produces a verdict rather than crashing a row', () => {
  assert.equal(coverageVerdict(NaN).label, 'Kulang');
  assert.equal(coverageVerdict(-5).label, 'Kulang');
});

/** The real 300 / 4 shape: strong micronutrients bought at the cost of energy. */
const A1_COVERAGE = {
  calories: { percent: 59.3, amount: 6120, target: 10320 },
  protein: { percent: 111.3 },
  iron: { percent: 139.2 },
  vitaminA: { percent: 177.9 }
};

test('a materially short energy figure is stated in cups of rice, not kilocalories', () => {
  const note = energyGapNote(A1_COVERAGE);
  assert.ok(note, 'expected a note at 59.3% energy coverage');
  assert.match(note, /kulang pa sa enerhiya/);
  assert.match(note, /mga 21 tasang kanin/); // (10320 - 6120) / 200, rounded
  assert.match(note, /kanin ang pinakamurang pandagdag/, 'name the cheapest way to close the gap');
});

test('the "strong on nutrition" framing is used only when that is actually true', () => {
  // The A1 case the note exists for: the weighting bought real protein and
  // iron, and energy paid for it.
  assert.match(energyGapNote(A1_COVERAGE), /^Malakas sa sustansya/);
});

test('a plan short on everything does not claim to be strong on nutrition', () => {
  // 40 / 4 in the real dataset: energy 11.1%, protein 8.5%, iron 10%, vit A
  // 2.1%. Telling that user their plan is nutritionally strong would be a
  // cheerful lie to precisely the person who can least afford one.
  const note = energyGapNote({
    calories: { percent: 11.1, amount: 1150, target: 10320 },
    protein: { percent: 8.5 },
    iron: { percent: 10 },
    vitaminA: { percent: 2.1 }
  });
  assert.match(note, /^Kulang pa sa enerhiya/);
  assert.doesNotMatch(note, /Malakas/);
});

test('one weak nutrient is enough to drop the "strong" framing', () => {
  const note = energyGapNote({
    calories: { percent: 35.6, amount: 2755, target: 7740 },
    protein: { percent: 76.1 }, // short
    iron: { percent: 100 },
    vitaminA: { percent: 145.7 }
  });
  assert.match(note, /^Kulang pa sa enerhiya/);
});

test('adequate energy produces no note at all, so the caller hides it', () => {
  assert.equal(energyGapNote({ calories: { percent: 90, amount: 7200, target: 8000 } }), null);
  assert.equal(energyGapNote({ calories: { percent: 104, amount: 8300, target: 8000 } }), null);
  assert.equal(energyGapNote(null), null);
  assert.equal(energyGapNote({}), null);
});

test('the note never suggests a nonsensical zero cups of rice', () => {
  const note = energyGapNote({ calories: { percent: 89.9, amount: 999, target: 1000 } });
  assert.match(note, /mga 1 tasang kanin/);
});

/* ── plan span (ROADMAP A2, presentation only) ────────────────────────── */

test('a plan is restated as servings per person', () => {
  const span = describePlanSpan({ familySize: 4, meals: [{ servings: 12 }] });
  assert.equal(span.servings, 12);
  assert.equal(span.servingsEach, 3);
  assert.equal(span.text, '12 servings · about 3 per person across 4 people');
});

test('servings are summed across every dish in the plan', () => {
  const span = describePlanSpan({ familySize: 4, meals: [{ servings: 12 }, { servings: 4 }] });
  assert.equal(span.servings, 16);
  assert.equal(span.servingsEach, 4);
});

test('the span never claims a number of days', () => {
  // Servings / 3 would print "about 2 days of food" directly above a chart
  // reading "Energy 59.3%" — the real 300/4 plan. A serving of munggo is not a
  // third of a person's daily calories, so the two would contradict each other.
  // Coverage is the honest measure of how far a plan goes, and it is already on
  // the same screen.
  const span = describePlanSpan({ familySize: 4, meals: [{ servings: 20 }] });
  assert.equal(span.text, '20 servings · about 5 per person across 4 people');
  assert.doesNotMatch(span.text, /\bdays?\b/, 'the plan data carries no day dimension to claim');
  assert.equal(span.days, undefined);
});

test('a single person is described in the singular', () => {
  assert.equal(
    describePlanSpan({ familySize: 1, meals: [{ servings: 3 }] }).text,
    '3 servings · about 3 per person across 1 person'
  );
});

test('a malformed plan degrades to zero rather than dividing by zero', () => {
  const span = describePlanSpan(null);
  assert.equal(span.servings, 0);
  assert.equal(span.servingsEach, 0);
});

/* ── price vintage (ROADMAP B4) ───────────────────────────────────────── */

test('price dates render in Tagalog without a timezone shifting the day', () => {
  // new Date('2026-08-23') is UTC midnight and renders as the 22nd west of
  // Greenwich, so the date is parsed by hand. Asserted from a UTC-negative
  // perspective by construction: the day must never move.
  assert.equal(formatPriceDate('2026-08-23'), 'Ago 23');
  assert.equal(formatPriceDate('2026-01-01'), 'Ene 1');
  assert.equal(formatPriceDate('2026-12-31'), 'Dis 31');
  assert.equal(formatPriceDate('2026-05-11'), 'May 11');
});

test('an absent or malformed price date renders nothing rather than "Invalid Date"', () => {
  for (const bad of [null, undefined, '', 'soon', '2026-8-23', '23/08/2026', '2026-13-01']) {
    assert.equal(formatPriceDate(bad), null, `expected ${bad} to be rejected`);
  }
});

test('the vintage line names the date and how much of the data is sourced', () => {
  assert.equal(
    priceVintageLine({ prices: { latest: '2026-08-30', sourced: 43, total: 46 } }),
    'Presyo noong Ago 30 · 43/46 sangkap may pinagkunan'
  );
});

test('missing metadata hides the line instead of claiming a date it does not have', () => {
  assert.equal(priceVintageLine(null), null);
  assert.equal(priceVintageLine({}), null);
  assert.equal(priceVintageLine({ prices: { latest: null, sourced: 0, total: 46 } }), null);
});

/* ── market mode (ROADMAP B1) ─────────────────────────────────────────── */

test('market progress reports spend against the list total, not the budget', () => {
  const progress = marketProgress(180, 290.4, 5, 10);
  assert.equal(progress.spentText, '₱180 of ₱290.40');
  assert.equal(progress.itemsText, '5/10 items');
  assert.equal(progress.percent, 62);
  assert.equal(progress.remaining, 110.4);
  assert.equal(progress.done, false);
});

test('an empty basket and a full one are both reported exactly', () => {
  assert.equal(marketProgress(0, 290.4, 0, 10).percent, 0);
  const full = marketProgress(290.4, 290.4, 10, 10);
  assert.equal(full.percent, 100);
  assert.equal(full.remaining, 0);
  assert.equal(full.done, true);
});

test('a single item is described in the singular', () => {
  assert.equal(marketProgress(40, 40, 1, 1).itemsText, '1/1 item');
});

test('progress never exceeds 100% or goes negative on malformed figures', () => {
  assert.equal(marketProgress(500, 290.4, 10, 10).percent, 100);
  assert.equal(marketProgress(-5, 290.4, 0, 10).percent, 0);
  assert.equal(marketProgress(50, 0, 1, 0).percent, 0);
  assert.equal(marketProgress(NaN, NaN, NaN, NaN).percent, 0);
});

/* ── sharing (ROADMAP B1) ─────────────────────────────────────────────── */

const SHARE_PLAN = {
  budget: 300,
  totalCost: 290.4,
  familySize: 4,
  meals: [
    { recipe: { name: 'Munggo with Malunggay' }, portions: 3, cost: 250.4 },
    { recipe: { name: 'Lugaw' }, portions: 1, cost: 40 }
  ]
};

const SHARE_LIST = {
  totalCost: 290.4,
  items: [
    { name: 'Monggo', quantity: 750, unit: 'g', cost: 105.06 },
    { name: 'Bawang', quantity: 60, unit: 'g', cost: 12.5 }
  ]
};

test('the shared text carries the plan, the list and the totals as plain text', () => {
  const text = formatPlanAsText(SHARE_PLAN, SHARE_LIST);
  assert.match(text, /Budget ₱300 · 4 katao/);
  assert.match(text, /- Munggo with Malunggay x3 — ₱250\.40/);
  assert.match(text, /- Lugaw x1 — ₱40/);
  assert.match(text, /- Monggo 750 g — ₱105\.06/);
  assert.match(text, /KABUUAN ₱290\.40 · ₱9\.60 natira sa budget/);
});

test('the shared text stays plain text, so it survives SMS and a screenshot', () => {
  const text = formatPlanAsText(SHARE_PLAN, SHARE_LIST);
  assert.doesNotMatch(text, /[<>]/, 'no markup — this goes into a text field');
  assert.doesNotMatch(text, /https?:/, 'no link: the recipient may have no data left');
});

test('sharing an absent plan produces text rather than throwing', () => {
  assert.doesNotThrow(() => formatPlanAsText(null, null));
});

/* ── the day dimension (ROADMAP A2) ───────────────────────────────────── */

test('a single-day plan is not dressed up in day language', () => {
  const day = describeDayPlan({ days: 1, dailySpend: 290.4, budget: 300, totalCost: 290.4, familySize: 4 });
  assert.equal(day.isMultiDay, false);
  assert.equal(day.cookText, 'Cook this today.');
});

test('a multi-day plan states money, people and time in one sentence', () => {
  const day = describeDayPlan({ days: 3, dailySpend: 652.76, budget: 2000, totalCost: 1958.28, familySize: 4 });
  assert.equal(day.isMultiDay, true);
  assert.equal(day.spanText, '₱1,958.28 feeds 4 people for 3 days');
  assert.equal(day.cookText, 'Cook this same set of dishes each day for 3 days.');
});

test('the per-day figure is what a day COSTS, so the dish cards add up to it', () => {
  // The dish cards print per-day prices. Quoting the daily BUDGET here (₱666)
  // would show a number the dishes beneath it do not sum to — the D-2/D-3
  // reconciliation confusion again. Spend x days must equal the plan total.
  const day = describeDayPlan({ days: 3, dailySpend: 652.76, budget: 2000, totalCost: 1958.28, familySize: 4 });
  assert.equal(day.perDayText, '₱652.76 a day');
  assert.equal(Math.round(652.76 * 3 * 100) / 100, 1958.28);
});

test('one person is described in the singular across the span', () => {
  const day = describeDayPlan({ days: 2, dailySpend: 95, budget: 200, totalCost: 190, familySize: 1 });
  assert.match(day.spanText, /feeds 1 person for 2 days/);
});

test('a malformed span degrades to a single day rather than dividing by zero', () => {
  for (const bad of [undefined, null, 0, -3, NaN]) {
    assert.equal(describeDayPlan({ days: bad, familySize: 4 }).days, 1);
  }
  assert.equal(describeDayPlan().days, 1);
});

test('the shopping list announces its span only when there is one to announce', () => {
  assert.equal(shoppingSpanNote(1), null, 'one day needs no note');
  assert.match(shoppingSpanNote(3), /buong 3 araw/);
  assert.match(shoppingSpanNote(3), /isang punta lang/, 'it is one trip, not three');
});

test('shared text names the span and labels the dishes as daily', () => {
  const text = formatPlanAsText(SHARE_PLAN, SHARE_LIST, { days: 3, budget: 2000, totalCost: 871.2 });
  assert.match(text, /· 3 araw/);
  assert.match(text, /MGA PUTAHE \(araw-araw\)/);
  assert.match(text, /LISTAHAN SA PALENGKE \(buong 3 araw\)/);
  assert.match(text, /₱1,128\.80 natira sa budget/); // 2000 - 871.20
});

test('shared text for a single day is unchanged from before the day dimension', () => {
  const text = formatPlanAsText(SHARE_PLAN, SHARE_LIST);
  assert.match(text, /Budget ₱300 · 4 katao\n/, 'no day suffix at one day');
  assert.match(text, /\nMGA PUTAHE\n/);
  assert.match(text, /\nLISTAHAN SA PALENGKE\n/);
});
