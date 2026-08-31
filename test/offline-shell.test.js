import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
/** Cache keys and import specifiers are always posix; Windows paths are not. */
const toPosix = (p) => p.split(sep).join('/');

/**
 * OFFLINE CONTRACT. The app must work fully offline after first load, which is
 * an explicit claim in the Enactus application. The failure mode is silent: you
 * add a module, forget it in sw.js, and the app only breaks on a real phone
 * with no signal. These tests make that failure loud and local.
 */

/** The precache list, parsed out of the service worker source. */
function precachedPaths() {
  const source = read('sw.js');
  const match = source.match(/const PRECACHE_URLS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(match, 'sw.js must declare `const PRECACHE_URLS = [ ... ]`');
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/**
 * Source with comments removed. The I/O scan below looks for calls, and a
 * comment that merely *discusses* fetch is not a network call — without this
 * the guard fails on its own documentation.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Local (non-CDN) URLs an HTML file pulls in via src= or href=. */
function localRefs(html) {
  return [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((url) => !/^(https?:)?\/\//.test(url) && !url.startsWith('#') && !url.startsWith('data:'));
}

/** Every ES module reachable from an entry point, followed transitively. */
function moduleGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const current = queue.shift();
    if (seen.has(current) || !existsSync(join(ROOT, current))) continue;
    seen.add(current);
    const source = read(current);
    for (const [, spec] of source.matchAll(/(?:^|\n)\s*import[^'"]*['"](\.[^'"]+)['"]/g)) {
      queue.push(toPosix(normalize(join(dirname(current), spec))));
    }
  }
  return seen;
}

test('every precached URL actually exists on disk', () => {
  for (const url of precachedPaths()) {
    const rel = url === './' ? 'index.html' : url.replace(/^\.\//, '');
    assert.ok(existsSync(join(ROOT, rel)), `sw.js precaches "${url}" but ${rel} does not exist`);
  }
});

test('the app shell caches the document itself', () => {
  const cached = precachedPaths();
  assert.ok(
    cached.includes('./') || cached.includes('./index.html'),
    'sw.js must precache the app document so a cold offline load resolves'
  );
});

test('every local file index.html references is precached', () => {
  const cached = new Set(precachedPaths().map((u) => u.replace(/^\.\//, '')));
  for (const ref of localRefs(read('index.html'))) {
    const rel = ref.replace(/^\.\//, '');
    assert.ok(cached.has(rel), `index.html loads "${ref}" but sw.js never precaches it`);
  }
});

test('every JS module reachable from the entry point is precached', () => {
  const cached = new Set(precachedPaths().map((u) => u.replace(/^\.\//, '')));
  for (const mod of moduleGraph('js/app.js')) {
    assert.ok(cached.has(mod), `${mod} is imported at runtime but sw.js never precaches it`);
  }
});

test('recipe data is precached — an offline plan cannot be solved without it', () => {
  const cached = precachedPaths().map((u) => u.replace(/^\.\//, ''));
  assert.ok(cached.includes('data/recipes.json'), 'data/recipes.json must be precached');
});

test('price metadata is precached so provenance survives going offline', () => {
  // Not required to solve a plan — app.js fetches it non-blockingly and hides
  // the line on failure — but "real, dated market prices" is the project's
  // central claim, and it should not quietly disappear the moment signal does.
  const cached = precachedPaths().map((u) => u.replace(/^\.\//, ''));
  assert.ok(cached.includes('data/meta.json'), 'data/meta.json must be precached');
  assert.ok(existsSync(join(ROOT, 'data/meta.json')), 'data/meta.json must exist — run `npm run build:data`');
});

test('every data file app.js fetches at runtime is precached', () => {
  // Generalises the two tests above: the module-graph test catches a new JS
  // module, but a new fetch('data/...') would otherwise reach a phone with no
  // signal and fail there instead of here.
  const cached = new Set(precachedPaths().map((u) => u.replace(/^\.\//, '')));
  const fetched = [...stripComments(read('js/app.js')).matchAll(/fetch\(\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((url) => !/^(https?:)?\/\//.test(url));

  assert.ok(fetched.length > 0, 'expected app.js to fetch at least the recipe data');
  for (const url of fetched) {
    assert.ok(cached.has(url.replace(/^\.\//, '')), `app.js fetches "${url}" but sw.js never precaches it`);
  }
});

test('the service worker versions its cache so a redeploy evicts stale files', () => {
  const source = read('sw.js');
  assert.match(source, /const CACHE_NAME\s*=\s*['"][^'"]*v\d+/i, 'CACHE_NAME must carry a version');
  assert.match(source, /caches\.delete/, 'activate must delete caches from previous versions');
});

test('the solver keeps its zero-network guarantee', () => {
  // The non-negotiable architectural claim: nothing in the solver's dependency
  // graph may perform I/O. Guarded here so it cannot regress unnoticed.
  for (const mod of moduleGraph('js/solver.js')) {
    assert.doesNotMatch(
      stripComments(read(mod)),
      /\bfetch\s*\(|XMLHttpRequest|navigator\.onLine/,
      `${mod} performs I/O`
    );
  }
});

test('the PWA manifest is precached and points at the real logo', () => {
  const cached = precachedPaths().map((u) => u.replace(/^\.\//, ''));
  assert.ok(cached.includes('manifest.webmanifest'), 'manifest must be precached');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.ok(manifest.icons?.length > 0, 'manifest needs at least one icon');
  for (const icon of manifest.icons) {
    const rel = icon.src.replace(/^\.\//, '');
    assert.ok(existsSync(join(ROOT, rel)), `manifest icon ${icon.src} does not exist`);
  }
});
