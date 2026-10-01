// The "clé Garmin": a random AES-GCM 256 key generated on the phone. The user copies it
// (base64) into the repo secret GARMIN_SYNC_KEY; scripts/garmin/sync.py encrypts the Garmin
// data with it and the app decrypts it (lib/garmin.ts).
// Kept in this browser's localStorage and inside the ENCRYPTED backup (lib/sync.ts), never in
// the plain JSON export. Separate module so sync.ts and garmin.ts can both use it.

const KEY_LS = 'cap-maldives:garminKey';

/** Base64 of the 32 key bytes, or null. */
export function readGarminKey(): string | null {
  try {
    const v = localStorage.getItem(KEY_LS);
    return v && isGarminKey(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeGarminKey(b64: string | null) {
  try {
    if (b64) localStorage.setItem(KEY_LS, b64);
    else localStorage.removeItem(KEY_LS);
  } catch { /* storage unavailable */ }
  listeners.forEach((fn) => fn());
}

export function isGarminKey(b64: unknown): b64 is string {
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(b64)) return false;
  try { return atob(b64).length === 32; } catch { return false; }
}

/** New random key (replaces the old one: the GitHub secret must then be updated). */
export function generateGarminKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  const b64 = btoa(s);
  writeGarminKey(b64);
  return b64;
}

const listeners = new Set<() => void>();
/** Called when the key changes (generated, restored from the backup). */
export function onGarminKey(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
