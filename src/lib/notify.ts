// Web push without a server of ours and without personal data leaving the phone.
//
// 1. The app pre-computes today's and tomorrow's coach messages (coachMessages) and
//    writes them to IndexedDB (db 'cap-maldives', store 'coach', key = ISO date),
//    on app open and after every store change (debounced 1 s).
// 2. A GitHub Actions cron sends a content-less push {slot} to the subscription
//    stored as a repo secret (scripts/send-push.mjs).
// 3. The service worker (public/sw.js) reads the message for that slot from
//    IndexedDB and shows it. The push service only ever sees the slot name.

import { store } from '../store';
import { addDays, today } from './dates';
import { coachMessages, slotAt } from './coach';
import type { CoachSlot, CoachMessage } from './coach';

/** VAPID public key (the private one is a GitHub secret, never in the repo). */
export const VAPID_PUBLIC_KEY =
  'BIwA6s2biy2_PJaKcEvSIq6GDByJKcLG1UAf2uhXq3thppGonD6t_CXNdABbsWPavrRsyxYfn1N6kkhq4jBZ1mk';

export const PUSH_SLOTS: { slot: CoachSlot; label: string }[] = [
  { slot: 'matin', label: 'Matin 8 h' },
  { slot: 'midi', label: 'midi 12 h' },
  { slot: 'aprem', label: 'après-midi 16 h' },
  { slot: 'soir', label: 'soir 20 h' },
  { slot: 'bilan', label: 'bilan le dimanche 19 h' },
];

const DB_NAME = 'cap-maldives';
const DB_STORE = 'coach';
const SUB_KEY = 'cap-maldives:pushSub';

// ---------- IndexedDB (same schema as public/sw.js) ----------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

type DayMessages = Record<CoachSlot, CoachMessage>;

async function writeMessages(entries: [string, DayMessages][]): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const os = tx.objectStore(DB_STORE);
      for (const [date, msgs] of entries) os.put({ date, msgs, at: Date.now() }, date);
      // Keep only a few days around today.
      const keep = new Set([addDays(today(), -1), ...entries.map(([d]) => d)]);
      const cur = os.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return;
        if (!keep.has(String(c.key))) c.delete();
        c.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Compute today's and tomorrow's messages and store them for the service worker. */
export async function syncCoachMessages(): Promise<void> {
  if (!store.state.profile.onboarded) return;
  const d0 = today();
  const d1 = addDays(d0, 1);
  const entries: [string, DayMessages][] = [];
  for (const d of [d0, d1]) {
    try {
      entries.push([d, coachMessages(d, store.state)]);
    } catch {
      /* the SW falls back to a generic message for that day */
    }
  }
  if (entries.length) await writeMessages(entries);
}

let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;

function scheduleSync(delay = 1000) {
  clearTimeout(timer);
  timer = setTimeout(() => { void syncCoachMessages().catch(() => undefined); }, delay);
}

/** Start keeping IndexedDB in sync with the store (idempotent). */
export function startCoachSync(): void {
  if (started || typeof indexedDB === 'undefined') return;
  started = true;
  store.subscribe(() => scheduleSync(1000));
  // App (re)opened from the background: the date may have changed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(300);
  });
  scheduleSync(0);
}

// ---------- status ----------

export interface PushStatus {
  /** Service worker + Push API + Notification API available. */
  supported: boolean;
  /** Running as a home-screen app (required for push on iPhone). */
  installed: boolean;
  permission: NotificationPermission | 'unsupported';
  /** Page is served over https (GitHub Pages), outside an iframe. */
  secure: boolean;
}

function inIframe(): boolean {
  try { return window.top !== window; } catch { return true; }
}

/** Notification API present (guarded with typeof: some browsers expose the name without a usable object). */
const hasNotification = (): boolean => typeof Notification !== 'undefined' && !!Notification;

export function pushStatus(): PushStatus {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && hasNotification();
  const nav = navigator as Navigator & { standalone?: boolean };
  const installed = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
  return {
    supported,
    installed,
    permission: hasNotification() ? Notification.permission : 'unsupported',
    secure: location.protocol === 'https:' && !inIframe(),
  };
}

// ---------- subscription ----------

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function registration(timeoutMs = 5000): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('Service worker indisponible.');
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
  if (!reg) throw new Error('L’app n’est pas encore prête hors ligne : ferme-la, rouvre-la depuis l’écran d’accueil et réessaie.');
  return reg;
}

/** Last subscription JSON created on this device (to show it again in Plus). */
export function savedSubscription(): string | null {
  try { return localStorage.getItem(SUB_KEY); } catch { return null; }
}

function saveSubscription(json: string) {
  try { localStorage.setItem(SUB_KEY, json); } catch { /* ignore */ }
}

/** The browser's current push subscription, if any (null when none or unsupported). */
export async function currentSubscription(): Promise<string | null> {
  try {
    if (!pushStatus().supported) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return null;
    const json = JSON.stringify(sub.toJSON());
    saveSubscription(json);
    return json;
  } catch {
    return null;
  }
}

/**
 * Ask for permission and subscribe to push. MUST be called from a tap (iOS rule).
 * Resolves with the subscription JSON to paste into the PUSH_SUBSCRIPTION secret.
 */
export async function enablePush(): Promise<string> {
  const st = pushStatus();
  if (!st.supported) {
    throw new Error(st.installed
      ? 'Ton iPhone ne gère pas encore les notifications web : il faut iOS 16.4 ou plus.'
      : 'Ouvre l’app depuis ton écran d’accueil (Safari → Partager → Sur l’écran d’accueil), puis réessaie.');
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error(perm === 'denied'
      ? 'Notifications refusées. Réglages iPhone → Notifications → Cap : autorise-les, puis réessaie.'
      : 'Tu n’as pas encore répondu à la demande : réessaie quand tu veux.');
  }
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(VAPID_PUBLIC_KEY) });
  }
  const json = JSON.stringify(sub.toJSON());
  saveSubscription(json);
  void syncCoachMessages().catch(() => undefined);
  return json;
}

/** Show the message of the current moment as a local notification (needs permission). */
export async function testNotification(): Promise<void> {
  if (!hasNotification() || Notification.permission !== 'granted') {
    throw new Error('Active d’abord les notifications.');
  }
  const reg = await registration();
  const d = today();
  const slot = slotAt(d, new Date().getHours() + new Date().getMinutes() / 60);
  let msg: CoachMessage = { title: 'Pep’s', body: 'Petit coucou : les notifications marchent !' };
  try { msg = coachMessages(d, store.state)[slot]; } catch { /* generic */ }
  await reg.showNotification(msg.title, {
    body: msg.body,
    icon: new URL('icons/icon-192.png', reg.scope).href,
    badge: new URL('icons/icon-192.png', reg.scope).href,
    tag: `cap-test`,
    data: { url: reg.scope },
  });
}
