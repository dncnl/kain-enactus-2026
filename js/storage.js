/**
 * The small amount of state worth surviving a closed tab.
 *
 * WHY THIS EXISTS. On the low-end phones Kain targets, the tab *will* be
 * evicted from memory — walking to the palengke and back is more than enough.
 * Before this, that lost the plan entirely and the user had to re-enter
 * everything at the stall, which is precisely where re-entering things is
 * hardest.
 *
 * WHAT IS PERSISTED, AND WHAT DELIBERATELY IS NOT. Only the three inputs
 * (`budget`, `familySize`, `days`) and the ticked shopping-list keys.
 * **Never the plan itself.** A stored plan
 * goes stale silently when prices change — it would keep showing last month's
 * total as if it were today's. Re-solving on load costs ~19ms and is always
 * correct, so the inputs are the only thing worth keeping.
 *
 * Also stores the language toggle (`fil`/`en`), for the same reason: someone
 * who switched to English should not see Tagalog again just because the tab
 * was evicted.
 *
 * EVERY read and write is guarded. `localStorage` is not merely absent in some
 * environments: accessing the property itself throws when a browser is set to
 * block site data, and `setItem` throws on a full or partitioned quota. A
 * storage failure must degrade to "the app forgets things", never to a broken
 * app, so nothing here is allowed to propagate an exception.
 */

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './i18n.js';

/** Namespaced and versioned: a shape change bumps the suffix, old keys rot. */
const INPUTS_KEY = 'kain:inputs:v1';
const CHECKED_KEY = 'kain:checked:v1';
const LOCALE_KEY = 'kain:locale:v1';

/**
 * Reading the property can itself throw (Chrome with site data blocked), so
 * even acquiring the backend is wrapped. Null means "no storage available",
 * which every method below treats as a normal, silent no-op.
 */
function defaultBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {Storage|null} backend  Injectable so the node suite can exercise the
 *   working, absent and throwing cases without a browser or jsdom.
 */
export function createStorage(backend = defaultBackend()) {
  function readRaw(key) {
    try {
      return backend?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      backend?.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  return {
    /**
     * Restored into the form fields on load. Validated on the way out, not
     * just on the way in — anything can write to localStorage, and a garbage
     * value must not reach the solver.
     */
    readInputs() {
      const raw = readRaw(INPUTS_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        const budget = Number(parsed?.budget);
        const familySize = Number(parsed?.familySize);
        if (!Number.isFinite(budget) || budget <= 0) return null;
        if (!Number.isFinite(familySize) || familySize < 1) return null;
        // days arrived later than the other two, so an entry written by an
        // older build has none. Fall back to a single day rather than
        // discarding an otherwise good budget and family size.
        const days = Number(parsed?.days);
        return {
          budget,
          familySize,
          days: Number.isFinite(days) && days >= 1 ? days : 1
        };
      } catch {
        return null;
      }
    },

    /** @returns {boolean} whether it actually persisted. */
    writeInputs({ budget, familySize, days = 1 } = {}) {
      if (!Number.isFinite(budget) || !Number.isFinite(familySize)) return false;
      const dayCount = Number.isFinite(days) && days >= 1 ? days : 1;
      return writeRaw(INPUTS_KEY, JSON.stringify({ budget, familySize, days: dayCount }));
    },

    /**
     * Ticked shopping-list keys. Always an array, never null: the caller
     * filters these against the list it just built, so an empty result and a
     * missing result mean the same thing to it.
     */
    readCheckedKeys() {
      const raw = readRaw(CHECKED_KEY);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((key) => typeof key === 'string') : [];
      } catch {
        return [];
      }
    },

    writeCheckedKeys(keys) {
      const list = [...(keys ?? [])].filter((key) => typeof key === 'string');
      return writeRaw(CHECKED_KEY, JSON.stringify(list));
    },

    /** Called when a new budget is entered — the old basket no longer applies. */
    clearCheckedKeys() {
      try {
        backend?.removeItem(CHECKED_KEY);
        return true;
      } catch {
        return false;
      }
    },

    /** @returns {string} `'fil'` unless a valid, stored `'en'` says otherwise. */
    readLocale() {
      const raw = readRaw(LOCALE_KEY);
      return SUPPORTED_LOCALES.includes(raw) ? raw : DEFAULT_LOCALE;
    },

    /** @returns {boolean} whether it actually persisted. */
    writeLocale(locale) {
      if (!SUPPORTED_LOCALES.includes(locale)) return false;
      return writeRaw(LOCALE_KEY, locale);
    }
  };
}

/** The instance app.js uses. Tests build their own with a fake backend. */
export const storage = createStorage();
