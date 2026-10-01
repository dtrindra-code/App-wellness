// Round-trip check of the Garmin file format between scripts/garmin/sync.py (Python,
// cryptography AESGCM) and the app (WebCrypto AES-GCM, src/lib/garmin.ts).
// Fictional data only. Run: node scripts/garmin/crypto-test.mjs (python3 with cryptography;
// PYTHON=/path/to/venv/bin/python to pick another interpreter).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const { subtle } = globalThis.crypto;
const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

const keyRaw = globalThis.crypto.getRandomValues(new Uint8Array(32)); // like "Générer ma clé Garmin"
const keyB64 = b64(keyRaw);
const sample = { days: { '2026-10-01': { sleepH: 7.2, bodyBattery: 64, stress: 31, restingHr: 58, steps: 9120 } },
  activities: [{ id: '1', date: '2026-10-01', time: '07:30', type: 'running', minutes: 32, distanceKm: 5.1 }], note: 'é ’ — ok' };

const py = (code, input) => execFileSync(process.env.PYTHON || 'python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(here)}); import sync\n${code}`],
  { input, encoding: 'utf-8' });

// 1. Python encrypts → WebCrypto decrypts.
const payload = JSON.parse(py(
  'k = sync.parse_key(sys.argv[1] if len(sys.argv) > 1 else sys.stdin.readline().strip()); obj = json.loads(sys.stdin.read()); print(json.dumps(sync.encrypt_json(obj, k, "peps-garmin")))',
  `${keyB64}\n${JSON.stringify(sample)}`));
if (payload.app !== 'peps-garmin' || payload.v !== 1 || unb64(payload.iv).length !== 12) throw new Error('bad envelope');
const key = await subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['encrypt', 'decrypt']);
const plain = new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.data)));
if (JSON.stringify(JSON.parse(plain)) !== JSON.stringify(sample)) throw new Error('python → webcrypto mismatch');
console.log('python → WebCrypto : ok');

// 2. WebCrypto encrypts → Python decrypts (same envelope).
const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(sample))));
const env = { app: 'peps-garmin', v: 1, updatedAt: new Date().toISOString(), iv: b64(iv), data: b64(ct) };
const back = py('k = sync.parse_key(sys.stdin.readline().strip()); p = json.loads(sys.stdin.read()); print(json.dumps(sync.decrypt_json(p, k, "peps-garmin")))',
  `${keyB64}\n${JSON.stringify(env)}`);
if (JSON.stringify(JSON.parse(back)) !== JSON.stringify(sample)) throw new Error('webcrypto → python mismatch');
console.log('WebCrypto → python : ok');

// 3. Wrong key → None (no crash).
const wrong = b64(globalThis.crypto.getRandomValues(new Uint8Array(32)));
const none = py('k = sync.parse_key(sys.stdin.readline().strip()); p = json.loads(sys.stdin.read()); print(json.dumps(sync.decrypt_json(p, k, "peps-garmin")))',
  `${wrong}\n${JSON.stringify(env)}`);
if (none.trim() !== 'null') throw new Error('wrong key should give null');
console.log('mauvaise clé → ignorée : ok');
