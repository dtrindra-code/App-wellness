// Open Food Facts client (free, open database of packaged products; CORS allowed).
// Only the search words or the barcode are sent to openfoodfacts.org: never any personal data.
// A small cache of recent products (localStorage) lets recents work offline.

import type { Per100 } from './foods';

export interface OffProduct extends Per100 {
  code: string;
  name: string;
  brand?: string;
  /** Serving size in grams when the label gives one. */
  servingG?: number;
  /** Serving label from the package, e.g. "1 pot (125 g)". */
  servingLabel?: string;
  image?: string;
}

/** Error with a friendly French message (shown as is). */
export class OffError extends Error {
  constructor(message: string, readonly kind: 'offline' | 'timeout' | 'network' | 'server') {
    super(message);
    this.name = 'OffError';
  }
}

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_fr,brands,nutriments,serving_size,serving_quantity,image_front_small_url';
const TIMEOUT_MS = 8000;
const CACHE_KEY = 'cap-maldives:off-cache';
const CACHE_MAX = 80;

// ---------- parsing ----------

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Turn a raw OFF product into our shape; null when it has no usable name or energy. */
export function parseProduct(raw: unknown): OffProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const n = (p.nutriments && typeof p.nutriments === 'object' ? p.nutriments : {}) as Record<string, unknown>;
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === undefined) {
    const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
    if (kj !== undefined) kcal = kj / 4.184;
  }
  const name = String(p.product_name_fr || p.product_name || '').trim();
  const code = String(p.code ?? '').trim();
  if (kcal === undefined || !name || !code) return null;
  const out: OffProduct = {
    code,
    name: name.slice(0, 80),
    kcal: Math.round(kcal),
    protein: r1(num(n['proteins_100g']) ?? 0),
    carbs: r1(num(n['carbohydrates_100g']) ?? 0),
    fat: r1(num(n['fat_100g']) ?? 0),
  };
  const fiber = num(n['fiber_100g']);
  if (fiber !== undefined) out.fiber = r1(fiber);
  const brand = String(p.brands ?? '').split(',')[0]?.trim();
  if (brand) out.brand = brand.slice(0, 40);
  const sq = num(p.serving_quantity);
  if (sq !== undefined && sq > 0 && sq <= 2000) {
    out.servingG = Math.round(sq);
    const ss = String(p.serving_size ?? '').trim();
    out.servingLabel = ss && ss.length <= 40 ? `1 portion (${ss})` : `1 portion (${out.servingG} g)`;
  }
  if (typeof p.image_front_small_url === 'string' && p.image_front_small_url.startsWith('https://')) out.image = p.image_front_small_url;
  return out;
}

// ---------- fetch helper ----------

async function getJSON(url: string, signal?: AbortSignal): Promise<unknown> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new OffError('Tu es hors ligne : je cherche seulement dans les aliments courants.', 'offline');
  }
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new OffError('Open Food Facts ne répond pas pour l’instant. Réessaie dans un moment.', 'server');
    return await res.json();
  } catch (e) {
    if (e instanceof OffError) throw e;
    if (signal?.aborted) throw e; // caller cancelled: let it know, it will ignore it
    if (timedOut) throw new OffError('Open Food Facts met trop de temps à répondre. Réessaie, ou choisis un aliment courant.', 'timeout');
    throw new OffError('Connexion impossible à Open Food Facts. Vérifie ton réseau.', 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** True when the error comes from the caller's own abort (ignore it). */
export function isAbort(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError';
}

// ---------- API ----------

/** Search packaged products by words (French products first). */
export async function searchProducts(query: string, signal?: AbortSignal): Promise<OffProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&lc=fr&cc=fr&fields=${FIELDS}`;
  const data = (await getJSON(url, signal)) as { products?: unknown[] } | null;
  const seen = new Set<string>();
  const out: OffProduct[] = [];
  for (const raw of data?.products ?? []) {
    const p = parseProduct(raw);
    if (p && !seen.has(p.code)) { seen.add(p.code); out.push(p); }
  }
  return out;
}

/** Look up one product by barcode. Null when unknown (or without nutrition values). Cached products answer offline. */
export async function getProduct(barcode: string, signal?: AbortSignal): Promise<OffProduct | null> {
  const code = barcode.replace(/\D/g, '');
  if (!code) return null;
  const cached = cachedProduct(code);
  if (cached) return cached;
  const data = (await getJSON(`${BASE}/api/v2/product/${code}.json?fields=${FIELDS}`, signal)) as { status?: number; product?: Record<string, unknown> } | null;
  if (!data || data.status !== 1 || !data.product) return null;
  const p = parseProduct({ ...data.product, code: data.product.code ?? code });
  if (p) rememberProduct(p);
  return p;
}

// ---------- cache ----------

function readCache(): OffProduct[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.code === 'string' && typeof p.kcal === 'number') : [];
  } catch {
    return [];
  }
}

/** A product seen recently (search result chosen or barcode), if cached on this device. */
export function cachedProduct(code: string): OffProduct | undefined {
  return readCache().find((p) => p.code === code);
}

/** Keep a product for offline recents (most recent first, capped). */
export function rememberProduct(p: OffProduct): void {
  try {
    const list = [p, ...readCache().filter((x) => x.code !== p.code)].slice(0, CACHE_MAX);
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: fine */
  }
}
