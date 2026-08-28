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

/** `3, 12` -> `3 batches · 12 servings`. */
export function formatPortions(portions, servings) {
  const batch = portions === 1 ? 'batch' : 'batches';
  return `${portions} ${batch} · ${servings} servings`;
}
