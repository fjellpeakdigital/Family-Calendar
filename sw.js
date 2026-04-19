/* ============================================================
   sw.js — Service Worker for offline-capable PWA
   ============================================================
   Strategy:
   - Precache the app shell on install so the dashboard boots
     cold while offline.
   - Network-first for same-origin requests so code/page edits
     land immediately while online, falling back to the cache.
   - Network pass-through for everything else (Google Calendar,
     Open-Meteo, Google Identity Services, fonts) — those rely
     on in-app caches (calendar.js / weather.js) and must always
     attempt a fresh request when the network is available.

   Bump CACHE_VERSION whenever the precache list changes so old
   caches are reaped on activate.
   ============================================================ */

const CACHE_VERSION = 'fd-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './css/themes.css',
  './js/config.js',
  './js/auth.js',
  './js/calendar.js',
  './js/weather.js',
  './js/chores.js',
  './js/admin.js',
  './js/app.js',
  './pages/calendar.html',
  './pages/today.html',
  './pages/chores.html',
  './pages/weather.html',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // addAll is atomic — if any URL 404s, the whole install fails, so
      // Promise.allSettled is safer for an app shell that may gain/lose
      // files across versions.
      Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) =>
            console.warn(`[sw] precache failed for ${url}:`, err.message)
          )
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return;  // let external requests hit the network directly

  // Network-first for same-origin: keeps shipped code fresh when online.
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return resp;
      })
      .catch(() =>
        caches.match(req).then((cached) =>
          cached || caches.match('./index.html')
        )
      )
  );
});

// Let the page ask the SW to skip waiting (useful if we add an in-app
// "update available" prompt later).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
