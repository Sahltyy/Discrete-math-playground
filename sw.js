/* Discrete Lab service worker: keeps a full copy of the app on the phone.
   The page itself is fetched fresh when there is internet (so updates show up),
   and served from the saved copy when there is not. Everything else is cache-first. */
const VERSION = 'd753c44233';
const CACHE = 'discrete-lab-' + VERSION;
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "fonts/fonts.css",
  "fonts/bagel-fat-one-latin-ext-400-normal.woff2",
  "fonts/bagel-fat-one-latin-400-normal.woff2",
  "fonts/baloo-2-latin-ext-500-normal.woff2",
  "fonts/baloo-2-latin-500-normal.woff2",
  "fonts/baloo-2-latin-ext-600-normal.woff2",
  "fonts/baloo-2-latin-600-normal.woff2",
  "fonts/baloo-2-latin-ext-700-normal.woff2",
  "fonts/baloo-2-latin-700-normal.woff2",
  "fonts/baloo-2-latin-ext-800-normal.woff2",
  "fonts/baloo-2-latin-800-normal.woff2",
  "fonts/jetbrains-mono-greek-400-normal.woff2",
  "fonts/jetbrains-mono-latin-ext-400-normal.woff2",
  "fonts/jetbrains-mono-latin-400-normal.woff2",
  "fonts/jetbrains-mono-greek-600-normal.woff2",
  "fonts/jetbrains-mono-latin-ext-600-normal.woff2",
  "fonts/jetbrains-mono-latin-600-normal.woff2",
  "fonts/jetbrains-mono-greek-700-normal.woff2",
  "fonts/jetbrains-mono-latin-ext-700-normal.woff2",
  "fonts/jetbrains-mono-latin-700-normal.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('discrete-lab-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function refill() {
  try {
    const cache = await caches.open(CACHE);
    for (const a of ASSETS) {
      if (!(await cache.match(a))) await cache.add(a).catch(() => {});
    }
  } catch (e) { /* offline or storage full: try again next time */ }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The page: try the network briefly (spotty commute signal), else the saved copy.
  if (req.mode === 'navigate') {
    // Other apps on the same github.io site share this cache storage; refill anything they cleared.
    event.waitUntil(refill());
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await withTimeout(fetch(req), 4000);
        if (fresh && fresh.ok) {
          cache.put('index.html', fresh.clone());
          return fresh;
        }
        throw new Error('bad response');
      } catch (e) {
        return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Fonts, icons, manifest: saved copy first.
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (e) {
      return Response.error();
    }
  })());
});
