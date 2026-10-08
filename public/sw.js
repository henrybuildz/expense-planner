/* Pocket Book service worker (hand-written, no build step).
 *
 * - Precaches the static app shell on install.
 * - Navigations: network-first, falling back to the cached index.html offline.
 * - Other same-origin GETs (hashed JS/CSS in /assets): stale-while-revalidate.
 * - The page posts the URLs it loaded (see src/main.jsx) so the hashed bundles
 *   are cached after the very first visit; the same message prunes hashed
 *   assets from older deploys so the cache cannot grow without bound.
 *
 * Bump VERSION to force old caches to be dropped.
 */
const VERSION = 'v7';
const CACHE = `expense-planner-${VERSION}`;
// Parser-initiated <script>/<link> requests send different headers (Accept, CORS mode)
// than the fetch() that stored them, so a server's `Vary` header would make every
// lookup miss and break offline loads. Entries are keyed by URL only.
const MATCH = { ignoreVary: true };
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './splash.js',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('expense-planner-') && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'CACHE_URLS' || !Array.isArray(data.urls)) return;

  const wanted = new Set();
  data.urls.forEach((u) => {
    try {
      const url = new URL(u, self.location.href);
      if (url.origin === self.location.origin) wanted.add(url.href);
    } catch {
      /* ignore malformed URLs */
    }
  });

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all([...wanted].map((href) => cache.add(href).catch(() => undefined)));
      // Drop hashed bundles that the current page no longer references.
      const stored = await cache.keys();
      await Promise.all(
        stored
          .filter((req) => {
            const url = new URL(req.url);
            return url.pathname.includes('/assets/') && !wanted.has(url.href);
          })
          .map((req) => cache.delete(req))
      );
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Never cache an error page as the offline shell.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match('./index.html', MATCH)
            .then((hit) => hit || caches.match('./', MATCH) || Response.error())
        )
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request, MATCH).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === 'basic') {
              cache.put(request, response.clone());
            }
            return response;
          })
          // respondWith() throws on `undefined`; offline + uncached must be a real error.
          .catch(() => cached || Response.error());
        return cached || network;
      })
    )
  );
});
