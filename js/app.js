/**
 * DOM adapter. Reads state, writes elements — nothing else.
 *
 * Every decision worth testing lives elsewhere on purpose: transitions in
 * app-state.js, arithmetic in solver.js / nutrition.js / shopping-list.js, and
 * user-visible strings in format.js. Keep it that way. If you find yourself
 * writing an `if` about *what the plan means* here, it belongs in a tested
 * module instead.
 */
import { createAppState } from './app-state.js';
import { NUTRIENTS } from './nutrition.js';
import { formatPeso, formatQuantity, barWidth, formatPortions } from './format.js';

/** How long the calculating screen shows. Pure pacing — the solve is instant. */
const CALCULATING_MS = 650;

const app = createAppState();
const screens = new Map(
  [...document.querySelectorAll('[data-screen]')].map((el) => [el.dataset.screen, el])
);
const bind = (name) => document.querySelector(`[data-bind="${name}"]`);

let recipes = [];
let chart = null;

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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderResults(state) {
  const { plan, shoppingList, coverage } = state;

  bind('totalCost').textContent = formatPeso(plan.totalCost);
  bind('budget').textContent = formatPeso(plan.budget);
  bind('familySize').textContent = `${plan.familySize} ${plan.familySize === 1 ? 'person' : 'people'}`;
  bind('leftover').textContent = formatPeso(plan.budget - plan.totalCost);

  bind('meals').replaceChildren(...plan.meals.map(mealCard));
  bind('coverage').replaceChildren(...NUTRIENTS.map(({ key }) => coverageRow(coverage[key])));
  bind('shopping').replaceChildren(...shoppingList.items.map(shoppingRow));
  bind('listTotal').textContent = formatPeso(shoppingList.totalCost);

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

function mealCard(meal) {
  const li = el('li', 'bubble bg-white shadow-pop p-4 flex items-start justify-between gap-4');
  const text = el('div', 'min-w-0');
  text.append(
    el('p', 'font-head font-extrabold text-lg leading-tight', meal.recipe.name),
    el('p', 'text-xs opacity-60 mt-1', formatPortions(meal.portions, meal.servings))
  );
  li.append(text, el('p', 'font-head font-extrabold text-kain-green shrink-0', formatPeso(meal.cost)));
  return li;
}

function coverageRow(entry) {
  const li = el('li', 'flex items-center justify-between');
  li.append(
    el('span', 'opacity-70', entry.label),
    el('span', 'font-semibold', `${entry.amount} / ${entry.target} ${entry.unit} · ${entry.percent}%`)
  );
  return li;
}

function shoppingRow(item) {
  const li = el('li', 'flex items-center justify-between gap-3 px-4 py-3');
  const text = el('div', 'min-w-0');
  text.append(
    el('p', 'font-semibold text-sm truncate', `${item.name} · ${formatQuantity(item.quantity, item.unit)}`),
    el('p', 'text-[11px] opacity-50 truncate', [...new Set(item.usedIn)].join(', '))
  );
  li.append(text, el('p', 'text-sm font-semibold shrink-0', formatPeso(item.cost)));
  return li;
}

function renderEmpty(state) {
  bind('emptyFamily').textContent = `${state.familySize} ${state.familySize === 1 ? 'person' : 'people'}`;
  bind('emptyBudget').textContent = formatPeso(state.budget);
  bind('minimumBudget').textContent = formatPeso(state.minimumBudget);
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

  const entries = NUTRIENTS.map(({ key }) => coverage[key]);
  chart?.destroy();
  chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: entries.map((e) => e.label),
      datasets: [{
        data: entries.map((e) => barWidth(e.percent)),
        backgroundColor: entries.map((e) =>
          e.percent >= 100 ? '#4A7856' : e.percent >= 50 ? '#FFCC40' : '#E8A0A0'
        ),
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
  app.submit({
    budget: Number.parseFloat(budgetInput.value),
    familySize: Number.parseInt(familyInput.value, 10)
  });
  if (app.screen !== 'calculating') return;
  setTimeout(() => app.finish(recipes), CALCULATING_MS);
});

for (const button of document.querySelectorAll('[data-step]')) {
  button.addEventListener('click', () => {
    const next = (Number.parseInt(familyInput.value, 10) || 1) + Number(button.dataset.step);
    familyInput.value = Math.max(1, next);
  });
}

for (const button of document.querySelectorAll('[data-action="reset"]')) {
  button.addEventListener('click', () => {
    app.reset();
    budgetInput.focus();
  });
}

/** App-level failure. Sticky by design: its own element, never touched by render(). */
function showFatal(message) {
  const error = document.getElementById('app-error');
  error.hidden = false;
  error.textContent = message;
}

/* ── boot ─────────────────────────────────────────────────────────────── */

app.subscribe(render);
loadRecipes();

// http/https only — a service worker cannot register from file://
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .catch((error) => console.error('[kain] service worker registration failed', error));
  });
}
