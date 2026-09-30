// Cap Maldives service worker: offline app shell + cached Google Fonts + push notifications.
// Data never goes through here: it lives in localStorage on the device. For push, the app
// pre-computes the day's coach messages into IndexedDB (src/lib/notify.ts); the push itself
// only carries the slot name ({"slot":"matin"}), so nothing personal crosses the network.
// Bump VERSION to drop old caches after a change to this file.
const VERSION = 'v2';
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

// ---------- push notifications ----------

const DB_NAME = 'cap-maldives';
const DB_STORE = 'coach';
const SLOTS = ['matin', 'midi', 'aprem', 'soir', 'bilan'];

/** Used when the app hasn't been opened recently (no pre-computed message). */
const GENERIC = {
  matin: { title: 'Bonjour', body: 'Nouvelle journée, nouveau départ. Un grand verre d’eau et on y va, à ton rythme.' },
  midi: { title: 'Pause déj', body: 'Prends le temps de manger assise, lentement. Des légumes, des protéines, et du plaisir.' },
  aprem: { title: 'Petit point de l’aprem', body: 'Un verre d’eau, quelques pas, trois respirations. Tu fais du bon boulot.' },
  soir: { title: 'Ta soirée', body: 'Deux minutes pour noter ta journée ? Pas pour juger : juste pour voir le chemin.' },
  bilan: { title: 'Ton bilan de la semaine', body: 'Viens voir tout ce que tu as fait cette semaine. Chaque petit pas compte.' },
};

const pad2 = (n) => String(n).padStart(2, '0');
const isoLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function slotFromHour(d) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (d.getDay() === 0 && h >= 17) return 'bilan';
  if (h < 11.5) return 'matin';
  if (h < 15) return 'midi';
  if (h < 18) return 'aprem';
  return 'soir';
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readDay(date) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(date);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Today's (local date) message for the slot; tomorrow/yesterday cover timezone edge cases. */
async function messageFor(slot) {
  const now = new Date();
  const day = (n) => isoLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  for (const date of [day(0), day(1), day(-1)]) {
    try {
      const rec = await readDay(date);
      const m = rec && rec.msgs && rec.msgs[slot];
      if (m && m.title && m.body) return m;
    } catch (_) {
      break; // IndexedDB unavailable: generic message
    }
  }
  return GENERIC[slot];
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let slot = null;
      try {
        const data = event.data ? event.data.json() : null;
        if (data && SLOTS.includes(data.slot)) slot = data.slot;
      } catch (_) {
        /* not JSON: guess from the time */
      }
      if (!slot) slot = slotFromHour(new Date());
      const msg = await messageFor(slot);
      const scope = self.registration.scope;
      // iOS requires every push to show a notification (userVisibleOnly).
      await self.registration.showNotification(msg.title, {
        body: msg.body,
        icon: new URL('icons/icon-192.png', scope).href,
        badge: new URL('icons/icon-192.png', scope).href,
        tag: `cap-${slot}`,
        data: { url: scope, slot },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope; // …/App-wellness/
  const target = (event.notification.data && event.notification.data.url) || scope;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (w.url.startsWith(scope) && 'focus' in w) return w.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});
