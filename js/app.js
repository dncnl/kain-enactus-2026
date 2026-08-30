/**
 * DOM adapter. Reads state, writes elements — nothing else.
 *
 * Every decision worth testing lives elsewhere on purpose: transitions in
 * app-state.js, arithmetic in solver.js / nutrition.js / shopping-list.js, and
 * user-visible strings in format.js. Keep it that way. If you find yourself
 * writing an `if` about *what the plan means* here, it belongs in a tested
 * module instead.
 *
 * Persistence is wired here rather than in app-state.js for the same reason
 * fetch() is: storage is I/O against the browser, and app-state.js is
 * deliberately DOM-free and side-effect-free so the flow stays testable in
 * plain node. This file is the only place that talks to the outside world.
 */
import { createAppState, MAX_FAMILY_SIZE } from './app-state.js';
import { NUTRIENTS } from './nutrition.js';
import { itemKey } from './shopping-list.js';
import { storage } from './storage.js';
import {
  formatPeso,
  formatQuantity,
  barWidth,
  formatPortions,
  coverageVerdict,
  energyGapNote,
  describePlanSpan,
  priceVintageLine,
  marketProgress,
  formatPlanAsText
} from './format.js';

/** How long the calculating screen shows. Pure pacing — the solve is instant. */
const CALCULATING_MS = 650;

/** How long a share confirmation stays on screen. */
const SHARE_STATUS_MS = 4000;

const app = createAppState();
const screens = new Map(
  [...document.querySelectorAll('[data-screen]')].map((el) => [el.dataset.screen, el])
);
const bind = (name) => document.querySelector(`[data-bind="${name}"]`);

let recipes = [];
let chart = null;
let previousScreen = null;

/**
 * Identity of the structures currently painted. The results screen re-renders
 * on every tick of a market-mode checkbox, and rebuilding the meal cards,
 * coverage rows and shopping rows each time would drop the focused checkbox
 * and restart the chart animation on every tap. These change only when
 * finish() produces a new plan, so comparing identity is enough to know
 * whether anything structural actually moved.
 */
let renderedList = null;
let renderedCoverage = null;

/** itemKey -> the nodes that make up one shopping row, for cheap tick updates. */
const shoppingRows = new Map();

/* ── data ─────────────────────────────────────────────────────────────── */

// Fetching recipe data is an app-shell concern, not a solver concern: the
// solver receives a plain array and never learns where it came from. The
// service worker serves this from cache when offline.
async function loadRecipes() {
  try {
    const response = await fetch('data/recipes.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    recipes = await response.json();
    if (!Array.isArray(recipes) || recipes.length === 0) throw new Error('empty recipe list');
    // Only now is a plan solvable — see the disabled attribute in index.html.
    bind('submit').disabled = false;
  } catch (error) {
    showFatal('Hindi ma-load ang recipe data. Buksan muli ang app habang may internet.');
    console.error('[kain] recipe load failed', error);
  }
}

/**
 * Price provenance. Strictly non-blocking: a plan must still solve if this
 * never arrives, so a failure only leaves the vintage line hidden. Never
 * awaited on the path to a result.
 */
async function loadPriceVintage() {
  const line = bind('priceVintage');
  try {
    const response = await fetch('data/meta.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = priceVintageLine(await response.json());
    if (!text) return;
    line.textContent = text;
    line.hidden = false;
  } catch (error) {
    // Deliberately quiet: this is a provenance nicety, not a failure the user
    // can act on, and the plan itself is unaffected.
    console.warn('[kain] price metadata unavailable', error);
  }
}

/* ── rendering ────────────────────────────────────────────────────────── */

function render(state) {
  for (const [name, el] of screens) el.hidden = name !== state.screen;

  // Owns #form-error only. #app-error belongs to showFatal() and is left alone,
  // otherwise a fatal message is wiped by the next state change.
  const error = document.getElementById('form-error');
  error.hidden = !state.error;
  error.textContent = state.error ?? '';

  if (state.screen === 'results') renderResults(state);
  if (state.screen === 'empty') renderEmpty(state);

  // A validation error re-renders the input screen without changing it, so
  // gate the scroll on a real screen change — otherwise every mistyped
  // budget yanks the page back to the top it never left.
  const screenChanged = state.screen !== previousScreen;
  moveFocus(state, screenChanged);
  if (screenChanged) window.scrollTo({ top: 0, behavior: 'smooth' });
  previousScreen = state.screen;
}

/**
 * Replaces the old `aria-live="polite"` on <main>, which re-announced the
 * entire results screen on every state change. Instead, move focus to what
 * actually needs a screen reader's attention: the validation alert when one
 * appears, or the newly-shown screen's container on a real transition. A
 * fatal #app-error is sticky (see showFatal) so it is never re-focused here.
 */
function moveFocus(state, screenChanged) {
  if (state.error) {
    document.getElementById('form-error').focus();
  } else if (screenChanged) {
    screens.get(state.screen)?.focus();
  }
}

function renderResults(state) {
  const { plan, shoppingList, coverage } = state;

  bind('totalCost').textContent = formatPeso(plan.totalCost);
  bind('budget').textContent = formatPeso(plan.budget);
  bind('familySize').textContent = `${plan.familySize} ${plan.familySize === 1 ? 'person' : 'people'}`;
  bind('leftover').textContent = formatPeso(plan.budget - plan.totalCost);
  bind('planSpan').textContent = describePlanSpan(plan).text;

  const cappedNote = bind('cappedNote');
  if (cappedNote) cappedNote.hidden = !state.capped;

  // Structural repaint only when the plan itself changed — see renderedList.
  if (shoppingList !== renderedList) {
    bind('meals').replaceChildren(...plan.meals.map((meal) => mealCard(meal, plan.familySize)));
    bind('coverage').replaceChildren(...NUTRIENTS.map(({ key }) => coverageRow(coverage[key])));

    shoppingRows.clear();
    bind('shopping').replaceChildren(...shoppingList.items.map(shoppingRow));
    bind('listTotal').textContent = formatPeso(shoppingList.totalCost);

    const note = energyGapNote(coverage);
    const energyNote = bind('energyNote');
    energyNote.textContent = note ?? '';
    energyNote.hidden = note === null;

    renderedList = shoppingList;
  }

  renderMarket(state);
  drawChart(coverage);
}

/** Built node-by-node rather than via innerHTML + selectors: recipe and
 *  ingredient names are data, and textContent keeps them data. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function mealCard(meal, familySize) {
  const li = el('li', 'bubble bg-white shadow-pop p-4 flex items-start justify-between gap-4');
  const text = el('div', 'min-w-0');
  text.append(
    el('p', 'font-head font-extrabold text-lg leading-tight', meal.recipe.name),
    el('p', 'text-xs opacity-60 mt-1', formatPortions(meal.portions, meal.servings, familySize))
  );
  li.append(text, el('p', 'font-head font-extrabold text-kain-green shrink-0', formatPeso(meal.cost)));
  return li;
}

/**
 * Verdict tones -> chip styling and bar colour. One map, two renderers, so the
 * word beside a number and the bar above it can never disagree.
 *
 * They used to. drawChart() banded its own colours at 50% while the verdicts
 * band at 70%, which painted a pink "Kulang" chip next to a yellow bar for the
 * same nutrient at the real 300/4 plan's 59.3% energy. Same palette as before —
 * only the 50-69% band moves, and it moves onto the verdict the row already
 * states in words. The banding decision itself stays in format.js.
 */
const VERDICT_STYLE = {
  low: { chip: 'bg-[#E8A0A0]', bar: '#E8A0A0' },
  near: { chip: 'bg-kain-yellow', bar: '#FFCC40' },
  ok: { chip: 'bg-kain-green text-white', bar: '#4A7856' },
  over: { chip: 'bg-white border-2 border-kain-green text-kain-green', bar: '#4A7856' }
};

function coverageRow(entry) {
  const li = el('li', 'flex items-center justify-between gap-2');
  const verdict = coverageVerdict(entry.percent);

  const chip = el(
    'span',
    `rounded-full px-2 py-[3px] text-[10px] font-extrabold leading-none ${VERDICT_STYLE[verdict.tone].chip}`,
    verdict.label
  );
  chip.lang = 'tl';

  const figures = el('div', 'flex items-center gap-2 shrink-0');
  figures.append(
    el('span', 'font-semibold', `${entry.amount} / ${entry.target} ${entry.unit} · ${entry.percent}%`),
    chip
  );

  li.append(el('span', 'opacity-70', entry.label), figures);
  return li;
}

/**
 * A shopping row is a <label> wrapping its checkbox, so the whole row is the
 * tap target and the checkbox inherits the row's text as its accessible name —
 * important on a phone held one-handed at a stall.
 */
function shoppingRow(item) {
  const key = itemKey(item);

  const li = el('li', 'transition-opacity');
  const label = el('label', 'flex items-center gap-3 px-4 py-3 cursor-pointer');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'h-6 w-6 shrink-0 cursor-pointer accent-kain-green';
  checkbox.addEventListener('change', () => {
    app.toggleChecked(key);
    storage.writeCheckedKeys([...app.checkedKeys]);
  });

  const name = el(
    'p',
    'font-semibold text-sm truncate',
    `${item.name} · ${formatQuantity(item.quantity, item.unit)}`
  );
  const text = el('div', 'min-w-0 flex-1');
  text.append(name, el('p', 'text-[11px] opacity-50 truncate', [...new Set(item.usedIn)].join(', ')));

  label.append(checkbox, text, el('p', 'text-sm font-semibold shrink-0', formatPeso(item.cost)));
  li.append(label);

  shoppingRows.set(key, { li, checkbox, name });
  return li;
}

/** Paints tick state and the running spend. Cheap enough to run every render. */
function renderMarket(state) {
  const { shoppingList, checkedKeys, spent } = state;

  for (const [key, row] of shoppingRows) {
    const checked = checkedKeys.has(key);
    row.checkbox.checked = checked;
    row.li.classList.toggle('opacity-50', checked);
    row.name.classList.toggle('line-through', checked);
  }

  const progress = marketProgress(
    spent,
    shoppingList?.totalCost ?? 0,
    checkedKeys.size,
    shoppingList?.items.length ?? 0
  );
  bind('marketItems').textContent = progress.itemsText;
  bind('marketSpent').textContent = progress.spentText;
  bind('marketBar').style.width = `${barWidth(progress.percent)}%`;
}

function renderEmpty(state) {
  bind('emptyFamily').textContent = `${state.familySize} ${state.familySize === 1 ? 'person' : 'people'}`;
  bind('emptyBudget').textContent = formatPeso(state.budget);
  bind('minimumBudget').textContent = formatPeso(state.minimumBudget);

  const box = bind('partialBox');
  const partial = state.partial;
  box.hidden = !partial;
  if (!partial) return;

  bind('partialMeal').textContent =
    `${partial.servings} ${partial.servings === 1 ? 'serving' : 'servings'} ng ${partial.name}`;
  bind('partialDetail').textContent =
    `${formatPeso(partial.cost)} — hindi pa sapat sa buong pamilya, pero may makakain ngayon.`;
}

/* ── chart ────────────────────────────────────────────────────────────── */

/** Bars are clamped to the track; the list underneath carries the true figure. */
function drawChart(coverage) {
  const canvas = document.getElementById('coverage-chart');
  const box = bind('chartBox');

  // Offline before the Chart.js CDN was ever cached. Collapse the fixed-height
  // container rather than leaving a blank panel — the coverage list below still
  // carries every number, so the screen stays fully useful without the chart.
  if (!canvas || typeof Chart === 'undefined') {
    if (box) box.hidden = true;
    return;
  }
  box.hidden = false;

  // Same coverage object means the same bars: rebuilding would replay the
  // animation on every market-mode tick for no change in what it shows.
  if (coverage === renderedCoverage && chart) return;
  renderedCoverage = coverage;

  const entries = NUTRIENTS.map(({ key }) => coverage[key]);
  chart?.destroy();
  chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: entries.map((e) => e.label),
      datasets: [{
        data: entries.map((e) => barWidth(e.percent)),
        // Same banding as the verdict chip beside each figure — see VERDICT_STYLE.
        backgroundColor: entries.map((e) => VERDICT_STYLE[coverageVerdict(e.percent).tone].bar),
        borderColor: '#000',
        borderWidth: 2,
        borderRadius: 8,
        barPercentage: 0.7
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            // Report the real percentage, not the clamped bar value.
            label: (ctx) => `${entries[ctx.dataIndex].percent}% of daily need`
          }
        }
      },
      scales: {
        x: { max: 100, ticks: { callback: (v) => `${v}%` }, grid: { color: '#0001' } },
        y: { grid: { display: false }, ticks: { font: { weight: '600' } } }
      }
    }
  });
}

/* ── sharing ──────────────────────────────────────────────────────────── */

let shareStatusTimer = null;

function showShareStatus(message) {
  const status = bind('shareStatus');
  status.textContent = message;
  status.hidden = false;
  clearTimeout(shareStatusTimer);
  shareStatusTimer = setTimeout(() => {
    status.hidden = true;
  }, SHARE_STATUS_MS);
}

/**
 * Web Share where it exists, clipboard everywhere else. Both work offline, and
 * both hand over plain text rather than a link — a link is useless to someone
 * with no data left, and the point is that the list reaches whoever is actually
 * walking to the palengke.
 */
async function sharePlan() {
  if (!app.plan || !app.shoppingList) return;
  const text = formatPlanAsText(app.plan, app.shoppingList);

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Kain — plano sa palengke', text });
      return;
    } catch (error) {
      // Dismissing the share sheet is not a failure; anything else falls
      // through to the clipboard rather than leaving the user with nothing.
      if (error?.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    showShareStatus('Nakopya ang listahan — puwede mo nang i-paste sa text o Messenger.');
  } catch {
    showShareStatus('Hindi ma-share dito. Puwedeng i-screenshot na lang ang listahan.');
  }
}

/* ── input wiring ─────────────────────────────────────────────────────── */

const budgetInput = document.getElementById('budget');
const familyInput = document.getElementById('familySize');

document.getElementById('plan-form').addEventListener('submit', (event) => {
  event.preventDefault();
  // Belt and braces alongside the disabled attribute: solving against an empty
  // recipe list yields an empty plan, which the UI would report as "nothing
  // fits your budget" — a wrong answer rather than a visible failure.
  if (recipes.length === 0) {
    showFatal('Hindi pa handa ang recipe data. Buksan muli ang app habang may internet.');
    return;
  }
  const budget = Number.parseFloat(budgetInput.value);
  const familySize = Number.parseInt(familyInput.value, 10);

  app.submit({ budget, familySize });
  if (app.screen !== 'calculating') return;

  // Only remember inputs the state machine accepted, so a rejected value is
  // never restored on the next visit.
  storage.writeInputs({ budget: app.budget, familySize: app.familySize });
  setTimeout(() => app.finish(recipes, storage.readCheckedKeys()), CALCULATING_MS);
});

for (const button of document.querySelectorAll('[data-step]')) {
  button.addEventListener('click', () => {
    const next = (Number.parseInt(familyInput.value, 10) || 1) + Number(button.dataset.step);
    familyInput.value = Math.min(MAX_FAMILY_SIZE, Math.max(1, next));
  });
}

for (const button of document.querySelectorAll('[data-action="reset"]')) {
  button.addEventListener('click', () => {
    app.reset();
    // A new budget means a new list; stale ticks must not survive into it.
    storage.clearCheckedKeys();
    budgetInput.focus();
  });
}

for (const button of document.querySelectorAll('[data-action="share"]')) {
  button.addEventListener('click', sharePlan);
}

/** App-level failure. Sticky by design: its own element, never touched by render(). */
function showFatal(message) {
  const error = document.getElementById('app-error');
  error.hidden = false;
  error.textContent = message;
  error.focus();
}

/* ── boot ─────────────────────────────────────────────────────────────── */

// Restore the last inputs, but deliberately stay on the input screen rather
// than jumping straight to a result. The plan itself is never stored — prices
// move, and a remembered total would quietly become a lie. Re-solving costs
// ~19ms and is always current.
const savedInputs = storage.readInputs();
if (savedInputs) {
  budgetInput.value = String(savedInputs.budget);
  familyInput.value = String(savedInputs.familySize);
}

app.subscribe(render);
loadRecipes();
loadPriceVintage();

// http/https only — a service worker cannot register from file://
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .catch((error) => console.error('[kain] service worker registration failed', error));
  });
}
