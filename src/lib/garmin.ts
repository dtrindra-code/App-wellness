// Garmin Connect → Pep's (V8). A GitHub Actions cron (scripts/garmin/sync.py) writes the last
// days of Garmin data, ENCRYPTED with the "clé Garmin" (lib/garmin-key.ts), into the secret
// gist of the backup as 'peps-garmin.enc.json'. Here the app downloads it with the backup
// token, decrypts it on the phone and MERGES it into the days:
// - wellbeing numbers (sleep, Body Battery, stress, resting HR, steps), marked source 'garmin';
//   a field typed by hand (Équilibre form, or present before the first import) is never overwritten;
// - activities → Workout (garminId: imported once, even if deleted afterwards), linked to the
//   planned session of the same sport that day; a hand-logged workout of the same sport that
//   day is completed with the Garmin details instead of being duplicated;
// - pillars "sommeil" (≥ 7 h) and "marche" (≥ 8 000 pas) ticked, never unticked.
// Never deletes anything. Checked at start, when the backup is ready, when the app comes back
// to the foreground and every 30 min while open.

import type { DayLog, GarminField, Sport, Wellbeing, Workout } from '../types';
import { store, uid } from '../store';
import { sessionsOn } from '../data/plan';
import { fromB64, findGist, gh, gistFileText, onSyncStatus, readSyncConfig, SyncError, syncStatus, type Gist } from './sync';
import { onGarminKey, readGarminKey } from './garmin-key';

export const GARMIN_FILE = 'peps-garmin.enc.json';
export const GARMIN_WORKFLOW_URL = 'https://github.com/dtrindra-code/App-wellness/actions/workflows/garmin.yml';
export const GARMIN_SECRETS_URL = 'https://github.com/dtrindra-code/App-wellness/settings/secrets/actions';

const STATE_KEY = 'cap-maldives:garmin';
const EVERY_MS = 30 * 60_000;
const TICK_MS = 5 * 60_000;

// ---------- file format (see scripts/garmin/sync.py) ----------

export interface GarminDay { sleepH?: number; bodyBattery?: number; stress?: number; restingHr?: number; steps?: number }
export interface GarminActivity {
  id: string;
  date: string;
  time?: string;
  type: string;
  minutes: number;
  distanceKm?: number;
  avgHr?: number;
  calories?: number;
}
export interface GarminData {
  days: Record<string, GarminDay>;
  activities: GarminActivity[];
  run?: { at?: string; from?: string; to?: string; days?: number; activities?: number };
}
interface Envelope { app: 'peps-garmin'; v: 1; updatedAt: string; iv: string; data: string }

const FIELDS: { key: GarminField; min: number; max: number; decimal: boolean }[] = [
  { key: 'sleepH', min: 0, max: 16, decimal: true },
  { key: 'bodyBattery', min: 0, max: 100, decimal: false },
  { key: 'stress', min: 0, max: 100, decimal: false },
  { key: 'restingHr', min: 25, max: 150, decimal: false },
  { key: 'steps', min: 0, max: 150_000, decimal: false },
];

const isISO = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

// ---------- sport mapping ----------

const SPORTS: [Sport, string[]][] = [
  ['run', ['running', 'treadmill_running', 'trail_running', 'track_running', 'indoor_running', 'virtual_run', 'street_running', 'ultra_run', 'obstacle_run']],
  ['bike', ['cycling', 'road_biking', 'indoor_cycling', 'mountain_biking', 'gravel_cycling', 'virtual_ride', 'e_bike_fitness', 'e_bike_mountain', 'cyclocross', 'track_cycling', 'recumbent_cycling', 'bmx']],
  ['swim', ['lap_swimming', 'open_water_swimming', 'swimming']],
  ['basket', ['basketball']],
  ['strength', ['strength_training', 'hiit', 'indoor_cardio']],
  ['walk', ['walking', 'hiking', 'casual_walking', 'speed_walking', 'indoor_walking', 'mountaineering']],
  ['mobility', ['yoga', 'pilates', 'breathwork', 'stretching', 'mobility', 'meditation']],
];

/** Garmin activity type key → app sport. */
export function sportFor(typeKey: string): Sport {
  const k = (typeKey || '').toLowerCase();
  for (const [sport, keys] of SPORTS) if (keys.includes(k)) return sport;
  if (k.includes('swim')) return 'swim';
  if (k.includes('run')) return 'run';
  if (k.includes('cycl') || k.includes('bik') || k.includes('ride')) return 'bike';
  if (k.includes('walk') || k.includes('hik')) return 'walk';
  if (k.includes('yoga') || k.includes('pilates') || k.includes('stretch')) return 'mobility';
  return 'other';
}

// ---------- merge (pure on a DayLog, exported for tests) ----------

export interface DayMergeResult { changed: boolean; wellbeing: number; added: number; completed: number; linked: number }

/**
 * Merges Garmin numbers + activities into a copy of `day` (mutated in place).
 * `known` = garmin ids already imported once (not re-imported, even if deleted since).
 */
export function mergeDay(day: DayLog, g: GarminDay | undefined, acts: GarminActivity[], known: Set<string>): DayMergeResult {
  const res: DayMergeResult = { changed: false, wellbeing: 0, added: 0, completed: 0, linked: 0 };
  const before = JSON.stringify(day);

  // 1. wellbeing
  if (g) {
    const wb: Wellbeing = { ...(day.wellbeing ?? {}) };
    const manual = new Set<GarminField>(wb.manual ?? []);
    const owned: Partial<Record<GarminField, number>> = { ...(wb.garmin ?? {}) };
    const updated = new Set<GarminField>();
    for (const f of FIELDS) {
      let v = num(g[f.key]);
      if (v === undefined || v < f.min || v > f.max) continue;
      v = f.decimal ? Math.round(v * 10) / 10 : Math.round(v);
      if (manual.has(f.key)) continue;
      const cur = wb[f.key];
      if (cur !== undefined && cur !== owned[f.key]) {
        // Typed by hand (before the first import, or changed since): hers.
        manual.add(f.key);
        continue;
      }
      owned[f.key] = v;
      if (cur !== v) { wb[f.key] = v; updated.add(f.key); }
    }
    if (Object.keys(owned).length) {
      wb.source = 'garmin';
      wb.garmin = owned;
    }
    if (manual.size) wb.manual = [...manual];
    day.wellbeing = wb;
    res.wellbeing = updated.size;
    // Pillars: numbers that clearly meet them tick them (never untick), like the Équilibre form.
    const hb = { ...(day.habits ?? {}) };
    let ticked = false;
    if (updated.has('sleepH') && (wb.sleepH ?? 0) >= 7 && !hb.sleep) { hb.sleep = true; ticked = true; }
    if (updated.has('steps') && (wb.steps ?? 0) >= 8000 && !hb.walk) { hb.walk = true; ticked = true; }
    if (ticked) day.habits = hb;
  }

  // 2. activities
  const sessions = acts.length ? sessionsOn(day.date, store.profile, store.state.days) : [];
  for (const a of acts) {
    if (known.has(a.id) || day.workouts.some((w) => w.garminId === a.id)) { known.add(a.id); continue; }
    const sport = sportFor(a.type);
    const extra: Partial<Workout> = { garminId: a.id };
    if (a.time && /^\d{2}:\d{2}$/.test(a.time)) extra.time = a.time;
    const hr = num(a.avgHr);
    if (hr && hr > 0) extra.avgHr = Math.round(hr);
    const kcal = num(a.calories);
    if (kcal && kcal > 0) extra.calories = Math.round(kcal);
    const km = num(a.distanceKm);
    const minutes = Math.max(1, Math.round(num(a.minutes) ?? 0));

    // A workout of the same sport she logged by hand that day: complete it, don't duplicate.
    const manualW = day.workouts.find((w) => w.sport === sport && !w.garminId && w.source !== 'garmin');
    let w: Workout;
    if (manualW) {
      Object.assign(manualW, extra);
      if (km && km > 0 && !manualW.distanceKm) manualW.distanceKm = Math.round(km * 100) / 100;
      if (manualW.estimated) { manualW.minutes = minutes; delete manualW.estimated; }
      w = manualW;
      res.completed++;
    } else {
      w = { id: uid(), sport, minutes, source: 'garmin', ...extra };
      if (km && km > 0) w.distanceKm = Math.round(km * 100) / 100;
      day.workouts.push(w);
      res.added++;
    }
    if (!w.plannedId) {
      const s = sessions.find((x) => x.sport === sport && !day.workouts.some((o) => o.plannedId === x.id));
      if (s) { w.plannedId = s.id; res.linked++; }
    }
    known.add(a.id);
  }

  res.changed = JSON.stringify(day) !== before;
  return res;
}

/** Merge a whole decrypted file into the store (one save/re-render). */
export async function importGarmin(data: GarminData): Promise<{ days: number; added: number; completed: number; linked: number }> {
  const st = readState();
  const known = new Set(st.importedIds ?? []);
  const actsBy = new Map<string, GarminActivity[]>();
  for (const a of Array.isArray(data.activities) ? data.activities : []) {
    if (!a || typeof a.id !== 'string' || !isISO(a.date)) continue;
    const list = actsBy.get(a.date) ?? [];
    list.push(a);
    actsBy.set(a.date, list);
  }
  const days = data.days && typeof data.days === 'object' ? data.days : {};
  const dates = new Set([...Object.keys(days).filter(isISO), ...actsBy.keys()]);
  const out = { days: 0, added: 0, completed: 0, linked: 0 };
  await store.batch(async () => {
    for (const date of [...dates].sort()) {
      const copy: DayLog = JSON.parse(JSON.stringify(store.getDay(date)));
      const r = mergeDay(copy, days[date], actsBy.get(date) ?? [], known);
      if (!r.changed) continue;
      await store.updateDay(date, (d) => { Object.assign(d, copy); });
      if (r.wellbeing) out.days++;
      out.added += r.added;
      out.completed += r.completed;
      out.linked += r.linked;
    }
  });
  writeState({ ...readState(), importedIds: [...known].slice(-800) });
  return out;
}

// ---------- local state + status ----------

interface GarminState {
  gistId?: string;
  /** Last successful check on this phone (ISO). */
  lastCheck?: string;
  /** updatedAt of the Garmin file (when GitHub last wrote it). */
  fileUpdatedAt?: string;
  /** Counts from the last GitHub run. */
  run?: { days: number; activities: number; at?: string };
  /** What the last import changed here. */
  lastImport?: { at: string; days: number; added: number; completed: number; linked: number };
  importedIds?: string[];
}

function readState(): GarminState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeState(s: GarminState) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export type GarminPhase = 'off' | 'nokey' | 'idle' | 'checking' | 'ok' | 'nofile' | 'error';
export interface GarminStatus {
  phase: GarminPhase;
  message?: string;
  lastCheck?: string;
  fileUpdatedAt?: string;
  run?: GarminState['run'];
  lastImport?: GarminState['lastImport'];
}

let phase: GarminPhase = 'idle';
let message: string | undefined;
const listeners = new Set<() => void>();

export function garminStatus(): GarminStatus {
  const st = readState();
  const base = { lastCheck: st.lastCheck, fileUpdatedAt: st.fileUpdatedAt, run: st.run, lastImport: st.lastImport };
  if (!readSyncConfig()) return { phase: 'off', ...base };
  if (!readGarminKey()) return { phase: 'nokey', ...base };
  return { phase, message, ...base };
}

export function onGarminStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setPhase(p: GarminPhase, msg?: string) {
  phase = p;
  message = msg;
  listeners.forEach((fn) => fn());
}

// ---------- fetch + decrypt ----------

async function gistWithFile(token: string, ids: (string | undefined)[]): Promise<Gist | null> {
  for (const id of [...new Set(ids.filter((x): x is string => !!x))]) {
    try {
      const g = await gh<Gist>(token, `/gists/${encodeURIComponent(id)}`);
      if (g.files?.[GARMIN_FILE]) return g;
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e;
    }
  }
  const found = await findGist(token, GARMIN_FILE);
  return found ? gh<Gist>(token, `/gists/${encodeURIComponent(found.id)}`) : null;
}

async function decryptFile(env: Envelope, keyB64: string): Promise<GarminData> {
  try {
    const key = await crypto.subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, key, fromB64(env.data));
    return JSON.parse(new TextDecoder().decode(pt)) as GarminData;
  } catch {
    throw new SyncError('Ta clé Garmin ne correspond pas au secret GARMIN_SYNC_KEY : recopie-la sur GitHub, puis relance la synchro.');
  }
}

let inflight: Promise<void> | null = null;

/**
 * Download + decrypt + merge. Without `force`, at most every 30 min. Never throws (see garminStatus()).
 */
export function checkGarmin(opts: { force?: boolean } = {}): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const cfg = readSyncConfig();
    const keyB64 = readGarminKey();
    if (!cfg || !keyB64) { setPhase('idle'); return; }
    const st = readState();
    if (!opts.force && st.lastCheck && Date.now() - Date.parse(st.lastCheck) < EVERY_MS) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPhase('error', 'Hors ligne : la synchro Garmin reprendra au retour du réseau.');
      return;
    }
    setPhase('checking');
    try {
      const gist = await gistWithFile(cfg.token, [st.gistId, cfg.gistId]);
      const text = gist ? await gistFileText(cfg.token, gist, GARMIN_FILE) : null;
      if (!gist || !text) {
        writeState({ ...readState(), lastCheck: new Date().toISOString() });
        setPhase('nofile', 'Pas encore de données Garmin sur GitHub : lance la synchro une première fois (étape 4).');
        return;
      }
      let env: Envelope;
      try { env = JSON.parse(text); } catch { throw new SyncError('Le fichier Garmin sur GitHub est illisible.'); }
      if (!env || env.app !== 'peps-garmin' || !env.iv || !env.data) throw new SyncError('Le fichier Garmin sur GitHub n’a pas le bon format.');
      const now = new Date().toISOString();
      const next: GarminState = { ...readState(), gistId: gist.id, lastCheck: now };
      if (env.updatedAt !== st.fileUpdatedAt || opts.force) {
        const data = await decryptFile(env, keyB64);
        const r = await importGarmin(data);
        Object.assign(next, readState(), { gistId: gist.id, lastCheck: now, fileUpdatedAt: env.updatedAt });
        const run = data.run;
        next.run = { days: num(run?.days) ?? Object.keys(data.days ?? {}).length, activities: num(run?.activities) ?? (data.activities ?? []).length, at: run?.at };
        if (r.days || r.added || r.completed || r.linked || !st.lastImport) next.lastImport = { at: now, ...r };
      }
      writeState(next);
      setPhase('ok');
    } catch (e) {
      setPhase('error', e instanceof Error ? e.message : 'Synchro Garmin impossible.');
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

// ---------- start ----------

let started = false;

/** Call once at app start (after startSync). */
export function startGarmin() {
  if (started || typeof window === 'undefined') return;
  started = true;
  void checkGarmin();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkGarmin();
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void checkGarmin();
  }, TICK_MS);
  window.addEventListener('online', () => void checkGarmin());
  // Backup just turned on / restored on this phone: the token is there now.
  let wasOn = readSyncConfig() !== null;
  onSyncStatus(() => {
    const on = readSyncConfig() !== null && syncStatus().state === 'ok';
    if (on && !wasOn) void checkGarmin({ force: true });
    wasOn = readSyncConfig() !== null;
  });
  onGarminKey(() => { if (readGarminKey()) void checkGarmin({ force: true }); });
}
