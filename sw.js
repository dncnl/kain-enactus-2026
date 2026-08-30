/**
 * Kain service worker — offline app shell.
 *
 * The offline claim in the Enactus application rests on this file. Two rules:
 *   1. Anything the app needs to solve a plan is PRECACHED (install-time, must
 *      succeed). After one online visit the core app works with no signal.
 *   2. CDN dependencies are cached best-effort — a CDN hiccup must never make
 *      install fail and leave the user with no service worker at all.
 *
 * test/offline-shell.test.js asserts PRECACHE_URLS covers every module and
 * asset actually reachable at runtime, so adding a file without caching it
 * fails the suite instead of failing silently on someone's phone.
 *
 * Bump CACHE_NAME on every deploy — that is what evicts stale files.
 */
const CACHE_NAME = 'kain-v5';

/** Local app shell. Install fails if any of these fail. */
const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/kain-logo.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-192-maskable.png',
  'assets/icon-512-maskable.png',
  'data/recipes.json',
  'js/app.js',
  'js/app-state.js',
  'js/solver.js',
  'js/nutrition.js',
  'js/nutrition-targets.js',
  'js/shopping-list.js',
  'js/format.js'
];

/** Third-party runtime deps. Cached opportunistically, never blocking. */
const CDN_URLS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      // Best-effort: a failed CDN must not abort the whole install.
      await Promise.allSettled(CDN_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Navigations resolve to the cached shell so a cold offline launch works.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('index.html')) ?? caches.match('./'))
    );
    return;
  }

  // Everything else: cache-first, then network, revalidating in the background
  // so a redeploy is picked up without ever blocking on the network.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then(async (response) => {
          if (response.ok || response.type === 'opaque') {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => undefined);

      return cached ?? (await network) ?? Response.error();
    })()
  );
});
