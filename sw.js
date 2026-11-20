// Service worker: makes Breaking City installable and playable offline (Session 8).
//
// It is registered by src/core/pwa.js as  sw.js?cfg=<data/pwa.json as JSON>  so every setting
// comes from data/pwa.json (no numbers to edit here). Changing data/pwa.json changes this
// script's URL, which makes browsers install the new service worker automatically.
//
// How each request is answered:
//   • Our own code, data and content (HTML, JS, CSS, JSON — lessons, posters, links…):
//     NETWORK FIRST. Online players always get the newest version (so new releases and new
//     lessons appear by themselves); the answer is also saved, and used when offline or when
//     the network is slower than networkTimeoutMs.
//   • Our own big files (heavyExtensions: 3D models, pictures, sounds, fonts):
//     OFFLINE COPY FIRST, refreshed in the background (saves mobile data and loading time).
//   • cacheFirstHosts (three.js on the CDN, pinned to one version): offline copy first.
//   • staleHosts (Google Fonts): offline copy first, refreshed in the background.
//   • Anything else (YouTube, Google Sheets, other sites): not touched at all.
// Old caches from an earlier cacheVersion are deleted when the new worker takes over.

const CFG = (() => {
  try {
    return JSON.parse(new URL(self.location.href).searchParams.get('cfg') || '{}');
  } catch {
    return {};
  }
})();
const PREFIX = 'breaking-city-';
const CACHE = `${PREFIX}v${CFG.cacheVersion || '1'}`;
const TIMEOUT = CFG.networkTimeoutMs || 8000;
const HEAVY = new Set(CFG.heavyExtensions || []);
const CACHE_FIRST = new Set(CFG.cacheFirstHosts || []);
const STALE = new Set(CFG.staleHosts || []);
const SCOPE = new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  // Save the app shell for offline use. One missing file must not block the install.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all((CFG.precache || []).map((p) => cache.add(new URL(p, SCOPE).href).catch(() => {})));
    await self.skipWaiting(); // new versions take over right away, no "close all tabs" needed
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/** Save a good response (a copy) in the cache. Opaque cross-origin answers are kept too. */
async function put(request, response) {
  if (!response || !(response.ok || response.type === 'opaque')) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
  } catch { /* storage full or blocked: still play online */ }
}

/**
 * Fetch from the network and save a copy. The saving is attached to the event right away
 * (event.waitUntil), so the browser keeps the worker alive until the copy is written.
 */
function fetchAndSave(event) {
  const { request } = event;
  let saving = Promise.resolve();
  const network = fetch(request).then((res) => { saving = put(request, res.clone()); return res; });
  event.waitUntil(network.then(() => saving, () => {}));
  return network;
}

/** Look a request up in the cache. Pages ignore ?debug=1 etc. in their URL. */
async function cached(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit || request.mode !== 'navigate') return hit;
  return (await cache.match(request, { ignoreSearch: true }))
    || (await cache.match(new URL('./', SCOPE).href))
    || cache.match(new URL('index.html', SCOPE).href);
}

async function networkFirst(event) {
  const { request } = event;
  const network = fetchAndSave(event);
  network.catch(() => {}); // handled below; stops "unhandled rejection" noise
  const fallback = cached(request);
  let timer;
  const slow = new Promise((resolve) => { timer = setTimeout(resolve, TIMEOUT); });
  try {
    // Wait for the network, but give up after TIMEOUT if there is an offline copy.
    const res = await Promise.race([network, slow.then(async () => (await fallback) || network)]);
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    const copy = await fallback;
    if (copy) return copy;
    throw err;
  }
}

async function cacheFirst(event, refresh) {
  const { request } = event;
  const copy = await cached(request);
  if (copy && !refresh) return copy;
  const network = fetchAndSave(event); // when there is a copy, this only updates it for next time
  if (copy) {
    network.catch(() => {});
    return copy;
  }
  return network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === SCOPE.origin) {
    if (!url.pathname.startsWith(SCOPE.pathname)) return;
    const ext = url.pathname.split('.').pop().toLowerCase();
    event.respondWith(HEAVY.has(ext) ? cacheFirst(event, true) : networkFirst(event));
  } else if (CACHE_FIRST.has(url.hostname)) {
    event.respondWith(cacheFirstOnly(event));
  } else if (STALE.has(url.hostname)) {
    event.respondWith(cacheFirst(event, true));
  }
});

/** Pinned files (three.js@0.170.0): never re-download once saved. */
function cacheFirstOnly(event) {
  return cacheFirst(event, false);
}
