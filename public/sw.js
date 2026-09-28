// Cap Maldives service worker: offline app shell + cached Google Fonts.
// Data never goes through here: it lives in localStorage on the device.
// Bump VERSION to drop old caches after a change to this file.
const VERSION = 'v1';
const SHELL = `cap-shell-${VERSION}`;
const FONTS = `cap-fonts-${VERSION}`;
const START = new URL('./', self.location).href;
const CORE = ['./', './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(CORE);
      // Also precache the hashed JS/CSS referenced by the start page.
      try {
        const html = await (await cache.match(START)).text();
        const urls = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
          .map((m) => new URL(m[1], START))
          .filter((u) => u.origin === self.location.origin)
          .map((u) => u.href);
        await cache.addAll([...new Set(urls)]);
      } catch (_) {
        /* assets will be cached on first use */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL, FONTS];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req, event));
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  let res;
  try {
    res = await fetch(req);
  } catch (_) {
    return Response.error(); // offline before first load: system fonts take over
  }
  // Opaque (no-cors) font responses have status 0 but are still usable.
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(START, res.clone());
    return res;
  } catch (_) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match(START)) || Response.error();
  }
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  const update = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  return (await update) || Response.error();
}
