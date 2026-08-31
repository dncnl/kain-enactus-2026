/**
 * Translation dictionary for the Fil/En toggle.
 *
 * Pure data plus a lookup — no DOM, no network, no state. `js/app.js` is the
 * only place that reads or writes which locale is active (it owns the DOM and
 * `storage.js`, per the rule at the top of app.js); `js/format.js` accepts a
 * `locale` argument for the sentences it composes. Keeping every string here,
 * in one file, means a translator (or a judge asking "is this really
 * bilingual?") can see the whole surface in one place.
 *
 * DEFAULT_LOCALE is 'fil': the primary users are Filipino families on a tight
 * budget, and the app's tone (see DEVNOTES) was already built around Tagalog
 * for exactly that reason. English is the toggle-to option, not the default.
 *
 * `{name}` placeholders are replaced by `t()`; a key with no matching var is
 * left as literal text (fails loud in review, not silently in production).
 */

export const DEFAULT_LOCALE = 'fil';
export const SUPPORTED_LOCALES = ['fil', 'en'];

const STRINGS = {
  fil: {
    // ── header ──
    langToggleLabel: 'Wika',
    tagline1: 'Budget',
    tagline2: 'sa Pagkain',

    // ── input screen ──
    inputTitle: 'Magkano ang budget?',
    inputSubtitle: 'Ilagay kung magkano ang pwede mong gastusin ngayon. Hahanapin ni Kain ang pinaka-masustansyang planong kasya dito.',
    budgetLabel: 'Budget sa pagkain',
    familyLabel: 'Ilang katao?',
    fewerPeopleAria: 'Bawasan ang tao',
    morePeopleAria: 'Dagdagan ang tao',
    daysLabel: 'Ilang araw?',
    daysLabelHint: '— gaano katagal dapat tumagal ang budget na ito',
    fewerDaysAria: 'Bawasan ang araw',
    moreDaysAria: 'Dagdagan ang araw',
    submitButton: 'Gawin ang plano',
    footerNote: 'Gumagana kahit walang internet · Walang kailangang account · Libre',
    perDayHintOne: '{amount} para sa isang araw.',
    perDayHintMulti: '{amount} kada araw sa loob ng {days} araw.',

    // ── calculating screen ──
    calculatingTitle: 'Naghahanap ng pinakamainam…',
    calculatingSubtitle: 'Sinusuri ang bawat kumbinasyong kasya sa iyong budget.',

    // ── results screen ──
    resultsYourPlan: 'Ang plano mo',
    resultsOfPrefix: 'ng ',
    resultsBudgetSuffix: ' na budget · para sa ',
    resultsMidConnector: ' · ',
    resultsLeftoverSuffix: ' ang natitira',
    cappedNote: 'Naabot na ng mga putaheng ito ang pinakamataas na bilang ng beses na puwede silang lutuin sa isang araw, kaya may natitirang budget na hindi pa nagagamit.',
    mealsHeading: 'Mga putahe',
    nutritionHeading: 'Nutrisyon na natugunan',
    nutritionSubtitle: 'Bahagi ng pang-araw-araw na pangangailangan na naibibigay ng planong ito sa buong pamilya.',
    shoppingHeading: 'Listahan sa palengke',
    shoppingSubtitle: 'Markahan ang bawat bilihin habang binibili — eksaktong dami, walang matitirang masisira sa bahay.',
    inBasketLabel: 'Nasa basket na',
    totalLabel: 'Kabuuan',
    shareButton: 'Ibahagi ang listahan',
    newBudgetButton: 'Bagong budget',

    // ── empty screen ──
    emptyTitle: 'Kulang pa ang budget',
    emptyPrefix: 'Walang kumpletong putahe para sa ',
    emptyMid: ' na kasya sa ',
    emptySuffix: ' sa ngayon.',
    emptyPartialLead: 'Pero kaya nito ang',
    tryAtLeastLabel: 'Subukan ng hindi bababa sa',
    changeBudgetButton: 'Baguhin ang budget',
    partialMeal: '{servings} {servingWord} ng {name}',
    partialDetail: '{cost} — hindi pa sapat sa buong pamilya, pero may makakain ngayon.',

    // ── words ──
    person: 'tao',
    peopleWord: 'katao',
    batch: 'beses',
    batches: 'beses',
    serving: 'porsyon',
    servings: 'porsyon',
    perPersonSuffix: 'kada tao',
    day: 'araw',
    days: 'araw',
    item: 'bilihin',
    items: 'bilihin',

    // ── coverage verdicts ──
    verdictLow: 'Kulang',
    verdictNear: 'Halos sapat',
    verdictOk: 'Sapat',
    verdictOver: 'Sobra',

    // ── nutrient names (chart / coverage list) ──
    nutrientCalories: 'Enerhiya',
    nutrientProtein: 'Protina',
    nutrientIron: 'Bakal',
    nutrientVitaminA: 'Bitamina A',

    // ── energy gap note ──
    energyGapStrongLead: 'Malakas sa sustansya ang planong ito pero kulang pa sa enerhiya',
    energyGapWeakLead: 'Kulang pa sa enerhiya ang planong ito',
    energyGapBody: ' — mga {cups} tasang kanin pa ang kailangan ng buong pamilya para sa isang araw. Kung may matitirang budget, kanin ang pinakamurang pandagdag.',

    // ── plan span / day dimension ──
    planSpanDailySuffix: ', kada araw',
    planSpanText: '{servings} porsyon · humigit-kumulang {each} kada tao para sa {family} {personWord}',
    perDayText: '{amount} kada araw',
    spanText: '{total} para sa {family} {personWord} sa loob ng {days} {dayWord}',
    cookToday: 'Lutuin ito ngayon.',
    cookRepeat: 'Lutuin ang parehong mga putaheng ito araw-araw sa loob ng {days} {dayWord}.',
    shoppingSpanNote: 'Para sa buong {days} araw — isang punta lang sa palengke.',

    // ── price vintage ──
    priceVintage: 'Presyo noong {date} · {sourced}/{total} sangkap may pinagkunan',

    // ── market mode ──
    marketSpentText: '{spent} sa {total}',

    // ── chart tooltip ──
    ofDailyNeed: 'ng pang-araw-araw na pangangailangan',

    // ── fatal / status messages ──
    recipeLoadFailed: 'Hindi ma-load ang recipe data. Buksan muli ang app habang may internet.',
    recipeNotReady: 'Hindi pa handa ang recipe data. Buksan muli ang app habang may internet.',
    shareTitle: 'Kain — plano sa palengke',
    shareCopied: 'Nakopya ang listahan — puwede mo nang i-paste sa text o Messenger.',
    shareFailed: 'Hindi ma-share dito. Puwedeng i-screenshot na lang ang listahan.',

    // ── share text (plain-text export) ──
    shareHeader: 'KAIN — plano sa palengke',
    shareDishesHeading: 'MGA PUTAHE',
    shareDishesHeadingDaily: 'MGA PUTAHE (araw-araw)',
    shareListHeading: 'LISTAHAN SA PALENGKE',
    shareListHeadingDaily: 'LISTAHAN SA PALENGKE (buong {days} araw)',
    shareTotalLine: 'KABUUAN {total} · {leftover} natira sa budget'
  },

  en: {
    // ── header ──
    langToggleLabel: 'Language',
    tagline1: 'Budget',
    tagline2: 'to Meal Plan',

    // ── input screen ──
    inputTitle: "What's your budget?",
    inputSubtitle: 'Enter what you can spend today. Kain finds the most nutritious plan that fits.',
    budgetLabel: 'Food budget',
    familyLabel: 'How many people?',
    fewerPeopleAria: 'Fewer people',
    morePeopleAria: 'More people',
    daysLabel: 'How many days?',
    daysLabelHint: '— how long must this budget last',
    fewerDaysAria: 'Fewer days',
    moreDaysAria: 'More days',
    submitButton: 'Make my plan',
    footerNote: 'Works offline · No account needed · Free',
    perDayHintOne: '{amount} for one day.',
    perDayHintMulti: '{amount} a day for {days} days.',

    // ── calculating screen ──
    calculatingTitle: 'Finding the best plan…',
    calculatingSubtitle: 'Checking every combination that fits your budget.',

    // ── results screen ──
    resultsYourPlan: 'Your plan',
    resultsOfPrefix: 'of ',
    resultsBudgetSuffix: ' budget · feeds ',
    resultsMidConnector: ' · ',
    resultsLeftoverSuffix: ' left',
    cappedNote: 'These dishes have already reached the most times they can be cooked in one day, so some budget is left unused.',
    mealsHeading: 'Dishes',
    nutritionHeading: 'Nutrition covered',
    nutritionSubtitle: 'Share of the daily need this plan delivers for the whole family.',
    shoppingHeading: 'Market shopping list',
    shoppingSubtitle: 'Tick each item as you buy it — exact quantities, nothing extra to spoil at home.',
    inBasketLabel: 'In your basket',
    totalLabel: 'Total',
    shareButton: 'Share the list',
    newBudgetButton: 'New budget',

    // ── empty screen ──
    emptyTitle: "Budget isn't enough yet",
    emptyPrefix: 'No complete meal for ',
    emptyMid: ' fits ',
    emptySuffix: ' yet.',
    emptyPartialLead: 'But this still buys',
    tryAtLeastLabel: 'Try at least',
    changeBudgetButton: 'Change the budget',
    partialMeal: '{servings} {servingWord} of {name}',
    partialDetail: "{cost} — not enough for the whole family yet, but there's something to eat right now.",

    // ── words ──
    person: 'person',
    peopleWord: 'people',
    batch: 'batch',
    batches: 'batches',
    serving: 'serving',
    servings: 'servings',
    perPersonSuffix: 'per person',
    day: 'day',
    days: 'days',
    item: 'item',
    items: 'items',

    // ── coverage verdicts ──
    verdictLow: 'Low',
    verdictNear: 'Nearly enough',
    verdictOk: 'Adequate',
    verdictOver: 'More than enough',

    // ── nutrient names (chart / coverage list) ──
    nutrientCalories: 'Energy',
    nutrientProtein: 'Protein',
    nutrientIron: 'Iron',
    nutrientVitaminA: 'Vitamin A',

    // ── energy gap note ──
    energyGapStrongLead: "This plan is strong on nutrition but still short on energy",
    energyGapWeakLead: 'This plan is still short on energy',
    energyGapBody: ' — the whole family needs about {cups} more cups of rice for one day. If any budget is left over, rice is the cheapest way to add it.',

    // ── plan span / day dimension ──
    planSpanDailySuffix: ', each day',
    planSpanText: '{servings} servings · about {each} per person across {family} {personWord}',
    perDayText: '{amount} a day',
    spanText: '{total} feeds {family} {personWord} for {days} {dayWord}',
    cookToday: 'Cook this today.',
    cookRepeat: 'Cook this same set of dishes each day for {days} {dayWord}.',
    shoppingSpanNote: 'Covers the whole {days} days — one trip to the market.',

    // ── price vintage ──
    priceVintage: 'Prices as of {date} · {sourced}/{total} ingredients sourced',

    // ── market mode ──
    marketSpentText: '{spent} of {total}',

    // ── chart tooltip ──
    ofDailyNeed: 'of daily need',

    // ── fatal / status messages ──
    recipeLoadFailed: "Couldn't load the recipe data. Reopen the app while you have internet.",
    recipeNotReady: "Recipe data isn't ready yet. Reopen the app while you have internet.",
    shareTitle: 'Kain — market plan',
    shareCopied: 'List copied — you can paste it into a text message or Messenger.',
    shareFailed: "Can't share from here. You can screenshot the list instead.",

    // ── share text (plain-text export) ──
    shareHeader: 'KAIN — market plan',
    shareDishesHeading: 'DISHES',
    shareDishesHeadingDaily: 'DISHES (each day)',
    shareListHeading: 'SHOPPING LIST',
    shareListHeadingDaily: 'SHOPPING LIST (whole {days} days)',
    shareTotalLine: 'TOTAL {total} · {leftover} left of budget'
  }
};

/** `'fil' | 'en'` -> itself; anything else falls back to DEFAULT_LOCALE. */
export function normalizeLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}

/**
 * `t('perDayHintMulti', 'en', { amount: '₱666', days: 3 })` ->
 * `'₱666 a day for 3 days.'`
 *
 * An unknown key returns the key itself (loud in review, never a blank UI).
 * A `{placeholder}` with no matching var is left as literal text.
 */
export function t(key, locale, vars) {
  const dict = STRINGS[normalizeLocale(locale)];
  const template = dict?.[key] ?? STRINGS[DEFAULT_LOCALE]?.[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}
