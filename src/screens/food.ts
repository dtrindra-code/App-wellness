// "Repas" screen, in sections: TON BUDGET (kcal-left bubble, details folded) · TES REPAS (one row
// per slot, "Ajouter un aliment" prominent) · DES IDÉES (swipeable cards) · TES FAVORIS (folded).
// Adding goes through the food search (screens/food-search.ts): bundled foods + Open Food Facts +
// barcode. Favorites, HelloFresh, photo and manual entry stay as "Autres options".

import type { Screen } from './types';
import type { FavoriteMeal, Meal, MealSlot, MealSource } from '../types';
import { store, uid } from '../store';
import {
  h, screenTitle, bar, openSheet, toast, field, segmented, pickImage, parseNum, fmtInt,
  sectionTitle, infoRow, carousel, tipCard, disclosure, keyBubble, ICON,
} from '../lib/ui';
import type { Sheet } from '../lib/ui';
import { today, addDays, fmtLong, range } from '../lib/dates';
import { phaseOn, targets, totals } from '../lib/nutrition';
import { aiImagesAvailable, askJSON, aiErrorMessage } from '../lib/ai';
import { adviceFor, cycleOn, cycleSettings } from '../lib/cycle';
import type { PhaseAdvice } from '../lib/cycle';
import { getFood } from '../lib/foods';
import { openFoodSearch, openMealQuantity } from './food-search';
import { openSlipSheet } from './slip';

// ---------- transient UI state ----------
let selectedDate = today();
/** Day the screen last rendered: when the app resumes on a new day, jump back to today. */
let lastNow = selectedDate;
let aiImages = false;
void aiImagesAvailable().then((v) => { aiImages = v; }).catch(() => { aiImages = false; });

// ---------- constants & small helpers ----------
const SLOTS: MealSlot[] = ['petit-dej', 'dejeuner', 'collation', 'diner'];
const SLOT_LABEL: Record<MealSlot, string> = {
  'petit-dej': 'Petit-déj',
  dejeuner: 'Déjeuner',
  collation: 'Collation',
  diner: 'Dîner',
};

function defaultSlot(): MealSlot {
  const d = new Date();
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 630) return 'petit-dej';
  if (m < 900) return 'dejeuner';
  if (m < 1080) return 'collation';
  return 'diner';
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const fmtG = (n: number) => r1(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** Positive finite number or undefined. */
function pos(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseNum(v) : undefined;
  return n !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function numInput(value: number | undefined, placeholder = ''): HTMLInputElement {
  return h('input', {
    type: 'text',
    inputMode: 'decimal',
    value: value === undefined ? '' : String(value).replace('.', ','),
    placeholder,
    autocomplete: 'off',
  });
}

/** Self-refreshing segmented control. */
function segPicker<T extends string>(options: { value: T; label: string }[], initial: T, onChange?: (v: T) => void) {
  let value = initial;
  const wrap = h('div');
  const draw = () => wrap.replaceChildren(segmented(options, value, (v) => { value = v; draw(); onChange?.(v); }));
  draw();
  return { el: wrap, get: () => value };
}

const slotOptions = () => SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }));

/** Button that needs a second tap within 4 s to run `action`. */
function twoTap(label: string, confirmLabel: string, action: () => void, cls = 'btn danger'): HTMLButtonElement {
  let armed = false;
  let timer: number | undefined;
  const btn = h('button', {
    class: cls,
    type: 'button',
    onclick: (e: Event) => {
      e.stopPropagation();
      if (armed) { clearTimeout(timer); action(); return; }
      armed = true;
      btn.textContent = confirmLabel;
      timer = window.setTimeout(() => { armed = false; btn.textContent = label; }, 4000);
    },
  }, label);
  return btn;
}

function macroLine(m: { kcal: number; protein?: number; carbs?: number; fat?: number }): string {
  const parts = [`${fmtInt(m.kcal)} kcal`];
  if (m.protein !== undefined) parts.push(`${fmtG(m.protein)} g prot`);
  if (m.carbs !== undefined) parts.push(`${fmtG(m.carbs)} g gluc`);
  if (m.fat !== undefined) parts.push(`${fmtG(m.fat)} g lip`);
  return parts.join(' · ');
}

interface MealValues { name: string; kcal: number; protein?: number; carbs?: number; fat?: number }

function cleanValues(v: MealValues, mult = 1): MealValues {
  const out: MealValues = { name: v.name.trim(), kcal: Math.round(v.kcal * mult) };
  if (v.protein !== undefined) out.protein = r1(v.protein * mult);
  if (v.carbs !== undefined) out.carbs = r1(v.carbs * mult);
  if (v.fat !== undefined) out.fat = r1(v.fat * mult);
  return out;
}

async function addMeal(date: string, slot: MealSlot, v: MealValues, source: MealSource) {
  const meal: Meal = { id: uid(), slot, source, ...cleanValues(v) };
  await store.updateDay(date, (d) => { d.meals.push(meal); });
}

/** Add or update a favorite by name (case-insensitive). */
function saveFavorite(v: MealValues, hellofresh = false) {
  const c = cleanValues(v);
  const favs = store.state.favorites.slice();
  const i = favs.findIndex((f) => f.name.trim().toLowerCase() === c.name.toLowerCase());
  const fav: FavoriteMeal = { id: i >= 0 ? favs[i].id : uid(), ...c };
  if (hellofresh || (i >= 0 && favs[i].hellofresh)) fav.hellofresh = true;
  if (i >= 0) favs[i] = fav; else favs.push(fav);
  void store.saveFavorites(favs);
}

/** Editable meal form: name, kcal, macros, optional slot. */
function mealForm(initial: Partial<MealValues>, slot?: MealSlot) {
  const name = h('input', { type: 'text', value: initial.name ?? '', placeholder: 'Ex. Salade de poulet', autocomplete: 'off' });
  const kcal = numInput(initial.kcal, '450');
  const protein = numInput(initial.protein, '—');
  const carbs = numInput(initial.carbs, '—');
  const fat = numInput(initial.fat, '—');
  const err = h('p', { class: 'small tone-bad', role: 'alert' });
  const slotPick = slot ? segPicker(slotOptions(), slot) : null;
  const el = h('div', { class: 'stack' },
    field('Nom', name),
    field('Calories (kcal)', kcal),
    h('div', { class: 'grid-3' },
      field('Protéines g', protein),
      field('Glucides g', carbs),
      field('Lipides g', fat),
    ),
    slotPick ? field('Moment', slotPick.el) : null,
    err,
  );
  const read = (): MealValues | null => {
    err.textContent = '';
    const k = parseNum(kcal.value);
    if (k === undefined || k <= 0 || k > 5000) { err.textContent = 'Indique les calories, par ex. 450.'; kcal.focus(); return null; }
    const v: MealValues = { name: name.value.trim() || 'Repas', kcal: k };
    const p = pos(protein.value); if (p !== undefined) v.protein = p;
    const c = pos(carbs.value); if (c !== undefined) v.carbs = c;
    const f = pos(fat.value); if (f !== undefined) v.fat = f;
    return v;
  };
  return { el, read, slot: () => slotPick?.get() ?? slot ?? defaultSlot() };
}

// ---------- ideas ----------
interface Idea extends MealValues { lowCarb: boolean }
const IDEAS: Idea[] = [
  { name: 'Skyr + fruits rouges', kcal: 180, protein: 17, carbs: 18, fat: 1, lowCarb: true },
  { name: 'Omelette 3 œufs + salade', kcal: 270, protein: 19, carbs: 4, fat: 20, lowCarb: true },
  { name: 'Poulet, légumes rôtis', kcal: 360, protein: 36, carbs: 20, fat: 14, lowCarb: true },
  { name: 'Pomme + 20 amandes', kcal: 220, protein: 5.5, carbs: 24, fat: 12, lowCarb: true },
  { name: 'Thon, pois chiches, crudités', kcal: 330, protein: 36, carbs: 22, fat: 8, lowCarb: true },
  { name: 'Saumon, haricots verts', kcal: 320, protein: 29, carbs: 9, fat: 18, lowCarb: true },
  { name: 'Fromage blanc 0 % + cannelle', kcal: 100, protein: 15, carbs: 8, fat: 0.5, lowCarb: true },
  { name: 'Blanc de dinde + concombre', kcal: 100, protein: 17, carbs: 4, fat: 2, lowCarb: true },
  { name: 'Riz, poulet, brocoli', kcal: 480, protein: 40, carbs: 55, fat: 9, lowCarb: false },
  { name: 'Tartine complète, œuf, avocat', kcal: 330, protein: 14, carbs: 26, fat: 18, lowCarb: false },
];

/** Folate-rich ideas added while trying to conceive (realistic single portions). */
const FOLATE_IDEAS: Idea[] = [
  { name: 'Lentilles, carottes, œuf dur', kcal: 350, protein: 21, carbs: 40, fat: 10, lowCarb: false },
  { name: 'Omelette 2 œufs aux épinards', kcal: 230, protein: 16, carbs: 4, fat: 16, lowCarb: true },
];

function ideasFor(date: string): Idea[] {
  const phase = phaseOn(date, store.profile).id;
  const ttc = cycleSettings(store.profile).ttc;
  const lowCarb = phase === 'lavage' || phase === 'avant';
  const base = lowCarb
    ? IDEAS.filter((i) => i.lowCarb).slice(0, 8)
    // Outside the lavage: a bit more carbs for training, keep protein high.
    : IDEAS.filter((i) => !['Fromage blanc 0 % + cannelle', 'Blanc de dinde + concombre'].includes(i.name)).slice(0, 8);
  if (!ttc) return base;
  return [...FOLATE_IDEAS, ...base];
}

/** Cycle advice for a day (null when tracking is off, pregnant, or no period logged). */
function cycleAdvice(date: string): PhaseAdvice | null {
  const p = store.profile;
  const cs = cycleSettings(p);
  if (!cs.tracking || cs.pregnant) return null;
  const info = cycleOn(date, p, store.state.days);
  return info ? adviceFor(info, p, date) : null;
}

// ---------- AI prompts ----------
const HF_PROMPT =
  'Cette photo montre une fiche recette HelloFresh (en français). Lis le nom de la recette et le tableau ' +
  '« Valeurs nutritionnelles », colonne « par portion » : « Énergie (kcal) », « Protéines », « Glucides », ' +
  '« Matières grasses ». Si la colonne par portion est absente, calcule-la depuis les valeurs pour 100 g et le poids de la portion si indiqué. ' +
  'Réponds uniquement en JSON : {"name": string, "kcal": number, "protein": number, "carbs": number, "fat": number} ' +
  '(grammes, nombres sans unité, kcal par portion). Si une valeur est illisible, mets null.';

const PLATE_PROMPT =
  'Cette photo montre une assiette ou un repas. Identifie le plat et estime une portion réaliste pour une personne, ' +
  'telle qu’elle apparaît sur la photo (tiens compte des huiles et sauces visibles). ' +
  'Réponds uniquement en JSON : {"name": string (nom court en français), "kcal": number, "protein": number, "carbs": number, "fat": number, ' +
  '"confidence": "faible" | "moyenne" | "bonne"} (grammes, nombres sans unité). C’est une estimation.';

interface AiMeal { name?: string; kcal?: number | string | null; protein?: number | string | null; carbs?: number | string | null; fat?: number | string | null; confidence?: string }

// ---------- add sheet ----------

function openAddSheet(date: string, preferred?: MealSlot) {
  const slot0 = (): MealSlot => preferred ?? defaultSlot();
  const view = h('div', { class: 'stack' });
  let controller: AbortController | null = null;
  const sheet: Sheet = openSheet('Autres façons d’ajouter', view, { onClose: () => controller?.abort() });
  const done = (msg: string) => { sheet.close(); toast(msg); };

  const back = () => h('button', { class: 'btn ghost sm', type: 'button', style: 'align-self:flex-start', onclick: showHome }, '‹ Retour');

  function showHome() {
    // a) favorites
    const search = h('input', { type: 'search', placeholder: 'Chercher un favori', autocomplete: 'off', class: 'input' });
    const list = h('div', { class: 'list' });
    const drawList = () => {
      const q = search.value.trim().toLowerCase();
      const favs = store.state.favorites
        .filter((f) => !q || f.name.toLowerCase().includes(q))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      if (!store.state.favorites.length) {
        list.replaceChildren(h('p', { class: 'empty' }, 'Pas encore de favori. Scanne une fiche HelloFresh ou enregistre un repas.'));
        return;
      }
      if (!favs.length) { list.replaceChildren(h('p', { class: 'empty' }, 'Aucun favori ne correspond.')); return; }
      list.replaceChildren(...favs.slice(0, 30).map((f) =>
        h('button', { class: 'list-row', type: 'button', style: 'background:none;border-left:0;border-right:0;border-top:0;text-align:left;cursor:pointer;width:100%', onclick: () => showPick(f) },
          h('div', { class: 'main' },
            h('div', { class: 'title' }, f.name),
            h('div', { class: 'sub' }, macroLine(f)),
          ),
          f.hellofresh ? h('span', { class: 'chip accent' }, 'HelloFresh') : null,
        )));
    };
    search.addEventListener('input', drawList);
    drawList();

    const sections: HTMLElement[] = [
      h('button', {
        class: 'btn primary block', type: 'button',
        onclick: () => { sheet.close(); openSearch(date, preferred); },
      }, 'Chercher un aliment ou scanner'),
      h('section', { class: 'stack' }, h('div', { class: 'eyebrow' }, 'Favoris & HelloFresh'), search, list),
    ];

    // b) photo
    if (aiImages) {
      sections.push(h('section', { class: 'stack' },
        h('div', { class: 'eyebrow' }, 'Photo'),
        h('div', { class: 'grid-2' },
          h('button', { class: 'btn', type: 'button', onclick: () => void runPhoto('hellofresh') }, 'Fiche HelloFresh'),
          h('button', { class: 'btn', type: 'button', onclick: () => void runPhoto('plate') }, 'Photo de l’assiette'),
        ),
      ));
    }

    // c) manual
    sections.push(h('section', { class: 'stack' },
      h('div', { class: 'eyebrow' }, 'Manuel'),
      h('button', { class: 'btn block', type: 'button', onclick: () => showManual({}) }, 'Saisir à la main'),
    ));

    // ideas
    const ideas = ideasFor(date);
    sections.push(h('section', { class: 'stack' },
      h('div', { class: 'eyebrow' }, 'Idées'),
      h('div', { class: 'list' }, ideas.map((i) =>
        h('button', {
          class: 'list-row', type: 'button',
          style: 'background:none;border-left:0;border-right:0;border-top:0;text-align:left;cursor:pointer;width:100%',
          onclick: () => {
            const slot = slot0();
            void addMeal(date, slot, i, 'manuel');
            done(`${i.name} ajouté · ${SLOT_LABEL[slot]}`);
          },
        },
          h('div', { class: 'main' },
            h('div', { class: 'title' }, i.name),
            h('div', { class: 'sub' }, `${fmtG(i.protein ?? 0)} g prot`),
          ),
          h('span', { class: 'num small' }, `${fmtInt(i.kcal)} kcal`),
        ))),
    ));

    view.replaceChildren(...sections);
  }

  function showPick(f: FavoriteMeal) {
    const preview = h('p', { class: 'small muted' });
    const mult = segPicker([
      { value: '0.5', label: '½ portion' },
      { value: '1', label: '1 portion' },
      { value: '1.5', label: '1,5 portion' },
    ], '1', () => drawPreview());
    const slot = segPicker(slotOptions(), slot0());
    const drawPreview = () => { preview.textContent = macroLine(cleanValues(f, Number(mult.get()))); };
    drawPreview();
    view.replaceChildren(
      back(),
      h('div', { class: 'stack', style: 'gap:4px' }, h('h3', null, f.name), preview),
      field('Moment', slot.el),
      field('Portion', mult.el),
      h('button', {
        class: 'btn primary block', type: 'button',
        onclick: () => {
          void addMeal(date, slot.get(), cleanValues(f, Number(mult.get())), f.hellofresh ? 'hellofresh' : 'favori');
          done(`Ajouté · ${SLOT_LABEL[slot.get()]}`);
        },
      }, 'Ajouter'),
    );
  }

  function showManual(initial: Partial<MealValues>) {
    const form = mealForm(initial, slot0());
    const favBox = h('input', { type: 'checkbox' });
    view.replaceChildren(
      back(),
      form.el,
      h('label', { class: 'row small' }, favBox, 'Enregistrer dans mes favoris'),
      h('button', {
        class: 'btn primary block', type: 'button',
        onclick: () => {
          const v = form.read();
          if (!v) return;
          void addMeal(date, form.slot(), v, 'manuel');
          if (favBox.checked) saveFavorite(v);
          done(`Ajouté · ${SLOT_LABEL[form.slot()]}`);
        },
      }, 'Ajouter'),
    );
  }

  function showError(msg: string, kind: 'hellofresh' | 'plate') {
    view.replaceChildren(
      back(),
      h('p', { class: 'small' }, msg || 'L’analyse a été annulée.'),
      h('div', { class: 'grid-2' },
        h('button', { class: 'btn', type: 'button', onclick: () => void runPhoto(kind) }, 'Réessayer'),
        h('button', { class: 'btn', type: 'button', onclick: () => showManual({}) }, 'Saisir à la main'),
      ),
    );
  }

  async function runPhoto(kind: 'hellofresh' | 'plate') {
    const file = await pickImage();
    if (!file) return;
    controller?.abort();
    controller = new AbortController();
    const ctl = controller;
    view.replaceChildren(
      h('p', { class: 'empty' }, kind === 'hellofresh' ? 'Je lis la fiche…' : 'J’estime ton assiette…'),
      h('button', { class: 'btn block', type: 'button', onclick: () => { ctl.abort(); showManual({}); } }, 'Annuler et saisir à la main'),
    );
    try {
      const res = await askJSON<AiMeal>(kind === 'hellofresh' ? HF_PROMPT : PLATE_PROMPT, file, ctl.signal);
      if (ctl.signal.aborted) return;
      const kcal = pos(res?.kcal);
      const initial: Partial<MealValues> = {
        name: typeof res?.name === 'string' ? res.name.trim().slice(0, 80) : '',
        kcal: kcal !== undefined ? Math.round(kcal) : undefined,
      };
      const p = pos(res?.protein); if (p !== undefined) initial.protein = r1(p);
      const c = pos(res?.carbs); if (c !== undefined) initial.carbs = r1(c);
      const f = pos(res?.fat); if (f !== undefined) initial.fat = r1(f);
      showConfirm(kind, initial, typeof res?.confidence === 'string' ? res.confidence : undefined);
    } catch (e) {
      if (ctl.signal.aborted) return;
      showError(aiErrorMessage(e), kind);
    }
  }

  function showConfirm(kind: 'hellofresh' | 'plate', initial: Partial<MealValues>, confidence?: string) {
    const form = mealForm(initial, preferred ?? (kind === 'hellofresh' ? 'diner' : defaultSlot()));
    const favBox = h('input', { type: 'checkbox', checked: kind === 'hellofresh' });
    const note = kind === 'hellofresh'
      ? (initial.kcal === undefined ? 'Je n’ai pas réussi à lire les calories. Complète à la main.' : 'Vérifie les valeurs par portion avant d’ajouter.')
      : `C’est une estimation${confidence ? ` (confiance ${confidence})` : ''}. Ajuste si besoin.`;
    view.replaceChildren(
      back(),
      h('p', { class: 'small muted' }, note),
      form.el,
      h('label', { class: 'row small' }, favBox, 'Enregistrer dans mes favoris'),
      h('button', {
        class: 'btn primary block', type: 'button',
        onclick: () => {
          const v = form.read();
          if (!v) return;
          void addMeal(date, form.slot(), v, kind === 'hellofresh' ? 'hellofresh' : 'photo');
          if (favBox.checked) saveFavorite(v, kind === 'hellofresh');
          done(`Ajouté · ${SLOT_LABEL[form.slot()]}`);
        },
      }, 'Ajouter'),
    );
  }

  showHome();
}

// ---------- edit sheet ----------

function openEditSheet(date: string, meal: Meal) {
  const form = mealForm(meal, meal.slot);
  const wrap = h('div', { class: 'stack' });
  const sheet = openSheet('Modifier le repas', wrap);
  wrap.append(
    form.el,
    h('button', {
      class: 'btn primary block', type: 'button',
      onclick: () => {
        const v = form.read();
        if (!v) return;
        const slot = form.slot();
        const c = cleanValues(v);
        void store.updateDay(date, (d) => {
          const i = d.meals.findIndex((m) => m.id === meal.id);
          if (i >= 0) {
            const next: Meal = { id: meal.id, source: meal.source, slot, ...c };
            if (meal.grams !== undefined) next.grams = meal.grams;
            if (meal.foodId) next.foodId = meal.foodId;
            if (meal.offCode) next.offCode = meal.offCode;
            d.meals[i] = next;
          }
        });
        sheet.close();
        toast('Enregistré');
      },
    }, 'Enregistrer'),
    h('button', {
      class: 'btn block', type: 'button',
      onclick: () => {
        const v = form.read();
        if (!v) return;
        saveFavorite(v, meal.source === 'hellofresh');
        toast('Ajouté à tes favoris');
      },
    }, 'Enregistrer en favori'),
    twoTap('Supprimer', 'Confirmer la suppression', () => {
      void store.updateDay(date, (d) => { d.meals = d.meals.filter((m) => m.id !== meal.id); });
      sheet.close();
      toast('Supprimé');
    }, 'btn danger block'),
  );
}

// ---------- screen ----------

export const renderFood: Screen = (root) => {
  const now = today();
  if (now !== lastNow) { selectedDate = now; lastNow = now; }
  if (selectedDate > now) selectedDate = now;
  const date = selectedDate;

  root.append(
    h('header', { class: 'screen-head' },
      screenTitle('Repas'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => openSearch(date) }, 'Ajouter'),
    ),
    dayNav(date, now),
    sectionTitle('Ton budget'),
    summaryCard(date),
    sectionTitle(date === now ? 'Tes repas du jour' : 'Tes repas'),
    mealsCard(date),
    sectionTitle('Des idées'),
    ideasCarousel(date),
    sectionTitle('Tes favoris'),
    favoritesCard(),
  );
};

function dayNav(date: string, now: string): HTMLElement {
  const label = date === now ? 'Aujourd’hui' : date === addDays(now, -1) ? 'Hier' : fmtLong(date);
  return h('nav', { class: 'day-nav', 'aria-label': 'Choisir le jour' },
    h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Jour précédent', onclick: () => { selectedDate = addDays(date, -1); rerender(); } }, '‹'),
    h('span', { class: 'label' }, label),
    h('button', {
      class: 'btn-icon', type: 'button', 'aria-label': 'Jour suivant', disabled: date >= now,
      style: date >= now ? 'opacity:0.35' : undefined,
      onclick: () => { if (date < now) { selectedDate = addDays(date, 1); rerender(); } },
    }, '›'),
  );
}

/** Re-render the current screen after a local UI change (no store change involved). */
function rerender() {
  const root = document.getElementById('screen');
  if (!root) return;
  const y = window.scrollY;
  root.replaceChildren();
  renderFood(root, { go: () => {} });
  window.scrollTo(0, y);
}

function summaryCard(date: string): HTMLElement {
  const p = store.profile;
  const day = store.getDay(date);
  const weight = store.weightOn(date);
  const advice = cycleAdvice(date);
  const adjust = advice?.kcalAdjust ?? 0;
  const t = targets(date, p, weight, day, adjust);
  // What the cycle really added once the floor is applied.
  const cycleExtra = adjust > 0 ? t.kcal - targets(date, p, weight, day).kcal : 0;
  const eaten = totals(day);
  const rest = Math.round(t.budget - eaten.kcal);
  const over = rest < 0;
  const phase = phaseOn(date, p);

  const barRow = (label: string, value: string, ratio: number, tone: 'accent' | 'good' | 'warn') =>
    h('div', { class: 'td-mini' },
      h('div', { class: 'td-mini-top' }, h('span', { style: 'font-weight:700' }, label), h('span', { class: 'num muted' }, value)),
      bar(ratio, tone),
    );

  const protRatio = t.protein ? eaten.protein / t.protein : 0;
  const side: HTMLElement[] = [
    barRow('Calories', `${fmtInt(eaten.kcal)} / ${fmtInt(t.budget)}`, t.budget ? eaten.kcal / t.budget : 0, over ? 'warn' : 'accent'),
    barRow('Protéines', `${fmtG(eaten.protein)} / ${fmtInt(t.protein)} g`, protRatio, protRatio >= 1 ? 'good' : 'accent'),
  ];
  if (t.carbsMax !== undefined) {
    side.push(barRow('Glucides', `${fmtG(eaten.carbs)} / ${fmtInt(t.carbsMax)} g max`, eaten.carbs / t.carbsMax, eaten.carbs > t.carbsMax ? 'warn' : 'accent'));
  }

  return h('section', { class: 'card ux solo' },
    h('div', { class: 'td-energy' },
      keyBubble(fmtInt(Math.abs(rest)), 'kcal', over ? 'en plus' : 'restantes', over ? 'warn' : 'pink'),
      h('div', { class: 'td-energy-side' }, side),
    ),
    over ? h('p', { class: 'small muted', style: 'text-align:center' }, 'Pas grave, on lisse sur la semaine.') : null,
    h('p', { class: 'small muted num', style: 'text-align:center' },
      `Mangé ${fmtInt(eaten.kcal)} kcal sur ${fmtInt(t.budget)}`,
      t.sportBonus > 0 ? ` · dont +${fmtInt(t.sportBonus)} sport` : '',
      cycleExtra > 0 ? ` · +${fmtInt(cycleExtra)} cycle` : ''),
    disclosure('Voir le détail', () => [
      h('p', { class: 'small muted num' }, `Lipides ${fmtG(eaten.fat)} g · glucides ${fmtG(eaten.carbs)} g.`),
      weekLine(date),
      infoRow({ icon: ICON.plane, title: phase.label, detail: phase.hint }),
      advice ? infoRow({ icon: ICON.cycle, title: advice.label, detail: advice.food }) : null,
    ], 'food-budget'),
  );
}

const SLOT_ICON: Record<MealSlot, string> = {
  'petit-dej': ICON.sun,
  dejeuner: ICON.fork,
  collation: ICON.leaf,
  diner: ICON.moon,
};

function mealsCard(date: string): HTMLElement {
  const day = store.getDay(date);
  const slots = SLOTS.map((slot) => {
    const meals = day.meals.filter((m) => m.slot === slot);
    const kcal = meals.reduce((a, m) => a + (m.kcal || 0), 0);
    return h('div', { class: 'food-slot' },
      infoRow({
        icon: SLOT_ICON[slot],
        title: SLOT_LABEL[slot],
        detail: meals.length ? h('span', { class: 'num' }, `${fmtInt(kcal)} kcal`) : 'Rien de noté',
        trail: h('button', {
          class: 'btn-icon food-add', type: 'button', 'aria-label': `Ajouter : ${SLOT_LABEL[slot]}`,
          onclick: () => openSearch(date, slot),
        }, '+'),
      }),
      meals.length
        ? h('div', { class: 'list food-meals' }, meals.map((m) =>
            h('button', { class: 'list-row food-meal', type: 'button', onclick: () => editMeal(date, m) },
              h('span', { class: 'main' },
                h('span', { class: 'title' }, m.name),
                mealSub(m) ? h('span', { class: 'sub' }, mealSub(m)) : null,
              ),
              h('span', { class: 'num' }, `${fmtInt(m.kcal || 0)}`, h('span', { class: 'muted small' }, ' kcal')),
            )))
        : null,
    );
  });
  return h('section', { class: 'card ux solo' },
    slots,
    h('button', { class: 'btn primary block food-big', type: 'button', onclick: () => openSearch(date) }, 'Ajouter un aliment'),
    h('div', { class: 'grid-2 food-alt' },
      h('button', { class: 'btn', type: 'button', onclick: () => openSearch(date, undefined, true) }, 'Scanner'),
      h('button', { class: 'btn', type: 'button', onclick: () => openAddSheet(date) }, 'Autres options'),
    ),
    !day.meals.length && date !== today() ? h('p', { class: 'small muted', style: 'text-align:center' }, 'Rien de noté ce jour-là.') : null,
    h('button', { class: 'food-slip', type: 'button', onclick: () => openSlipSheet(date) }, 'J’ai craqué'),
  );
}

/** Food search first; favorites / HelloFresh / manual stay one tap away. */
function openSearch(date: string, slot?: MealSlot, scan = false) {
  openFoodSearch(date, slot, { scan, onMore: () => openAddSheet(date, slot) });
}

/** Meals from the food search open on their quantity; others on the full form. */
function editMeal(date: string, m: Meal) {
  if (m.grams && m.grams > 0) openMealQuantity(date, m, () => openEditSheet(date, m));
  else openEditSheet(date, m);
}

/** "150 g · 12 g prot" under a meal. */
function mealSub(m: Meal): string {
  const parts: string[] = [];
  if (m.grams) parts.push(`${fmtInt(m.grams)} ${getFood(m.foodId)?.liquid ? 'ml' : 'g'}`);
  if (m.protein !== undefined) parts.push(`${fmtG(m.protein)} g prot`);
  return parts.join(' · ');
}

function weekLine(date: string): HTMLElement | null {
  const days = range(addDays(date, -6), date)
    .map((d) => store.getDay(d))
    .filter((d) => d.meals.length);
  if (!days.length) return null;
  const avg = days.reduce((s, d) => s + totals(d).kcal, 0) / days.length;
  return h('p', { class: 'small muted' },
    'Moyenne 7 j : ', h('span', { class: 'num' }, fmtInt(avg)), ' kcal / jour',
    days.length < 7 ? ` (${days.length} j notés)` : '',
  );
}

/** One swipeable card per idea; "En savoir plus" shows the macros and adds it to a slot. */
function ideasCarousel(date: string): HTMLElement {
  const cards = ideasFor(date).map((i) => tipCard({
    icon: i.lowCarb ? ICON.leaf : ICON.fork,
    title: i.name,
    text: `${fmtInt(i.kcal)} kcal · ${fmtG(i.protein ?? 0)} g de protéines`,
    more: () => openIdeaSheet(date, i),
  }));
  return carousel(cards, 'food-ideas');
}

function openIdeaSheet(date: string, i: Idea) {
  const slot = segPicker(slotOptions(), defaultSlot());
  const sheet = openSheet(i.name, h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, macroLine(i)),
    h('p', { class: 'small' }, FOLATE_IDEAS.includes(i) ? 'Riche en folates : un bon choix en essai bébé.' : i.lowCarb ? 'Peu de glucides, riche en protéines.' : 'Un peu plus de glucides pour les jours d’entraînement.'),
    field('Moment', slot.el),
    h('button', {
      class: 'btn primary block', type: 'button',
      onclick: () => {
        void addMeal(date, slot.get(), i, 'manuel');
        sheet.close();
        toast(`${i.name} ajouté · ${SLOT_LABEL[slot.get()]}`);
      },
    }, 'Ajouter'),
  ));
}

function favoritesCard(): HTMLElement {
  const favs = store.state.favorites.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const hf = favs.filter((f) => f.hellofresh).length;
  return h('section', { class: 'card ux solo' },
    infoRow({
      icon: ICON.heart,
      title: favs.length ? `${favs.length} repas favori${favs.length > 1 ? 's' : ''}` : 'Pas encore de favori',
      detail: favs.length ? (hf ? `dont ${hf} HelloFresh` : 'Prêts à ajouter en un geste') : 'Scanne une fiche HelloFresh ou enregistre un repas.',
    }),
    favs.length
      ? disclosure('Voir mes favoris', () => h('div', { class: 'list' }, favs.map((f) =>
          h('div', { class: 'list-row' },
            h('div', { class: 'main' },
              h('div', { class: 'title' }, f.name),
              h('div', { class: 'sub' }, macroLine(f)),
            ),
            f.hellofresh ? h('span', { class: 'chip accent' }, 'HelloFresh') : null,
            twoTap('Retirer', 'Confirmer', () => {
              void store.saveFavorites(store.state.favorites.filter((x) => x.id !== f.id));
              toast('Favori retiré');
            }, 'btn sm danger'),
          ))), 'food-favs')
      : null,
  );
}
