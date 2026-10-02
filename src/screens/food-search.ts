// Food search sheet: THE fast way to log what you eat, without typing any number.
//   search view   — big field, "Scanner un code-barres", Fréquents / Récents before typing,
//                   then "Aliments courants" (bundled, instant, offline) + "Produits (Open Food Facts)".
//   quantity view — portion chips + grams stepper, live kcal/protein, moment → Ajouter (or continue).
//   scan view     — live camera (getUserMedia) decoded with @zxing/library (or the native
//                   BarcodeDetector when present), fallbacks: photo of the barcode, typing the digits.
// Only the search words or the barcode go to Open Food Facts; nothing personal leaves the phone.

import type { FavoriteMeal, Meal, MealSlot } from '../types';
import { store, uid } from '../store';
import { h, openSheet, toast, segmented, fmtInt, parseNum, keyBubble } from '../lib/ui';
import type { Sheet } from '../lib/ui';
import { FOOD_CATEGORY_LABEL, getFood, nutrientsFor, searchFoods } from '../lib/foods';
import type { Food, Nutrients, Per100, Portion } from '../lib/foods';
import { cachedProduct, getProduct, isAbort, OffError, rememberProduct, searchProducts } from '../lib/off';
import type { OffProduct } from '../lib/off';
import type DecodeHintTypeT from '@zxing/library/esm/core/DecodeHintType';

// ---------- small helpers ----------

const SLOTS: MealSlot[] = ['petit-dej', 'dejeuner', 'collation', 'diner'];
const SLOT_LABEL: Record<MealSlot, string> = {
  'petit-dej': 'Petit-déj',
  dejeuner: 'Déjeuner',
  collation: 'Collation',
  diner: 'Dîner',
};

/** Moment of the day from the clock (same cut-offs as the Repas screen). */
export function slotForNow(d = new Date()): MealSlot {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 630) return 'petit-dej';
  if (m < 900) return 'dejeuner';
  if (m < 1080) return 'collation';
  return 'diner';
}

/** "au déjeuner", "à la collation"… */
const SLOT_TO: Record<MealSlot, string> = {
  'petit-dej': 'au petit-déj',
  dejeuner: 'au déjeuner',
  collation: 'à la collation',
  diner: 'au dîner',
};

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** Something the user can pick: a generic food, an OFF product, or a past meal. */
interface Pick {
  key: string;
  name: string;
  /** Category or brand. */
  sub?: string;
  per100: Per100;
  portions: Portion[];
  defaultG: number;
  liquid?: boolean;
  foodId?: string;
  offCode?: string;
  product?: OffProduct;
  image?: string;
}

function fromFood(f: Food): Pick {
  return {
    key: `f:${f.id}`, name: f.name, sub: FOOD_CATEGORY_LABEL[f.category], per100: f,
    portions: f.portions, defaultG: f.portions[0]?.grams ?? 100, liquid: f.liquid, foodId: f.id,
  };
}

function fromProduct(p: OffProduct): Pick {
  const portions: Portion[] = [];
  if (p.servingG) portions.push({ label: p.servingLabel ?? `1 portion (${p.servingG} g)`, grams: p.servingG });
  return {
    key: `o:${p.code}`, name: p.name, sub: p.brand, per100: p, portions,
    defaultG: p.servingG ?? 100, offCode: p.code, product: p, image: p.image,
  };
}

/** Rebuild a pick from a logged meal (bundled food, cached product, or the meal's own values). */
function fromMeal(m: Meal): Pick | null {
  const f = getFood(m.foodId);
  if (f) return { ...fromFood(f), defaultG: m.grams ?? f.portions[0]?.grams ?? 100 };
  const p = m.offCode ? cachedProduct(m.offCode) : undefined;
  if (p) return { ...fromProduct(p), defaultG: m.grams ?? p.servingG ?? 100 };
  if (!m.grams || m.grams <= 0) return null;
  const k = 100 / m.grams;
  return {
    key: m.offCode ? `o:${m.offCode}` : `m:${m.name}`,
    name: m.name,
    per100: { kcal: m.kcal * k, protein: (m.protein ?? 0) * k, carbs: (m.carbs ?? 0) * k, fat: (m.fat ?? 0) * k },
    portions: [{ label: `Comme la dernière fois (${fmtInt(m.grams)} g)`, grams: m.grams }],
    defaultG: m.grams,
    offCode: m.offCode,
  };
}

function mealFrom(pick: Pick, grams: number, slot: MealSlot): Meal {
  const n = nutrientsFor(pick.per100, grams);
  const meal: Meal = {
    id: uid(), slot, source: 'aliment',
    name: pick.sub && pick.offCode && !pick.name.includes(pick.sub) ? `${pick.name} (${pick.sub})` : pick.name,
    grams: Math.round(grams), ...n,
  };
  if (pick.foodId) meal.foodId = pick.foodId;
  if (pick.offCode) meal.offCode = pick.offCode;
  return meal;
}

const unit = (p: Pick) => (p.liquid ? 'ml' : 'g');

/** Past meals with a food id or barcode: frequents (≥ 2 times) then recents, newest first. */
function history(): { frequents: Meal[]; recents: Meal[] } {
  const days = Object.values(store.state.days).sort((a, b) => b.date.localeCompare(a.date));
  const latest = new Map<string, Meal>();
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const d of days) {
    for (const m of d.meals.slice().reverse()) {
      const key = m.foodId ? `f:${m.foodId}` : m.offCode ? `o:${m.offCode}` : null;
      if (!key) continue;
      if (!latest.has(key)) { latest.set(key, m); order.push(key); }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const frequents = order
    .filter((k) => (counts.get(k) ?? 0) >= 2)
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, 6);
  const fset = new Set(frequents);
  return {
    frequents: frequents.map((k) => latest.get(k)!),
    recents: order.filter((k) => !fset.has(k)).slice(0, 8).map((k) => latest.get(k)!),
  };
}

/** Results of recent OFF searches in this session (going back doesn't refetch). */
const offMemo = new Map<string, OffProduct[]>();

// ---------- barcode decoding ----------

type Decoder = (src: CanvasImageSource, w: number, h: number, crop?: boolean) => Promise<string | null>;

interface NativeDetector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
interface NativeDetectorCtor { new (o: { formats: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> }

let decoderPromise: Promise<Decoder> | null = null;

/** Native BarcodeDetector when it knows EAN (Chrome/Android), else @zxing/library (iOS Safari). */
function getDecoder(): Promise<Decoder> {
  decoderPromise ??= (async (): Promise<Decoder> => {
    const BD = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
    if (BD) {
      try {
        const formats = (await BD.getSupportedFormats?.()) ?? [];
        if (formats.includes('ean_13')) {
          const det = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((f) => formats.includes(f)) });
          return async (src) => {
            try { return (await det.detect(src))[0]?.rawValue ?? null; } catch { return null; }
          };
        }
      } catch { /* fall back to zxing */ }
    }
    // Deep imports: only the 1D (EAN/UPC) readers get bundled, not the whole library.
    const [
      { default: DecodeHintType }, { default: BarcodeFormat }, { default: MultiFormatOneDReader },
      { default: BinaryBitmap }, { default: HybridBinarizer }, { default: RGBLuminanceSource },
    ] = await Promise.all([
      import('@zxing/library/esm/core/DecodeHintType'),
      import('@zxing/library/esm/core/BarcodeFormat'),
      import('@zxing/library/esm/core/oned/MultiFormatOneDReader'),
      import('@zxing/library/esm/core/BinaryBitmap'),
      import('@zxing/library/esm/core/common/HybridBinarizer'),
      import('@zxing/library/esm/core/RGBLuminanceSource'),
    ]);
    const Z = { BinaryBitmap, HybridBinarizer, RGBLuminanceSource };
    const hints = new Map<DecodeHintTypeT, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new MultiFormatOneDReader(hints);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const decodeCanvas = (): string | null => {
      if (!ctx) return null;
      const { width, height } = canvas;
      const img = ctx.getImageData(0, 0, width, height).data;
      const lum = new Uint8ClampedArray(width * height);
      for (let i = 0, j = 0; j < lum.length; i += 4, j++) lum[j] = (img[i] * 77 + img[i + 1] * 150 + img[i + 2] * 29) >> 8;
      try {
        const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(lum, width, height)));
        return reader.decode(bmp, hints).getText();
      } catch {
        return null;
      } finally {
        reader.reset();
      }
    };
    return async (src, w, hgt, crop) => {
      if (!ctx || !w || !hgt) return null;
      // Live camera: only the band inside the frame (faster, fewer false reads).
      const sx = crop ? w * 0.08 : 0, sy = crop ? hgt * 0.28 : 0;
      const sw = crop ? w * 0.84 : w, sh = crop ? hgt * 0.44 : hgt;
      const scale = Math.min(1, (crop ? 720 : 1280) / sw);
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const found = decodeCanvas();
      if (found || crop) return found;
      // Photo: also try it turned a quarter (barcode shot vertically).
      canvas.width = Math.round(sh * scale);
      canvas.height = Math.round(sw * scale);
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, canvas.height, canvas.width);
      ctx.restore();
      return decodeCanvas();
    };
  })();
  decoderPromise.catch(() => { decoderPromise = null; });
  return decoderPromise;
}

async function decodeFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const decode = await getDecoder();
    return await decode(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** EAN-8/12/13/14 digits (UPC-A has 12). */
const validCode = (s: string) => /^\d{8}$|^\d{12,14}$/.test(s);

// ---------- the sheet ----------

export interface FoodSearchOpts {
  /** Start on the barcode scanner. */
  scan?: boolean;
  /** Link to the other ways of adding (favorites, HelloFresh, manual). */
  onMore?: () => void;
}

/** Open the food search sheet for `date` (moment defaults to the time of day). */
export function openFoodSearch(date: string, slot?: MealSlot, opts: FoodSearchOpts = {}): void {
  let currentSlot: MealSlot = slot ?? slotForNow();
  let query = '';
  const added: Meal[] = [];
  let offCtl: AbortController | null = null;
  let lookupCtl: AbortController | null = null;
  let debounce: number | undefined;
  let stopCamera: () => void = () => {};

  const view = h('div', { class: 'stack fs' });
  const sheet: Sheet = openSheet('Ajouter un aliment', view, {
    onClose: () => { offCtl?.abort(); lookupCtl?.abort(); clearTimeout(debounce); stopCamera(); },
  });
  sheet.el.closest('.sheet')?.classList.add('fs-sheet');

  const leave = () => { stopCamera(); stopCamera = () => {}; offCtl?.abort(); lookupCtl?.abort(); clearTimeout(debounce); };

  const slotSeg = (onChange?: () => void) => {
    const wrap = h('div');
    const draw = () => wrap.replaceChildren(segmented(SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] })), currentSlot, (v) => {
      currentSlot = v; draw(); onChange?.();
    }));
    draw();
    return wrap;
  };

  async function add(pick: Pick, grams: number): Promise<Meal> {
    const meal = mealFrom(pick, grams, currentSlot);
    if (pick.product) rememberProduct(pick.product);
    added.push(meal);
    await store.updateDay(date, (d) => { d.meals.push(meal); });
    return meal;
  }

  const back = () => h('button', { class: 'btn ghost sm fs-back', type: 'button', onclick: () => showSearch(true) }, '‹ Retour');

  // ----- search view -----

  function showSearch(refocus = false) {
    leave();
    const input = h('input', {
      type: 'search', class: 'input fs-input', value: query, placeholder: 'Pomme, skyr, pizza…',
      autocomplete: 'off', enterKeyHint: 'search', 'aria-label': 'Chercher un aliment',
    });
    const results = h('div', { class: 'stack fs-results', 'aria-live': 'polite' });
    const basket = h('div');

    input.addEventListener('input', () => { query = input.value; drawResults(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); clearTimeout(debounce); runOff(query.trim()); }
    });

    const drawBasket = () => basket.replaceChildren(added.length ? basketCard() : '');

    function row(pick: Pick, detail: string, quickG?: number): HTMLElement {
      return h('div', { class: 'fs-row' },
        h('button', { class: 'fs-row-main', type: 'button', onclick: () => showQuantity(pick) },
          pick.image ? h('img', { class: 'fs-thumb', src: pick.image, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }) : null,
          h('span', { class: 'main' },
            h('span', { class: 'title' }, pick.name),
            h('span', { class: 'sub' }, detail),
          ),
        ),
        h('button', {
          class: 'btn-icon fs-quick', type: 'button', 'aria-label': `Ajouter ${pick.name}`,
          onclick: async () => {
            const g = quickG ?? pick.defaultG;
            const meal = await add(pick, g);
            toast(`Ajouté ${SLOT_TO[meal.slot]} · ${fmtInt(g)} ${unit(pick)}`, {
              action: {
                label: 'Annuler',
                run: () => {
                  const i = added.indexOf(meal);
                  if (i >= 0) added.splice(i, 1);
                  void store.updateDay(date, (d) => { d.meals = d.meals.filter((m) => m.id !== meal.id); }).then(drawBasket);
                },
              },
            });
            drawBasket();
          },
        }, '+'),
      );
    }

    const group = (title: string, rows: HTMLElement[], extra?: Node | null) =>
      h('section', { class: 'fs-group' }, h('h3', { class: 'fs-group-title' }, title), h('div', { class: 'list' }, rows), extra ?? null);

    const per100Detail = (pk: Pick) => [pk.sub, `${fmtInt(pk.per100.kcal)} kcal / 100 ${unit(pk)}`].filter(Boolean).join(' · ');
    const portionDetail = (pk: Pick) => {
      const p = pk.portions[0];
      const n = nutrientsFor(pk.per100, pk.defaultG);
      return `${p && p.grams === pk.defaultG ? p.label : `${fmtInt(pk.defaultG)} ${unit(pk)}`} · ${fmtInt(n.kcal)} kcal`;
    };

    const offBox = h('div');

    function drawResults() {
      clearTimeout(debounce);
      offCtl?.abort();
      const q = query.trim();
      if (!q) {
        const { frequents, recents } = history();
        const toRows = (ms: Meal[]) => ms.map((m) => {
          const pk = fromMeal(m);
          return pk ? row(pk, `${fmtInt(pk.defaultG)} ${unit(pk)} · ${fmtInt(nutrientsFor(pk.per100, pk.defaultG).kcal)} kcal`, pk.defaultG) : null;
        }).filter((x): x is HTMLElement => !!x);
        const fr = toRows(frequents), re = toRows(recents);
        results.replaceChildren(
          re.length ? group('Récents', re) : '',
          fr.length ? group('Fréquents', fr) : '',
          !fr.length && !re.length
            ? h('div', { class: 'fs-hint' },
                h('p', null, 'Tape ce que tu as mangé, même approximatif : « pâtes », « yaourt », « kebab »…'),
                h('p', { class: 'muted small' }, 'Ou scanne le code-barres d’un produit. Tes aliments habituels apparaîtront ici.'))
            : '',
        );
        return;
      }
      const local = searchFoods(q, 8).map(fromFood);
      offBox.replaceChildren();
      results.replaceChildren(
        group('Aliments courants', local.length ? local.map((pk) => row(pk, portionDetail(pk))) : [h('p', { class: 'small muted fs-none' }, 'Rien dans les aliments courants.')]),
        offBox,
      );
      if (q.length >= 3) {
        if (offMemo.has(q.toLowerCase())) drawOff(q, offMemo.get(q.toLowerCase())!);
        else {
          drawOffLoading();
          debounce = window.setTimeout(() => runOff(q), 350);
        }
      }
    }

    function drawOffLoading() {
      offBox.replaceChildren(group('Produits (Open Food Facts)', [h('p', { class: 'small muted fs-loading' }, 'Je cherche dans les produits du commerce…')]));
    }

    function drawOff(q: string, list: OffProduct[]) {
      if (query.trim() !== q) return;
      const rows = list.slice(0, 12).map((p) => { const pk = fromProduct(p); return row(pk, per100Detail(pk)); });
      offBox.replaceChildren(group('Produits (Open Food Facts)', rows.length ? rows : [
        h('p', { class: 'small muted fs-none' }, 'Aucun produit trouvé. Essaie avec la marque, ou scanne le code-barres.'),
      ]));
    }

    async function runOff(q: string) {
      if (q.length < 3) return;
      offCtl?.abort();
      const ctl = new AbortController();
      offCtl = ctl;
      drawOffLoading();
      try {
        const list = await searchProducts(q, ctl.signal);
        if (ctl.signal.aborted) return;
        offMemo.set(q.toLowerCase(), list);
        drawOff(q, list);
      } catch (e) {
        if (ctl.signal.aborted || isAbort(e)) return;
        if (query.trim() !== q) return;
        const msg = e instanceof OffError ? e.message : 'La recherche de produits n’a pas marché. Réessaie dans un moment.';
        offBox.replaceChildren(group('Produits (Open Food Facts)', [h('p', { class: 'small muted fs-error' }, msg)],
          h('button', { class: 'btn sm', type: 'button', onclick: () => runOff(q) }, 'Réessayer')));
      }
    }

    view.replaceChildren(
      h('div', { class: 'fs-bar' },
        input,
        h('button', { class: 'btn fs-scan', type: 'button', onclick: showScan }, barcodeIcon(), h('span', null, 'Scanner un code-barres')),
      ),
      h('div', { class: 'fs-slot' }, h('span', { class: 'fs-slot-label' }, 'Pour le'), slotSeg()),
      basket,
      results,
      opts.onMore ? h('button', { class: 'action-link fs-more', type: 'button', onclick: () => { sheet.close(); opts.onMore?.(); } }, 'Favoris, HelloFresh ou saisie à la main') : '',
    );
    drawBasket();
    drawResults();
    // The sheet opened empty, so its own autofocus found nothing: focus the field here.
    if (!query) setTimeout(() => input.focus(), refocus ? 60 : 260);
  }

  function basketCard(): HTMLElement {
    const sum = added.reduce<Nutrients>((t, m) => ({ kcal: t.kcal + m.kcal, protein: t.protein + (m.protein ?? 0), carbs: t.carbs + (m.carbs ?? 0), fat: t.fat + (m.fat ?? 0) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    const favZone = h('div');
    const openFav = () => {
      const name = h('input', { type: 'text', class: 'input', value: added.map((m) => m.name).slice(0, 3).join(' + ').slice(0, 60), 'aria-label': 'Nom du repas favori' });
      favZone.replaceChildren(h('div', { class: 'stack', style: 'gap:8px' },
        name,
        h('button', {
          class: 'btn sm', type: 'button',
          onclick: () => {
            const fav: FavoriteMeal = {
              id: uid(), name: name.value.trim() || 'Mon repas', kcal: Math.round(sum.kcal),
              protein: Math.round(sum.protein * 10) / 10, carbs: Math.round(sum.carbs * 10) / 10, fat: Math.round(sum.fat * 10) / 10,
            };
            void store.saveFavorites([...store.state.favorites, fav]);
            favZone.replaceChildren(h('p', { class: 'small muted' }, 'Enregistré dans tes favoris.'));
          },
        }, 'Enregistrer'),
      ));
    };
    return h('div', { class: 'fs-basket' },
      h('div', { class: 'fs-basket-top' },
        h('span', null, h('b', null, `${added.length} ajouté${added.length > 1 ? 's' : ''}`), ` · ${fmtInt(sum.kcal)} kcal · ${fmt1(sum.protein)} g prot`),
        h('button', { class: 'btn primary sm', type: 'button', onclick: () => sheet.close() }, 'Terminer'),
      ),
      added.length >= 2 ? h('button', { class: 'action-link fs-fav', type: 'button', onclick: openFav }, 'Enregistrer comme repas favori') : null,
      favZone,
    );
  }

  // ----- quantity view -----

  function showQuantity(pick: Pick) {
    leave();
    quantityView(pick, {
      onAdd: async (grams, keepGoing) => {
        const meal = await add(pick, grams);
        toast(`${meal.name} · ${fmtInt(grams)} ${unit(pick)} · ${SLOT_LABEL[currentSlot]}`);
        if (keepGoing) { query = ''; showSearch(true); } else sheet.close();
      },
    });
  }

  function quantityView(pick: Pick, o: { onAdd: (grams: number, keepGoing: boolean) => void | Promise<void> }) {
    let grams = pick.defaultG;
    let chosen: Portion | null = pick.portions.find((p) => p.grams === grams) ?? null;
    /** Portion chip tapped last: a second tap on it adds one more. */
    let lastTap: Portion | null = null;
    const u = unit(pick);
    const portions = [...pick.portions];
    if (!portions.some((p) => p.grams === 100)) portions.push({ label: `100 ${u}`, grams: 100 });

    const gInput = h('input', {
      type: 'text', inputMode: 'decimal', class: 'input fs-grams num', value: String(grams),
      autocomplete: 'off', 'aria-label': `Quantité en ${u === 'ml' ? 'millilitres' : 'grammes'}`,
    });
    const bubble = h('div');
    const macros = h('p', { class: 'small muted fs-macros' });
    const chips = h('div', { class: 'fs-chips' });
    const err = h('p', { class: 'small tone-bad', role: 'alert' });
    const step = pick.defaultG <= 40 ? 5 : 10;

    const drawPreview = () => {
      const n = nutrientsFor(pick.per100, grams > 0 ? grams : 0);
      bubble.replaceChildren(keyBubble(fmtInt(n.kcal), 'kcal', `${fmt1(n.protein)} g de protéines`));
      macros.textContent = `Glucides ${fmt1(n.carbs)} g · lipides ${fmt1(n.fat)} g`;
    };
    const drawChips = () => chips.replaceChildren(...portions.map((p) => {
      const count = chosen === p ? Math.round(grams / p.grams) : 0;
      const on = chosen === p && count >= 1 && Math.abs(grams - count * p.grams) < 0.5;
      return h('button', {
        class: 'fs-chip' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
        onclick: () => {
          // Tap again on the active portion = one more (3 clémentines, 2 tranches…).
          grams = on && lastTap === p ? grams + p.grams : p.grams;
          chosen = p;
          lastTap = p;
          sync();
        },
      }, on && count > 1 ? `${count} × ${p.label}` : p.label);
    }));
    const sync = (fromInput = false) => {
      if (!fromInput) gInput.value = String(Math.round(grams));
      err.textContent = '';
      drawPreview();
      drawChips();
    };
    gInput.addEventListener('input', () => {
      const v = parseNum(gInput.value);
      grams = v !== undefined && v >= 0 ? v : 0;
      chosen = portions.find((p) => grams > 0 && grams % p.grams === 0) ?? null;
      lastTap = null;
      sync(true);
    });
    const nudge = (d: number) => { grams = Math.max(step, Math.round((grams + d) / step) * step); chosen = portions.find((p) => grams % p.grams === 0) ?? null; lastTap = null; sync(); };

    const read = (): number | null => {
      if (!(grams > 0 && grams <= 3000)) { err.textContent = `Indique une quantité, par ex. ${pick.defaultG} ${u}.`; return null; }
      return Math.round(grams);
    };

    view.replaceChildren(
      back(),
      h('div', { class: 'fs-q-head' },
        pick.image ? h('img', { class: 'fs-q-img', src: pick.image, alt: '', referrerPolicy: 'no-referrer' }) : null,
        h('div', { class: 'main' },
          h('h3', { class: 'fs-q-name' }, pick.name),
          h('p', { class: 'small muted' }, [pick.sub, `${fmtInt(pick.per100.kcal)} kcal pour 100 ${u}`].filter(Boolean).join(' · ')),
        ),
      ),
      h('div', { class: 'fs-q-preview' }, bubble, macros),
      h('div', { class: 'stack', style: 'gap:8px' }, h('span', { class: 'field-label' }, 'Combien ?'), chips),
      h('div', { class: 'fs-stepper' },
        h('button', { class: 'btn-icon', type: 'button', 'aria-label': `Moins ${step} ${u}`, onclick: () => nudge(-step) }, '−'),
        h('label', { class: 'fs-grams-wrap' }, gInput, h('span', { class: 'muted' }, u)),
        h('button', { class: 'btn-icon', type: 'button', 'aria-label': `Plus ${step} ${u}`, onclick: () => nudge(step) }, '+'),
      ),
      err,
      h('div', { class: 'stack', style: 'gap:8px' }, h('span', { class: 'field-label' }, 'Moment'), slotSeg()),
      h('button', { class: 'btn primary block food-big', type: 'button', onclick: () => { const g = read(); if (g) void o.onAdd(g, false); } }, 'Ajouter'),
      h('button', { class: 'btn block', type: 'button', onclick: () => { const g = read(); if (g) void o.onAdd(g, true); } }, 'Ajouter et continuer'),
    );
    sync();
  }

  // ----- scan view -----

  function showScan() {
    leave();
    const status = h('p', { class: 'small muted fs-cam-status', role: 'status' }, 'J’ouvre la caméra…');
    const video = h('video', { class: 'fs-video', muted: true, autoplay: true, playsInline: true });
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    const cam = h('div', { class: 'fs-cam' }, video, h('div', { class: 'fs-cam-frame', 'aria-hidden': 'true' }));
    const manual = h('div');

    const photoBtn = h('button', { class: 'btn', type: 'button', onclick: () => void fromPhoto() }, 'Photo du code');
    const typeBtn = h('button', { class: 'btn', type: 'button', onclick: () => showTyping() }, 'Taper le code');

    view.replaceChildren(
      back(),
      cam,
      status,
      h('div', { class: 'grid-2' }, photoBtn, typeBtn),
      manual,
    );

    let active = true;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    stopCamera = () => {
      active = false;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      video.srcObject = null;
    };

    const noCamera = (msg: string) => {
      cam.classList.add('off');
      status.textContent = msg;
    };

    function showTyping() {
      const code = h('input', { type: 'text', inputMode: 'numeric', class: 'input num', placeholder: '3 017 620 422 003', autocomplete: 'off', 'aria-label': 'Chiffres du code-barres' });
      const go = () => {
        const digits = code.value.replace(/\D/g, '');
        if (!validCode(digits)) { status.textContent = 'Le code fait 8 ou 13 chiffres, sous les barres.'; code.focus(); return; }
        void lookup(digits);
      };
      code.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      manual.replaceChildren(h('div', { class: 'fs-type' }, code, h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Chercher')));
      setTimeout(() => code.focus(), 50);
    }

    async function fromPhoto() {
      const file = await pickPhoto();
      if (!file || !active) return;
      status.textContent = 'Je lis le code sur la photo…';
      try {
        const code = await decodeFile(file);
        if (!active) return;
        if (code) void lookup(code);
        else status.textContent = 'Je n’ai pas réussi à lire le code. Rapproche-toi, bien à plat et net, ou tape les chiffres.';
      } catch {
        if (active) status.textContent = 'Je n’ai pas pu ouvrir la photo. Tape les chiffres du code.';
      }
    }

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { noCamera('La caméra n’est pas disponible ici. Prends une photo du code ou tape les chiffres.'); return; }
      try {
        const decoderReady = getDecoder();
        decoderReady.catch(() => {});
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!active) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        video.srcObject = s;
        const decode = await decoderReady;
        if (!active) return;
        await video.play().catch(() => {});
        status.textContent = 'Place le code-barres dans le cadre.';
        const tick = async () => {
          if (!active) return;
          if (video.readyState >= 2 && video.videoWidth) {
            const code = await decode(video, video.videoWidth, video.videoHeight, true);
            if (!active) return;
            if (code && validCode(code)) {
              navigator.vibrate?.(40);
              stopCamera();
              void lookup(code);
              return;
            }
          }
          timer = window.setTimeout(() => void tick(), 160);
        };
        void tick();
      } catch (e) {
        if (!active) return;
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        const name = (e as { name?: string })?.name;
        noCamera(name === 'NotAllowedError'
          ? 'L’accès à la caméra est refusé. Tu peux l’autoriser dans Réglages › Safari › Caméra, ou prendre une photo du code.'
          : 'Je n’arrive pas à ouvrir la caméra. Prends une photo du code ou tape les chiffres.');
      }
    })();
  }

  async function lookup(code: string) {
    leave();
    const ctl = new AbortController();
    lookupCtl = ctl;
    view.replaceChildren(back(), h('p', { class: 'empty' }, 'Je cherche le produit…'), h('p', { class: 'small muted', style: 'text-align:center' }, `Code ${code}`));
    try {
      const p = await getProduct(code, ctl.signal);
      if (ctl.signal.aborted) return;
      if (p) { showQuantity(fromProduct(p)); return; }
      view.replaceChildren(
        back(),
        h('p', { class: 'fs-hint' }, 'Ce produit n’est pas encore dans Open Food Facts (ou sans valeurs nutritionnelles). Cherche un aliment proche par son nom, ça suffit largement.'),
        h('div', { class: 'grid-2' },
          h('button', { class: 'btn', type: 'button', onclick: showScan }, 'Rescanner'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => showSearch(true) }, 'Chercher par nom'),
        ),
      );
    } catch (e) {
      if (ctl.signal.aborted || isAbort(e)) return;
      view.replaceChildren(
        back(),
        h('p', { class: 'fs-hint' }, e instanceof OffError ? e.message : 'La recherche n’a pas marché. Réessaie dans un moment.'),
        h('div', { class: 'grid-2' },
          h('button', { class: 'btn', type: 'button', onclick: () => void lookup(code) }, 'Réessayer'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => showSearch(true) }, 'Chercher par nom'),
        ),
      );
    }
  }

  if (opts.scan) showScan(); else showSearch();
}

/** Change the quantity of a meal added from the food search (or remove it). */
export function openMealQuantity(date: string, meal: Meal, onOther?: () => void): void {
  const pick = fromMeal(meal);
  if (!pick) { onOther?.(); return; }
  let slot: MealSlot = meal.slot;
  const view = h('div', { class: 'stack fs' });
  const sheet = openSheet('Modifier la quantité', view);
  const u = unit(pick);
  let grams = meal.grams ?? pick.defaultG;
  const gInput = h('input', { type: 'text', inputMode: 'decimal', class: 'input fs-grams num', value: String(grams), autocomplete: 'off', 'aria-label': 'Quantité' });
  const bubble = h('div');
  const err = h('p', { class: 'small tone-bad', role: 'alert' });
  const draw = () => bubble.replaceChildren(keyBubble(fmtInt(nutrientsFor(pick.per100, grams).kcal), 'kcal', `${fmt1(nutrientsFor(pick.per100, grams).protein)} g de protéines`));
  gInput.addEventListener('input', () => { const v = parseNum(gInput.value); grams = v !== undefined && v >= 0 ? v : 0; err.textContent = ''; draw(); });
  const step = pick.defaultG <= 40 ? 5 : 10;
  const nudge = (d: number) => { grams = Math.max(step, Math.round((grams + d) / step) * step); gInput.value = String(grams); draw(); };
  const segWrap = h('div');
  const drawSeg = () => segWrap.replaceChildren(segmented(SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] })), slot, (v) => { slot = v; drawSeg(); }));
  drawSeg();
  draw();
  let armed = false;
  const del = h('button', {
    class: 'btn danger block', type: 'button',
    onclick: () => {
      if (!armed) { armed = true; del.textContent = 'Confirmer la suppression'; setTimeout(() => { armed = false; del.textContent = 'Supprimer'; }, 4000); return; }
      void store.updateDay(date, (d) => { d.meals = d.meals.filter((m) => m.id !== meal.id); });
      sheet.close();
      toast('Supprimé');
    },
  }, 'Supprimer');
  view.append(
    h('div', { class: 'main' }, h('h3', { class: 'fs-q-name' }, meal.name), h('p', { class: 'small muted' }, `${fmtInt(pick.per100.kcal)} kcal pour 100 ${u}`)),
    h('div', { class: 'fs-q-preview' }, bubble),
    h('div', { class: 'fs-stepper' },
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': `Moins ${step} ${u}`, onclick: () => nudge(-step) }, '−'),
      h('label', { class: 'fs-grams-wrap' }, gInput, h('span', { class: 'muted' }, u)),
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': `Plus ${step} ${u}`, onclick: () => nudge(step) }, '+'),
    ),
    err,
    h('div', { class: 'stack', style: 'gap:8px' }, h('span', { class: 'field-label' }, 'Moment'), segWrap),
    h('button', {
      class: 'btn primary block', type: 'button',
      onclick: () => {
        if (!(grams > 0 && grams <= 3000)) { err.textContent = `Indique une quantité, par ex. ${pick.defaultG} ${u}.`; return; }
        const n = nutrientsFor(pick.per100, grams);
        void store.updateDay(date, (d) => {
          const i = d.meals.findIndex((m) => m.id === meal.id);
          if (i >= 0) d.meals[i] = { ...d.meals[i], ...n, slot, grams: Math.round(grams) };
        });
        sheet.close();
        toast('Enregistré');
      },
    }, 'Enregistrer'),
    onOther ? h('button', { class: 'action-link', type: 'button', onclick: () => { sheet.close(); onOther(); } }, 'Modifier les valeurs à la main') : '',
    del,
  );
}

// ---------- bits ----------

function pickPhoto(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    input.setAttribute('capture', 'environment');
    input.addEventListener('change', () => { resolve(input.files?.[0] ?? null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

function barcodeIcon(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  for (const d of ['M4 7V5a1 1 0 0 1 1-1h2', 'M17 4h2a1 1 0 0 1 1 1v2', 'M20 17v2a1 1 0 0 1-1 1h-2', 'M7 20H5a1 1 0 0 1-1-1v-2', 'M8 8v8', 'M11 8v8', 'M13.5 8v8', 'M16 8v8']) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}
