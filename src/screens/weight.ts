// "Poids" screen: trend first (7-day average), then chart, input, body comp, history.

import type { Screen } from './types';
import type { BodyComp, DayLog } from '../types';
import { store } from '../store';
import { h, fmtKg, fmtDelta, parseNum, openSheet, toast, field, segmented, pickImage } from '../lib/ui';
import type { Sheet } from '../lib/ui';
import { daysBetween, fmtDayMonth, fmtShort, today } from '../lib/dates';
import { movingAverage, paceBreakdown, slopePerDay } from '../lib/nutrition';
import { cycleOn, cycleSettings } from '../lib/cycle';
import { aiImagesAvailable, askJSON, aiErrorMessage } from '../lib/ai';
import { weightChart } from './weight-chart';
import type { ChartRange } from './weight-chart';

// ---------- transient UI state ----------
let chartRange: ChartRange = 'all';
let confirmDelete: string | null = null;
let aiImages: boolean | null = null;
let importSlot: HTMLElement | null = null;

void aiImagesAvailable().then((v) => {
  aiImages = v;
  if (importSlot && importSlot.isConnected) fillImportSlot(importSlot);
});

// ---------- helpers ----------

/** Current 7-day average (last point of the moving average). */
export function currentAverage(): number | null {
  const ws = store.weights();
  if (!ws.length) return null;
  const ma = movingAverage(ws, 7);
  return ma[ma.length - 1].avg;
}

const fmtWeek = (kgPerWeek: number) => (Math.abs(kgPerWeek) < 0.05 ? 'stable' : `${fmtDelta(kgPerWeek)} kg/sem.`);

function numInput(value: number | undefined, placeholder = ''): HTMLInputElement {
  return h('input', {
    type: 'text',
    inputMode: 'decimal',
    value: value === undefined ? '' : String(value).replace('.', ','),
    placeholder,
    autocomplete: 'off',
  });
}

interface Reading { date: string; weight?: number; body?: BodyComp }

/** Weigh-in form (used for manual entry, editing and import confirmation). */
function weighForm(initial: Reading, sheet: () => Sheet | null, note?: string, moveFrom?: string): HTMLElement {
  const date = h('input', { type: 'date', value: initial.date, max: today() });
  const weight = numInput(initial.weight, fmtKg(store.weightOn(initial.date)));
  const b = initial.body ?? {};
  const fat = numInput(b.fatPct);
  const muscle = numInput(b.musclePct);
  const water = numInput(b.waterPct);
  const visceral = numInput(b.visceral);
  const bmrIn = numInput(b.bmr);
  const hasBody = Object.values(b).some((v) => v !== undefined);
  const err = h('p', { class: 'small tone-bad', role: 'alert' });

  const details = h('details', { open: hasBody },
    h('summary', { class: 'small muted' }, 'Composition corporelle (optionnel)'),
    h('div', { class: 'stack', style: 'margin-top:10px' },
      h('div', { class: 'grid-2' },
        field('Masse grasse %', fat),
        field('Muscle %', muscle),
        field('Eau %', water),
        field('Graisse viscérale', visceral),
      ),
      field('BMR (kcal)', bmrIn),
    ),
  );

  const save = async () => {
    const d = date.value;
    const w = parseNum(weight.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { err.textContent = 'Choisis une date.'; return; }
    if (w === undefined || w < 25 || w > 300) { err.textContent = 'Indique ton poids en kg, par ex. 68,5.'; return; }
    const body: BodyComp = {};
    const put = (k: keyof BodyComp, el: HTMLInputElement) => {
      const n = parseNum(el.value);
      if (n !== undefined) body[k] = n;
    };
    put('fatPct', fat); put('musclePct', muscle); put('waterPct', water); put('visceral', visceral); put('bmr', bmrIn);
    const round1 = (n: number) => Math.round(n * 10) / 10;
    sheet()?.close();
    // Editing an existing weigh-in to another date: move it.
    if (moveFrom && moveFrom !== d) {
      await store.updateDay(moveFrom, (x) => { delete x.weight; delete x.body; });
    }
    await store.updateDay(d, (x: DayLog) => {
      x.weight = round1(w);
      if (Object.keys(body).length) x.body = body;
      else delete x.body;
    });
    toast(`${fmtKg(w)} kg noté`);
  };

  return h('div', { class: 'stack' },
    note ? h('p', { class: 'small muted' }, note) : null,
    h('div', { class: 'grid-2' }, field('Date', date), field('Poids (kg)', weight)),
    details,
    err,
    h('button', { class: 'btn primary block', type: 'button', onclick: save }, 'Enregistrer'),
  );
}

function openWeighSheet(initial?: Reading) {
  let sheet: Sheet | null = null;
  const t = today();
  const start: Reading = initial ?? { date: t, body: undefined, weight: store.getDay(t).weight };
  if (!initial) start.body = store.getDay(t).body;
  sheet = openSheet(initial ? 'Modifier la pesée' : 'Ajouter une pesée', weighForm(start, () => sheet, undefined, initial?.date));
}

// ---------- AI import ----------

interface ScaleJSON {
  date: string | null;
  weight: number | null;
  fatPct: number | null;
  musclePct: number | null;
  waterPct: number | null;
  visceral: number | null;
  bmr: number | null;
}

const SCALE_PROMPT = `Tu lis une capture d'écran d'une application de balance connectée (texte en français ou en anglais).
Read the screenshot of a smart-scale app and return ONLY a JSON object, no prose, with exactly these keys:
{"date": "YYYY-MM-DD" or null, "weight": number or null, "fatPct": number or null, "musclePct": number or null, "waterPct": number or null, "visceral": number or null, "bmr": number or null}
Field mapping:
- weight: "Poids" / "Weight" in kg (e.g. "68.40 kg" -> 68.4). If shown in lb, convert to kg.
- fatPct: "IMG", "Masse grasse", "Graisse corporelle", "Body fat" in % (e.g. "31.5 %" -> 31.5).
- musclePct: "Muscle", "Taux de muscle", "Muscle rate" in % (e.g. 42.0). Not muscle mass in kg.
- waterPct: "Hydratation", "Eau", "Body water" in % (e.g. 50.5).
- visceral: "Graisse viscérale", "Visceral fat" index (e.g. 8).
- bmr: "BMR", "Métabolisme de base" in kcal (e.g. 1450).
- date: the date of the measurement. Dates on screen usually appear as MM/DD (month first, e.g. "03/21" = 21 March). The year is 2026 unless a year is shown. Format YYYY-MM-DD.
Use a dot as decimal separator. Use null for anything not clearly visible. Do not guess, do not add other keys.`;

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') return parseNum(v);
  return undefined;
}

async function importFromScreenshot() {
  const file = await pickImage();
  if (!file) return;
  const ctrl = new AbortController();
  let sheet: Sheet | null = null;
  const body = h('div', { class: 'stack' }, h('p', { class: 'empty' }, 'Lecture…'));
  sheet = openSheet('Importer une pesée', body, { onClose: () => ctrl.abort() });
  try {
    const r = await askJSON<ScaleJSON>(SCALE_PROMPT, file, ctrl.signal);
    const t = today();
    let date = typeof r?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : t;
    if (date > t) date = t;
    const bodyComp: BodyComp = {};
    const set = (k: keyof BodyComp, v: unknown) => { const n = num(v); if (n !== undefined) bodyComp[k] = n; };
    set('fatPct', r?.fatPct); set('musclePct', r?.musclePct); set('waterPct', r?.waterPct); set('visceral', r?.visceral); set('bmr', r?.bmr);
    const w = num(r?.weight);
    const existing = store.getDay(date).weight;
    const note = w === undefined
      ? 'Je n’ai pas trouvé le poids sur l’image. Complète-le à la main.'
      : existing !== undefined
        ? `Vérifie les valeurs. Ça remplacera ${fmtKg(existing)} kg déjà noté ce jour-là.`
        : 'Vérifie les valeurs, puis enregistre.';
    body.replaceChildren(weighForm({ date, weight: w, body: bodyComp }, () => sheet, note));
  } catch (e) {
    const msg = aiErrorMessage(e);
    if (!msg) { sheet.close(); return; }
    body.replaceChildren(
      h('p', { class: 'small' }, msg),
      h('button', {
        class: 'btn block', type: 'button',
        onclick: () => { sheet?.close(); openWeighSheet(); },
      }, 'Saisir à la main'),
    );
  }
}

function fillImportSlot(slot: HTMLElement) {
  slot.replaceChildren(
    aiImages
      ? h('button', { class: 'btn block', type: 'button', onclick: () => void importFromScreenshot() }, 'Importer une capture de la balance')
      : '',
  );
}

// ---------- sections ----------

function header(): HTMLElement {
  const p = store.profile;
  const pregnant = cycleSettings(p).pregnant;
  return h('header', { class: 'screen-head' },
    h('div', null,
      h('p', { class: 'eyebrow' },
        pregnant ? 'Mode grossesse · suivi pour info' : '',
        pregnant ? '' : `Palier ${fmtKg(p.goalWeight)} kg le ${fmtDayMonth(p.goalDate)}`,
        !pregnant && p.finalGoalWeight !== undefined && p.finalGoalWeight < p.goalWeight ? ` · objectif final ${fmtKg(p.finalGoalWeight)} kg` : '',
      ),
      h('h1', null, 'Poids'),
    ),
  );
}

function summary(): HTMLElement {
  const p = store.profile;
  const ws = store.weights();
  const avg = currentAverage();
  // Pregnancy mode: no loss goal anywhere, the numbers stay for information.
  const pregnant = cycleSettings(p).pregnant;
  const stat = (value: string, unit: string, label: string) =>
    h('div', { class: 'stat' }, h('span', { class: 'value' }, value, unit ? h('small', null, unit) : null), h('span', { class: 'label' }, label));

  const card = h('section', { class: 'card' },
    h('div', { class: 'grid-3' },
      stat(fmtKg(avg), 'kg', 'moyenne 7 j'),
      stat(avg === null ? '—' : fmtDelta(avg - p.startWeight), 'kg', 'depuis le départ'),
      pregnant
        ? stat(String(ws.length), '', 'pesées')
        : stat(avg === null ? '—' : fmtKg(Math.max(0, avg - p.goalWeight)), 'kg', 'jusqu’au palier'),
    ),
  );

  const slope = slopePerDay(ws, 14);
  const t = today();
  const daysLeft = daysBetween(t, p.goalDate);
  let sentence: string;
  let chip: HTMLElement | null = null;
  if (pregnant) {
    sentence = slope === null
      ? 'Mode grossesse : pas d’objectif de poids ici. Suis les repères de ta sage-femme ou de ton médecin.'
      : `${fmtWeek(slope * 7)} sur 14 jours · pas d’objectif de perte en mode grossesse.`;
  } else if (avg !== null && avg <= p.goalWeight) {
    sentence = p.finalGoalWeight !== undefined && avg > p.finalGoalWeight
      ? 'Palier atteint. La suite vers l’objectif final se fait tranquillement.'
      : 'Objectif atteint. Maintenant, on garde le cap tranquillement.';
    chip = h('span', { class: 'chip good' }, 'atteint');
  } else if (slope === null) {
    sentence = ws.length
      ? 'Encore quelques pesées pour voir ta vraie tendance (3 sur 14 jours suffisent).'
      : 'Pèse-toi le matin, au réveil : la tendance apparaîtra vite.';
  } else {
    const weekly = slope * 7;
    const required = avg !== null && daysLeft > 0 ? ((p.goalWeight - avg) / daysLeft) * 7 : null;
    sentence = `${fmtWeek(weekly)} sur 14 jours`;
    if (required !== null) {
      sentence += ` · il faut ${fmtWeek(required)}`;
      const onPace = weekly <= required + 0.05;
      chip = h('span', { class: 'chip ' + (onPace ? 'good' : 'warn') }, onPace ? 'dans le rythme' : 'on ajuste doucement');
    }
  }
  card.appendChild(h('div', { class: 'row between wrap' }, h('p', { class: 'small num grow' }, sentence), chip));
  const pace = paceLine(avg);
  if (pace) card.appendChild(h('p', { class: 'small muted' }, pace));
  return card;
}

/** Brisk walking burns roughly 4 kcal per minute (estimate, varies with weight and speed). */
const WALK_KCAL_PER_MIN = 4;
const r10 = (n: number) => Math.round(n / 10) * 10;

/** What the plate covers of the pace still needed to reach the milestone, and what is left for movement. */
function paceLine(avg: number | null): string | null {
  const p = store.profile;
  if (cycleSettings(p).pregnant) return null; // summary() already says there is no loss goal
  const t = today();
  const weight = avg ?? (store.weights().length ? store.weightOn(t) : null);
  const daysLeft = daysBetween(t, p.goalDate);
  if (weight === null || daysLeft <= 0 || weight <= p.goalWeight) return null;
  const required = ((weight - p.goalWeight) / daysLeft) * 7;
  if (required < 0.05) return null;
  const b = paceBreakdown(t, p, weight, required);
  const kg = fmtKg(required);
  if (b.moveKcal < 20) {
    return `Pour tenir ${kg} kg/sem. : ton assiette suffit (~${r10(b.dietDeficit)} kcal/j de déficit, estimation).`;
  }
  const minutes = Math.round(b.moveKcal / WALK_KCAL_PER_MIN / 5) * 5;
  return `Pour tenir ${kg} kg/sem. : ton assiette couvre ~${r10(b.dietDeficit)} kcal/j, le reste (~${r10(b.moveKcal)} kcal/j) vient du mouvement (≈ ${minutes} min de marche rapide, estimation).`;
}

/** Water-retention note when today falls just before the period, or the period is late. */
function retentionNote(): HTMLElement | null {
  const p = store.profile;
  const cs = cycleSettings(p);
  if (!cs.tracking || cs.pregnant) return null;
  const info = cycleOn(today(), p, store.state.days);
  if (!info || (info.phase !== 'premenstruel' && info.phase !== 'retard')) return null;
  return h('p', { class: 'small w-cycle-note' }, 'Rétention d’eau probable ces jours-ci.');
}

function chartCard(): HTMLElement {
  const card = h('section', { class: 'card' });
  const draw = () => {
    card.replaceChildren(
      h('div', { class: 'card-head' }, h('h2', null, 'Tendance'), h('span', { class: 'small muted' }, 'kg')),
      segmented<ChartRange>([{ value: 'all', label: 'Tout' }, { value: '30', label: '30 j' }], chartRange, (v) => {
        chartRange = v;
        draw();
      }),
      weightChart(store.profile, store.weights(), chartRange, store.state.days),
      retentionNote() ?? '',
    );
  };
  draw();
  return card;
}

function actions(): HTMLElement {
  importSlot = h('div', null);
  if (aiImages !== null) fillImportSlot(importSlot);
  return h('div', { class: 'stack' },
    h('button', { class: 'btn primary block', type: 'button', onclick: () => openWeighSheet() }, 'Ajouter une pesée'),
    importSlot,
  );
}

const BODY_FIELDS: { k: keyof BodyComp; label: string; unit: string; better: 'down' | 'up' | null; int?: boolean }[] = [
  { k: 'fatPct', label: 'Masse grasse', unit: '%', better: 'down' },
  { k: 'musclePct', label: 'Muscle', unit: '%', better: 'up' },
  { k: 'waterPct', label: 'Eau', unit: '%', better: null },
  { k: 'visceral', label: 'Viscérale', unit: '', better: 'down', int: true },
  { k: 'bmr', label: 'BMR', unit: 'kcal', better: null, int: true },
];

function bodyCard(): HTMLElement {
  const withBody = Object.values(store.state.days)
    .filter((d) => d.body && Object.values(d.body).some((v) => typeof v === 'number'))
    .sort((a, b) => a.date.localeCompare(b.date));
  const card = h('section', { class: 'card' });
  const latest = withBody[withBody.length - 1];
  const firstB = withBody[0];
  card.appendChild(h('div', { class: 'card-head' },
    h('h2', null, 'Composition'),
    latest ? h('span', { class: 'small muted' }, fmtShort(latest.date)) : null,
  ));
  if (!latest) {
    card.appendChild(h('p', { class: 'small muted' }, 'Pas encore de valeurs. Ajoute-les avec ta prochaine pesée, ou importe une capture.'));
  } else {
    const compare = firstB && firstB.date !== latest.date ? firstB : null;
    const cells = BODY_FIELDS.filter((f) => typeof latest.body![f.k] === 'number').map((f) => {
      const v = latest.body![f.k] as number;
      const val = f.int ? String(Math.round(v)) : fmtKg(v);
      const prev = compare?.body?.[f.k];
      let delta: HTMLElement | null = null;
      if (typeof prev === 'number') {
        const dv = v - prev;
        const good = f.better && ((f.better === 'down' && dv < 0) || (f.better === 'up' && dv > 0));
        const txt = f.int ? (dv > 0 ? '+' : dv < 0 ? '−' : '±') + Math.abs(Math.round(dv)) : fmtDelta(dv);
        delta = h('span', { class: 'small num ' + (good ? 'tone-good' : 'muted') }, txt);
      }
      return h('div', { class: 'stat' },
        h('span', { class: 'value' }, val, f.unit ? h('small', null, f.unit) : null),
        h('span', { class: 'label' }, f.label),
        delta,
      );
    });
    card.appendChild(h('div', { class: 'grid-3' }, cells));
    if (compare) card.appendChild(h('p', { class: 'small muted' }, `Écarts depuis le ${fmtDayMonth(compare.date).replace(/\.$/, "")}`));
  }
  card.appendChild(h('p', { class: 'small muted' }, 'La masse grasse compte plus que le poids.'));
  return card;
}

function historyCard(): HTMLElement {
  const card = h('section', { class: 'card' });
  const draw = () => {
    const ws = store.weights();
    const rows = ws.slice(-14).reverse();
    card.replaceChildren(h('div', { class: 'card-head' }, h('h2', null, 'Historique'), h('span', { class: 'small muted' }, '14 dernières')));
    if (!rows.length) {
      card.appendChild(h('p', { class: 'empty' }, 'Aucune pesée pour l’instant.'));
      return;
    }
    const list = h('div', { class: 'list' });
    for (const r of rows) {
      const idx = ws.findIndex((x) => x.date === r.date);
      const prev = idx > 0 ? ws[idx - 1] : null;
      const confirming = confirmDelete === r.date;
      const day = store.getDay(r.date);
      list.appendChild(h('div', { class: 'list-row' },
        h('button', {
          class: 'main', type: 'button',
          style: 'background:none;border:0;padding:0;text-align:left;cursor:pointer',
          onclick: () => openWeighSheet({ date: r.date, weight: r.weight, body: day.body }),
        },
          h('div', { class: 'title num' }, `${fmtKg(r.weight)} kg`),
          h('div', { class: 'sub' }, fmtShort(r.date), prev ? ` · ${fmtDelta(r.weight - prev.weight)}` : '', day.body ? ' · compo' : ''),
        ),
        confirming
          ? h('div', { class: 'row' },
              h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { confirmDelete = null; draw(); } }, 'Annuler'),
              h('button', {
                class: 'btn sm danger', type: 'button',
                onclick: () => {
                  confirmDelete = null;
                  void store.updateDay(r.date, (d) => { delete d.weight; delete d.body; });
                  toast('Pesée supprimée');
                },
              }, 'Confirmer la suppression'),
            )
          : h('button', {
              class: 'btn sm ghost', type: 'button', 'aria-label': `Supprimer la pesée du ${fmtShort(r.date)}`,
              onclick: () => { confirmDelete = r.date; draw(); },
            }, 'Supprimer'),
      ));
    }
    card.appendChild(list);
  };
  draw();
  return card;
}

// ---------- screen ----------

export const renderWeight: Screen = (root) => {
  root.append(header(), summary(), chartCard(), actions(), bodyCard(), historyCard());
};
