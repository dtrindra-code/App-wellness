// Automatic encrypted backup to a SECRET gist on the user's own GitHub account.
//
// - The user gives a GitHub token (Gists read/write only) and a backup password.
// - The password is stretched with PBKDF2-SHA256 (310 000 iterations, random 16-byte salt) into an
//   AES-GCM 256 key. Only the derived key bytes are kept on the phone (localStorage), never the password.
// - Each upload is store.exportJSON() encrypted with a fresh 12-byte IV. GitHub only ever sees
//   ciphertext: { app, v, updatedAt, salt, iv, data } (base64). Plaintext never leaves the device.
// - Changes are pushed automatically (4 s debounce, and when the app goes to the background).
// The token lives only in this browser's localStorage and is never logged.
// The encrypted payload also carries `secrets` (the "clé Garmin", lib/garmin-key.ts) so a restore
// keeps the Garmin sync working; the plain JSON export never contains it.

import { store } from '../store';
import { h } from './ui';
import { daysBetween, today } from './dates';
import { isGarminKey, onGarminKey, readGarminKey, writeGarminKey } from './garmin-key';

const CFG_KEY = 'cap-maldives:sync';
const LAST_EXPORT_KEY = 'cap-maldives:lastExport';
const FILE = 'cap-maldives-backup.json';
const DESCRIPTION = 'Cap Maldives — sauvegarde chiffrée';
const API = 'https://api.github.com';
const ITERATIONS = 310_000;
const DEBOUNCE_MS = 4000;
const RETRY_MS = 60_000;

export interface SyncConfig {
  token: string;
  gistId?: string;
  /** AES-GCM key: raw bytes derived from the password (base64). */
  keyB64: string;
  /** PBKDF2 salt the key was derived with (base64). */
  saltB64: string;
  /** ISO time of the last successful upload from this phone. */
  lastPush?: string;
  lastRemoteUpdatedAt?: string;
  /** SHA-256 of the data last uploaded, to skip identical uploads. */
  lastHash?: string;
}

interface Payload {
  app: 'cap-maldives';
  v: 1;
  updatedAt: string;
  salt: string;
  iv: string;
  data: string;
}

export type SyncState = 'off' | 'idle' | 'syncing' | 'ok' | 'error';
export interface SyncStatus {
  state: SyncState;
  message?: string;
  lastPush?: string;
  /** updatedAt of a newer backup (another phone / older install) that differs from this phone's data. */
  remoteNewer?: string;
}

/** French, user-facing error. */
export class SyncError extends Error {}
/** A backup already exists on this GitHub account (setup refuses to silently start a second one). */
export class BackupExistsError extends SyncError {
  constructor(readonly updatedAt: string) {
    super('Une sauvegarde existe déjà sur ton GitHub.');
  }
}

// ---------- config ----------

export function readSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as SyncConfig;
    return c && typeof c.token === 'string' && typeof c.keyB64 === 'string' && typeof c.saltB64 === 'string' ? c : null;
  } catch {
    return null;
  }
}

function writeConfig(c: SyncConfig | null) {
  try {
    if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CFG_KEY);
  } catch { /* storage unavailable */ }
}

export const syncConfigured = () => readSyncConfig() !== null;

// ---------- base64 / crypto ----------

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** PBKDF2-SHA256 → 32 raw key bytes. */
export async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, 256);
  return new Uint8Array(bits);
}

const aesKey = (raw: Uint8Array<ArrayBuffer>) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

export async function encrypt(plain: string, keyRaw: Uint8Array<ArrayBuffer>, saltB64: string): Promise<Payload> {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyRaw), new TextEncoder().encode(plain));
  return { app: 'cap-maldives', v: 1, updatedAt: new Date().toISOString(), salt: saltB64, iv: toB64(iv), data: toB64(new Uint8Array(ct)) };
}

export async function decrypt(p: Payload, keyRaw: Uint8Array<ArrayBuffer>): Promise<string> {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(p.iv) }, await aesKey(keyRaw), fromB64(p.data));
    return new TextDecoder().decode(pt);
  } catch {
    throw new SyncError('Mot de passe incorrect.');
  }
}

/** Secrets that travel only inside the encrypted backup (never in the plain export). */
interface Secrets { garminKey?: string }
const localSecrets = (): Secrets => {
  const k = readGarminKey();
  return k ? { garminKey: k } : {};
};

/** store.exportJSON() + secrets: the plaintext that gets encrypted. */
function backupPlaintext(): string {
  const data = JSON.parse(store.exportJSON());
  const secrets = localSecrets();
  if (secrets.garminKey) data.secrets = secrets;
  return JSON.stringify(data, null, 2);
}

/** Fingerprint of the app data (without the export timestamp). */
async function hashOf(data: { profile: unknown; days: unknown; favorites: unknown; secrets?: Secrets }): Promise<string> {
  const secrets = data.secrets?.garminKey ? { garminKey: data.secrets.garminKey } : undefined;
  const json = JSON.stringify({ profile: data.profile, days: data.days, favorites: data.favorites, ...(secrets ? { secrets } : {}) });
  return toB64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))));
}
const localHash = () => hashOf({ ...store.state, secrets: localSecrets() });

// ---------- GitHub REST ----------

export interface GistFile { filename?: string; content?: string; truncated?: boolean; raw_url?: string }
export interface Gist { id: string; updated_at: string; files: Record<string, GistFile | null> }

/** GitHub REST call with the user's token (French SyncError on failure; `status` set on 403/404). */
export async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      cache: 'no-store',
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError('Pas de connexion avec GitHub. Réessaie quand tu as du réseau.');
  }
  if (res.ok) return (await res.json()) as T;
  if (res.status === 401) throw new SyncError('GitHub refuse ce code : il est peut-être expiré ou mal copié.');
  if (res.status === 403 || res.status === 404) {
    const e = new SyncError('Ce code n’a pas le droit d’écrire des Gists. Vérifie la permission « Gists : Read and write ».');
    (e as SyncError & { status?: number }).status = res.status;
    throw e;
  }
  throw new SyncError(`GitHub a refusé la demande (erreur ${res.status}). Réessaie plus tard.`);
}

const cleanToken = (t: string) => t.trim().replace(/^Bearer\s+/i, '');

/** Most recently updated gist holding `file` (default: the backup file), if any. */
export async function findGist(token: string, file = FILE): Promise<Gist | null> {
  const list = await gh<Gist[]>(token, '/gists?per_page=100');
  const hits = list.filter((g) => g.files && Object.keys(g.files).includes(file));
  hits.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return hits[0] ?? null;
}

/** Text of a gist file (follows raw_url when GitHub truncated it). Null when absent. */
export async function gistFileText(token: string, gist: Gist, file: string): Promise<string | null> {
  const f = gist.files?.[file];
  if (!f) return null;
  if (f.truncated && f.raw_url) {
    try {
      const r = await fetch(f.raw_url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!r.ok) throw new Error();
      return await r.text();
    } catch {
      throw new SyncError('Impossible de télécharger le fichier complet. Réessaie.');
    }
  }
  return f.content ?? '';
}

async function readPayload(token: string, gistId: string): Promise<Payload> {
  const g = await gh<Gist>(token, `/gists/${encodeURIComponent(gistId)}`);
  const text = await gistFileText(token, g, FILE);
  if (text === null) throw new SyncError('La sauvegarde est introuvable dans ce Gist.');
  let p: Payload;
  try { p = JSON.parse(text); } catch { throw new SyncError('La sauvegarde sur GitHub est illisible.'); }
  if (!p || p.app !== 'cap-maldives' || !p.salt || !p.iv || !p.data) throw new SyncError('Ce Gist ne contient pas une sauvegarde de l’app.');
  return p;
}

/** Encrypt the current data and create/update the gist. Returns the updated config (not saved). */
async function upload(cfg: SyncConfig, keepalive = false): Promise<SyncConfig> {
  const hash = await localHash();
  const payload = await encrypt(backupPlaintext(), fromB64(cfg.keyB64), cfg.saltB64);
  const content = JSON.stringify(payload);
  const files = { [FILE]: { content } };
  // keepalive (page going to background) is limited to ~64 KB bodies.
  const ka = keepalive && content.length < 60_000 ? { keepalive: true } : {};
  let gist: Gist | null = null;
  if (cfg.gistId) {
    try {
      gist = await gh<Gist>(cfg.token, `/gists/${encodeURIComponent(cfg.gistId)}`, { method: 'PATCH', body: JSON.stringify({ description: DESCRIPTION, files }), ...ka });
    } catch (e) {
      // The gist was deleted on GitHub: start a new one.
      if (!((e as { status?: number }).status === 404)) throw e;
    }
  }
  if (!gist) {
    gist = await gh<Gist>(cfg.token, '/gists', { method: 'POST', body: JSON.stringify({ description: DESCRIPTION, public: false, files }), ...ka });
  }
  return { ...cfg, gistId: gist.id, lastPush: payload.updatedAt, lastRemoteUpdatedAt: payload.updatedAt, lastHash: hash };
}

// ---------- status ----------

let status: SyncStatus = initialStatus();
const listeners = new Set<() => void>();

function initialStatus(): SyncStatus {
  const c = readSyncConfig();
  return c ? { state: 'idle', lastPush: c.lastPush } : { state: 'off' };
}

function setStatus(next: Partial<SyncStatus>, replace = false) {
  status = replace ? (next as SyncStatus) : { ...status, ...next };
  listeners.forEach((fn) => fn());
}

export const syncStatus = (): SyncStatus => status;
export function onSyncStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- push ----------

let timer: number | undefined;
let retryTimer: number | undefined;
let retried = false;
let inflight: Promise<void> | null = null;
let again = false;
/** Pending local changes not uploaded yet. */
let dirty = false;
/** Set when the stored backup is newer than this phone's: auto-upload waits for the user's choice. */
let holdAuto = false;

/**
 * Upload now. `force` uploads even if nothing changed and overrides a "newer backup exists" hold.
 * Resolves when done; never throws (see syncStatus()).
 */
export function pushNow(opts: { force?: boolean; keepalive?: boolean } = {}): Promise<void> {
  if (inflight) { again = true; return inflight; }
  inflight = (async () => {
    const cfg = readSyncConfig();
    if (!cfg) { setStatus({ state: 'off' }, true); return; }
    if (opts.force) { holdAuto = false; setStatus({ remoteNewer: undefined }); }
    if (holdAuto) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      dirty = true;
      setStatus({ state: 'error', message: 'Hors ligne : la sauvegarde partira au retour du réseau.' });
      return;
    }
    if (!opts.force && cfg.gistId && cfg.lastHash && cfg.lastHash === (await localHash())) {
      dirty = false;
      setStatus({ state: 'ok', message: undefined, lastPush: cfg.lastPush });
      return;
    }
    setStatus({ state: 'syncing', message: undefined });
    try {
      const next = await upload(cfg, opts.keepalive);
      if (readSyncConfig()) writeConfig(next); // not if disabled meanwhile
      dirty = false;
      retried = false;
      setStatus({ state: 'ok', message: undefined, lastPush: next.lastPush });
    } catch (e) {
      dirty = true;
      setStatus({ state: 'error', message: e instanceof Error ? e.message : 'Sauvegarde impossible.' });
      if (!retried) {
        retried = true;
        clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => void pushNow(), RETRY_MS);
      }
    }
  })().finally(() => {
    inflight = null;
    if (again) { again = false; schedule(); }
  });
  return inflight;
}

function schedule() {
  if (!readSyncConfig()) return;
  dirty = true;
  clearTimeout(timer);
  timer = window.setTimeout(() => { timer = undefined; void pushNow(); }, DEBOUNCE_MS);
}

// ---------- setup / restore / disable ----------

/**
 * Turn the backup on: check the token, derive a key with a new salt, create the gist and upload.
 * Throws BackupExistsError when a backup is already there (unless `createNew`).
 */
export async function setupSync(tokenIn: string, password: string, opts: { createNew?: boolean } = {}): Promise<void> {
  const token = cleanToken(tokenIn);
  if (!token) throw new SyncError('Colle ton code GitHub.');
  if (password.length < 8) throw new SyncError('Le mot de passe doit faire au moins 8 caractères.');
  const existing = await findGist(token); // also checks the token
  if (existing && !opts.createNew) throw new BackupExistsError(existing.updated_at);
  const salt = rand(16);
  const cfg: SyncConfig = { token, keyB64: toB64(await deriveKey(password, salt)), saltB64: toB64(salt) };
  setStatus({ state: 'syncing', message: undefined, remoteNewer: undefined });
  const next = await upload(cfg);
  writeConfig(next);
  holdAuto = false;
  dirty = false;
  setStatus({ state: 'ok', lastPush: next.lastPush }, true);
}

async function applyBackup(cfg: SyncConfig, payload: Payload, keyRaw: Uint8Array<ArrayBuffer>) {
  const plain = await decrypt(payload, keyRaw);
  clearTimeout(timer);
  await store.importJSON(plain);
  try {
    const garminKey = (JSON.parse(plain) as { secrets?: Secrets }).secrets?.garminKey;
    if (isGarminKey(garminKey) && garminKey !== readGarminKey()) writeGarminKey(garminKey);
  } catch { /* already parsed by importJSON */ }
  const next: SyncConfig = {
    ...cfg,
    keyB64: toB64(keyRaw),
    saltB64: payload.salt,
    lastPush: payload.updatedAt,
    lastRemoteUpdatedAt: payload.updatedAt,
    lastHash: await localHash(),
  };
  writeConfig(next);
  clearTimeout(timer); // importJSON scheduled an upload: nothing new to send
  holdAuto = false;
  dirty = false;
  setStatus({ state: 'ok', lastPush: next.lastPush }, true);
}

/** Restore on a fresh install: find the backup, decrypt it with the password, replace local data, keep syncing. */
export async function restoreSync(tokenIn: string, password: string): Promise<void> {
  const token = cleanToken(tokenIn);
  if (!token) throw new SyncError('Colle ton code GitHub.');
  if (!password) throw new SyncError('Tape ton mot de passe de sauvegarde.');
  const gist = await findGist(token);
  if (!gist) throw new SyncError('Aucune sauvegarde trouvée sur ce compte GitHub.');
  const payload = await readPayload(token, gist.id);
  const keyRaw = await deriveKey(password, fromB64(payload.salt));
  await applyBackup({ token, gistId: gist.id, keyB64: '', saltB64: payload.salt }, payload, keyRaw);
}

/** Replace local data with the backup stored on GitHub (already configured: no password needed). */
export async function restoreFromRemote(): Promise<void> {
  const cfg = readSyncConfig();
  if (!cfg) throw new SyncError('La sauvegarde automatique n’est pas activée.');
  const gistId = cfg.gistId ?? (await findGist(cfg.token))?.id;
  if (!gistId) throw new SyncError('Aucune sauvegarde trouvée sur ce compte GitHub.');
  const payload = await readPayload(cfg.token, gistId);
  if (payload.salt !== cfg.saltB64) {
    throw new SyncError('Cette sauvegarde a un autre mot de passe : désactive puis « Restaurer une sauvegarde existante ».');
  }
  await applyBackup({ ...cfg, gistId }, payload, fromB64(cfg.keyB64));
}

/** Forget the token and key on this phone. The gist stays on GitHub. */
export function disableSync() {
  clearTimeout(timer);
  clearTimeout(retryTimer);
  writeConfig(null);
  holdAuto = false;
  dirty = false;
  setStatus({ state: 'off' }, true);
}

/**
 * Is the backup on GitHub newer than this phone's last upload, with different data?
 * Sets status.remoteNewer (and holds auto-upload so it isn't overwritten). Never throws.
 */
export async function checkRemoteNewer(): Promise<string | null> {
  const cfg = readSyncConfig();
  if (!cfg?.gistId) return null;
  try {
    const p = await readPayload(cfg.token, cfg.gistId);
    if (cfg.lastPush && p.updatedAt <= cfg.lastPush) return null;
    let differs = true;
    if (p.salt === cfg.saltB64) {
      try {
        const remote = JSON.parse(await decrypt(p, fromB64(cfg.keyB64)));
        differs = (await hashOf(remote)) !== (await localHash());
      } catch { /* other key: can't compare, assume different */ }
    }
    if (!differs) {
      writeConfig({ ...cfg, lastPush: p.updatedAt, lastRemoteUpdatedAt: p.updatedAt, lastHash: await localHash() });
      return null;
    }
    holdAuto = true;
    setStatus({ remoteNewer: p.updatedAt, lastPush: cfg.lastPush });
    return p.updatedAt;
  } catch {
    return null;
  }
}

// ---------- start ----------

let started = false;

/** Call once at app start: auto-upload on store changes, on going to background and when back online. */
export function startSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  store.subscribe(schedule);
  onGarminKey(schedule); // a new Garmin key goes into the encrypted backup
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && (timer !== undefined || dirty) && readSyncConfig()) {
      clearTimeout(timer);
      timer = undefined;
      void pushNow({ keepalive: true });
    }
  });
  window.addEventListener('online', () => { if (dirty) void pushNow(); });
  if (readSyncConfig()) {
    void checkRemoteNewer().then((newer) => { if (!newer) void pushNow(); });
  }
}

// ---------- reminder (manual export or sync) ----------

export function readLastExport(): string | null {
  try {
    const v = localStorage.getItem(LAST_EXPORT_KEY);
    return v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  } catch {
    return null;
  }
}

/** Sync off, some data, and no export for more than 7 days. */
export function backupReminderDue(): boolean {
  if (syncConfigured() || !store.profile.onboarded) return false;
  const last = readLastExport();
  return last === null || daysBetween(last, today()) > 7;
}

/** One-line Today banner (empty array when not due). */
export function syncReminder(onClick: () => void): HTMLElement[] {
  if (!backupReminderDue()) return [];
  return [h('button', { type: 'button', class: 'sync-nudge', onclick: onClick },
    h('span', null, 'Pense à activer la sauvegarde automatique'), h('span', { 'aria-hidden': 'true' }, '›'))];
}
