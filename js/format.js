/**
 * Display formatting for the Kain UI.
 *
 * Lives outside js/app.js on purpose: app.js is a thin DOM writer with no
 * logic worth testing, so every string a user actually reads is produced here
 * where the node test suite can cover it. Pure — no DOM, no network.
 */

/** Pesos, with centavos only when they exist. `1200` -> `₱1,200`. */
export function formatPeso(value) {
  const amount = Number.isFinite(value) ? value : 0;
  const hasCentavos = Math.round(amount * 100) % 100 !== 0;
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: hasCentavos ? 2 : 0,
    maximumFractionDigits: 2
  })}`;
}

/** `60, 'g'` -> `60 g`. Trailing zeros dropped; the unit is never converted. */
export function formatQuantity(quantity, unit) {
  const amount = Number.isFinite(quantity) ? quantity : 0;
  return `${Number(amount.toFixed(2))} ${unit}`;
}

/**
 * Width of a coverage bar, clamped to its track. The *label* still shows the
 * true figure (protein can legitimately read 103.5%); only the bar is capped,
 * so an over-target nutrient never paints outside its container.
 */
export function barWidth(percent) {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

/**
 * `3, 12` -> `3 batches · 12 servings`.
 *
 * Given a family size it also says what that means per person: `12 servings`
 * is a number you have to do arithmetic on, `3 meals each` is not. The third
 * argument is optional so the two-argument form — quoted in DEVNOTES and the
 * pitch materials — keeps its exact output.
 */
export function formatPortions(portions, servings, familySize) {
  const batch = portions === 1 ? 'batch' : 'batches';
  const base = `${portions} ${batch} · ${servings} servings`;
  if (!Number.isFinite(familySize) || familySize < 1) return base;
  // "per person", never "meals". A serving is one portion of ONE dish, and a
  // day's plan stacks several dishes: at ₱666/day for four people the plan is
  // 40 servings, which is ten portions each and about one day of energy — not
  // ten meals. Calling a serving a meal overstates it by roughly the number of
  // dishes in the plan.
  const each = round1(servings / familySize);
  return `${base} · ${each} per person`;
}

/* ── the day dimension (ROADMAP A2) ───────────────────────────────────── */

/**
 * How the plan is framed once a budget covers more than one day.
 *
 * The solver is always asked for ONE day, at budget/days. That is not a
 * workaround, it is what the data supports: DAILY_TARGETS_PER_PERSON is a
 * daily figure and maxPortions caps batches per day, so a single solve of a
 * week's money describes one impossible day of eating — the ten-dish plan at
 * ₱2,000. Solving one day and repeating it keeps every number meaning what it
 * says, and needs no change to the solver or the recipe contract.
 *
 * @returns {{days:number, isMultiDay:boolean, perDayText:string, spanText:string, cookText:string}}
 */
export function describeDayPlan({ days, dailySpend, budget, totalCost, familySize } = {}) {
  const dayCount = Number.isFinite(days) && days >= 1 ? Math.floor(days) : 1;
  const people = Number.isFinite(familySize) && familySize >= 1 ? Math.floor(familySize) : 1;
  const dayWord = dayCount === 1 ? 'day' : 'days';

  return {
    days: dayCount,
    isMultiDay: dayCount > 1,
    /**
     * What one day actually COSTS, not what it was allowed to cost. The dish
     * cards below print per-day prices, so quoting the daily budget here would
     * put a figure on screen that the dishes beneath it do not add up to —
     * the same reconciliation confusion as bugs D-2 and D-3. Spend x days is
     * the plan total exactly.
     */
    perDayText: `${formatPeso(dailySpend ?? totalCost ?? budget)} a day`,
    /** The headline framing: money -> people -> time. */
    spanText:
      `${formatPeso(totalCost)} feeds ${people} ${people === 1 ? 'person' : 'people'} ` +
      `for ${dayCount} ${dayWord}`,
    /** What to actually do with it. */
    cookText:
      dayCount === 1
        ? 'Cook this today.'
        : `Cook this same set of dishes each day for ${dayCount} ${dayWord}.`
  };
}

/**
 * The shopping list covers every day at once — one trip, not one per day.
 * Null at a single day, where saying so would be noise.
 */
export function shoppingSpanNote(days) {
  const dayCount = Number.isFinite(days) && days >= 1 ? Math.floor(days) : 1;
  if (dayCount === 1) return null;
  return `Para sa buong ${dayCount} araw — isang punta lang sa palengke.`;
}

/* ── plain language (ROADMAP B2) ──────────────────────────────────────── */

/**
 * Rough kcal in one cup of cooked rice, used to state an energy shortfall as
 * something buyable rather than as kilocalories. Deliberately a round number:
 * it is a communication device, not a nutrition figure, and nothing derived
 * from it feeds back into the solver or the coverage percentages.
 */
const KCAL_PER_CUP_RICE = 200;

/**
 * Coverage bands, highest first. The percentage stays on screen either way —
 * the word is what carries meaning for a user who has never met the letters
 * "RENI". Tones map onto the colours the chart already uses (see drawChart).
 */
const VERDICT_BANDS = [
  { min: 150, label: 'Sobra', tone: 'over' },
  { min: 100, label: 'Sapat', tone: 'ok' },
  { min: 70, label: 'Halos sapat', tone: 'near' },
  { min: 0, label: 'Kulang', tone: 'low' }
];

/** `59.3` -> `{ label: 'Kulang', tone: 'low' }`. */
export function coverageVerdict(percent) {
  const value = Number.isFinite(percent) ? Math.max(0, percent) : 0;
  const band = VERDICT_BANDS.find((b) => value >= b.min) ?? VERDICT_BANDS[VERDICT_BANDS.length - 1];
  return { label: band.label, tone: band.tone };
}

/**
 * The A1 decision in one sentence. The solver weights protein and iron above
 * calories on purpose, so realistic budgets land well short on energy. Rather
 * than change solver.js — pinned as stable, and every figure quoted anywhere
 * depends on it — say the shortfall plainly and name the cheapest way to close
 * it. A family that follows a nutritionally elegant plan and is still hungry
 * stops using the app; one that is told "add rice" does not.
 *
 * Returns null when energy is adequately covered, so the caller hides the note.
 */
export function energyGapNote(coverage) {
  const energy = coverage?.calories;
  if (!energy || !Number.isFinite(energy.percent) || energy.percent >= 90) return null;

  const shortfall = Math.max(0, (energy.target ?? 0) - (energy.amount ?? 0));
  if (shortfall <= 0) return null;
  const cups = Math.max(1, Math.round(shortfall / KCAL_PER_CUP_RICE));

  // The "strong on nutrition, short on energy" framing is only honest when the
  // plan actually IS strong elsewhere — the A1 case, where the weighting has
  // bought real protein and iron at the cost of calories. At a budget too small
  // for anything, every nutrient is short and claiming otherwise would be a
  // cheerful lie to the user who can least afford one.
  const lead = OTHER_NUTRIENTS.every((key) => (coverage?.[key]?.percent ?? 0) >= 100)
    ? 'Malakas sa sustansya ang planong ito pero kulang pa sa enerhiya'
    : 'Kulang pa sa enerhiya ang planong ito';

  return (
    `${lead} — mga ${cups} tasang kanin pa ang kailangan ng buong pamilya ` +
    `para sa isang araw. Kung may matitirang budget, kanin ang pinakamurang pandagdag.`
  );
}

/** Everything tracked except energy — see the lead-clause choice above. */
const OTHER_NUTRIENTS = ['protein', 'iron', 'vitaminA'];

/**
 * What a plan means per person: `20 servings` is a figure you have to divide,
 * `5 meals each` is not. Derived entirely from what the plan already carries —
 * servings and family size — so no number on screen stops being one the solver
 * produced (ROADMAP A2: presentation only, no data-contract change).
 *
 * DELIBERATELY NOT A SPAN OF DAYS. Servings-divided-by-three-meals would put
 * "about 2 days of food" directly above a chart reading "Energy 59.3%", and
 * those two statements contradict each other: a serving of munggo is a serving,
 * not a day's third of a person's calories. Coverage is the honest measure of
 * how far a plan goes, and it is already on the same screen. If a day dimension
 * is ever wanted for real, it needs the recipe/plan data contract to carry one
 * — which per the project's own rule requires both developers to agree first.
 */
export function describePlanSpan(plan) {
  const familySize = Number.isFinite(plan?.familySize) && plan.familySize >= 1 ? plan.familySize : 1;
  const servings = (plan?.meals ?? []).reduce(
    (total, meal) => total + (Number.isFinite(meal?.servings) ? meal.servings : 0),
    0
  );
  const servingsEach = round1(servings / familySize);
  const people = familySize === 1 ? 'person' : 'people';

  return {
    servings,
    servingsEach,
    text:
      `${servings} servings · about ${servingsEach} per person ` +
      `across ${familySize} ${people}`
  };
}

/* ── price vintage (ROADMAP B4) ───────────────────────────────────────── */

/** Tagalog month abbreviations, January first. */
const MONTHS_TL = ['Ene', 'Peb', 'Mar', 'Abr', 'May', 'Hun', 'Hul', 'Ago', 'Set', 'Okt', 'Nob', 'Dis'];

/**
 * `'2026-08-23'` -> `'Ago 23'`. Parsed by hand rather than through Date:
 * `new Date('2026-08-23')` is UTC midnight, which renders as the 22nd for
 * anyone west of Greenwich and as the 23rd in Manila only by luck.
 */
export function formatPriceDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!match) return null;
  const month = MONTHS_TL[Number(match[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(match[3])}`;
}

/**
 * The one line that makes "real, dated market prices" visible to the person
 * holding the phone — and stays honest as the data ages. Null when the
 * metadata never arrived, so a missing meta.json simply hides the line rather
 * than blocking a plan.
 */
export function priceVintageLine(meta) {
  const latest = formatPriceDate(meta?.prices?.latest);
  if (!latest) return null;
  const { sourced, total } = meta.prices;
  const counts =
    Number.isFinite(sourced) && Number.isFinite(total)
      ? ` · ${sourced}/${total} sangkap may pinagkunan`
      : '';
  return `Presyo noong ${latest}${counts}`;
}

/* ── market mode (ROADMAP B1) ─────────────────────────────────────────── */

/**
 * Running total for someone standing at a stall with one hand on the phone.
 *
 * Measured against the shopping-list total rather than the budget: the list is
 * what they actually have to buy, and it is the figure printed directly below
 * it as `Kabuuan`. Using the budget instead would put two different
 * denominators on one screen for no gain.
 */
export function marketProgress(spent, total, checkedCount, itemCount) {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const safeSpent = Math.min(Math.max(Number.isFinite(spent) ? spent : 0, 0), safeTotal);
  const checked = Number.isFinite(checkedCount) ? checkedCount : 0;
  const items = Number.isFinite(itemCount) ? itemCount : 0;

  return {
    percent: safeTotal > 0 ? round1((safeSpent / safeTotal) * 100) : 0,
    remaining: round2(safeTotal - safeSpent),
    spentText: `${formatPeso(safeSpent)} of ${formatPeso(safeTotal)}`,
    itemsText: `${checked}/${items} ${items === 1 ? 'item' : 'items'}`,
    done: items > 0 && checked >= items
  };
}

/**
 * The plan as plain text, for navigator.share or the clipboard. Plain text on
 * purpose: it survives SMS, Messenger, a screenshot and a printout, costs
 * almost nothing to send, and needs no app at the other end — the household
 * doing the planning and the person walking to the palengke are often not the
 * same person.
 */
export function formatPlanAsText(plan, shoppingList, { days = 1, budget, totalCost } = {}) {
  const meals = plan?.meals ?? [];
  const items = shoppingList?.items ?? [];
  const familySize = Number.isFinite(plan?.familySize) ? plan.familySize : 1;
  const dayCount = Number.isFinite(days) && days >= 1 ? Math.floor(days) : 1;
  const wholeBudget = Number.isFinite(budget) ? budget : (plan?.budget ?? 0);
  const spend = Number.isFinite(totalCost) ? totalCost : (plan?.totalCost ?? 0);
  const leftover = wholeBudget - spend;

  const lines = [
    'KAIN — plano sa palengke',
    `Budget ${formatPeso(wholeBudget)} · ${familySize} ${familySize === 1 ? 'tao' : 'katao'}` +
      (dayCount > 1 ? ` · ${dayCount} araw` : ''),
    '',
    dayCount > 1 ? 'MGA PUTAHE (araw-araw)' : 'MGA PUTAHE'
  ];

  for (const meal of meals) {
    lines.push(`- ${meal.recipe?.name} x${meal.portions} — ${formatPeso(meal.cost)}`);
  }

  lines.push('', dayCount > 1 ? `LISTAHAN SA PALENGKE (buong ${dayCount} araw)` : 'LISTAHAN SA PALENGKE');
  for (const item of items) {
    lines.push(`- ${item.name} ${formatQuantity(item.quantity, item.unit)} — ${formatPeso(item.cost)}`);
  }

  lines.push(
    '',
    `KABUUAN ${formatPeso(shoppingList?.totalCost)} · ${formatPeso(leftover)} natira sa budget`
  );

  return lines.join('\n');
}

function round1(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
