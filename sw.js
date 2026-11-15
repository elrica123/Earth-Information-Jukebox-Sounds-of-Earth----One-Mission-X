/* Earth Jukebox – Service Worker
 * Strategies:
 *  - Navigation (HTML/PHP): network first (5 s), cache fallback, then offline.html.
 *  - Local static assets (CSS/JS/icons): network first (5 s) with cache fallback.
 *  - Google Fonts: cache first.
 *  - NASA EONET API: network first (6 s), then the last saved response.
 *  - NASA GIBS imagery: stale-while-revalidate, limited to the most recent images.
 *  - /api/: network only (not cached).
 * Updates: a new worker waits until the user chooses "Update" (message SKIP_WAITING),
 * so playback is never interrupted by a silent reload.
 * Bump CACHE_VERSION when changing shell files.
 */
const CACHE_VERSION = 'v6';
const SHELL_CACHE = `earth-jukebox-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `earth-jukebox-runtime-${CACHE_VERSION}`;
const DATA_CACHE = `earth-jukebox-data-${CACHE_VERSION}`;
const IMAGE_CACHE = `earth-jukebox-images-${CACHE_VERSION}`;
const ALL_CACHES = [SHELL_CACHE, RUNTIME_CACHE, DATA_CACHE, IMAGE_CACHE];

const NETWORK_TIMEOUT = 5000;
const MAX_IMAGES = 40;

const SHELL_ASSETS = [
  './offline.html',
  './assets/css/style.css',
  './assets/js/jukebox.js',
  './assets/js/pwa.js',
  './assets/js/theme.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/favicon-32.png',
  './assets/icons/apple-touch-icon.png',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  // No skipWaiting() here: the page offers the update and sends SKIP_WAITING.
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL_ASSETS);
    // Best effort: cache the home page without blocking installation if it fails.
    await Promise.allSettled([shell.add('./index.php')]);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('earth-jukebox-') && !ALL_CACHES.includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname === 'eonet.gsfc.nasa.gov') {
    event.respondWith(eonetNetworkFirst(request));
    return;
  }
  if (url.hostname === 'gibs.earthdata.nasa.gov') {
    event.respondWith(imageStaleWhileRevalidate(request, event));
    return;
  }
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') event.respondWith(cacheFirst(request));
    return; // Let the browser handle other external requests.
  }
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }
  event.respondWith(staticNetworkFirst(request));
});

// fetch() that gives up after `ms` so a weak connection falls back to the cache quickly.
function fetchWithTimeout(request, ms, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function navigationHandler(request) {
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request, { ignoreSearch: true })
      || await caches.match('./index.php');
    return cached || caches.match('./offline.html');
  }
}

async function staticNetworkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request) || await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(RUNTIME_CACHE)).put(request, response.clone());
  return response;
}

async function eonetNetworkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetchWithTimeout(request, 6000);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (!cached) throw error;
    const headers = new Headers(cached.headers);
    headers.set('X-SW-Cache', '1');
    return new Response(await cached.blob(), { status: 200, statusText: 'OK', headers });
  }
}

// GIBS images: show the saved copy immediately and refresh it in the background.
// Images are requested in CORS mode so the cached copy is a normal, small response
// (opaque responses are padded by browsers and would exhaust the storage quota).
// If CORS is not available the request simply falls back to the browser's own fetch.
async function imageStaleWhileRevalidate(request, event) {
  const cache = await caches.open(IMAGE_CACHE);
  const key = request.url;
  const cached = await cache.match(key);

  const refresh = (async () => {
    const response = await fetch(key, { mode: 'cors', credentials: 'omit' });
    if (response.ok) {
      await cache.put(key, response.clone());
      await trimCache(cache, MAX_IMAGES);
    }
    return response;
  })();

  if (cached) {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  try {
    return await refresh;
  } catch (_) {
    try { return await fetch(request); } // CORS unavailable or offline: plain request, not cached
    catch (error) { return Response.error(); }
  }
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
