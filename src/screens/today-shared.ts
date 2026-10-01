// Pieces shared by Aujourd'hui and Équilibre: pillar toggle with a visual "pop",
// recovery level from the Garmin numbers, the Garmin form (used in a sheet from
// Today and in the "Ta récup" card of Équilibre) and the late-period test block.

import type { DayLog, GarminField, Wellbeing } from '../types';
import { store } from '../store';
import { h, field, parseNum, fmtInt, fmtKg, openSheet } from '../lib/ui';
import { addDays } from '../lib/dates';
import { recoveryFlag } from '../lib/habits';
import type { CycleInfo } from '../lib/cycle';
import { toggleChip, updateCycle } from './cycle-calendar';

// ---------- "just done" feedback ----------

/** The control the user just changed: it gets `.pop` on the next render only. */
let justDone: { key: string; at: number } | null = null;

export function markDone(key: string) {
  justDone = { key, at: Date.now() };
}

/** ' pop' when `key` was just changed (within 800 ms), else ''. Consumed once. */
export function popCls(key: string): string {
  if (!justDone || justDone.key !== key || Date.now() - justDone.at > 800) return '';
  justDone = null;
  return ' pop';
}

// ---------- pillars ----------

/** Tick / untick one pillar on `date` (no toast: the change is visible under the finger). */
export function toggleHabit(date: string, key: string, force?: boolean) {
  markDone(`hb-${key}`);
  void store.updateDay(date, (d) => {
    const hb = { ...(d.habits ?? {}) };
    const next = force ?? !hb[key];
    if (next) hb[key] = true; else delete hb[key];
    d.habits = hb;
  });
}

// ---------- recovery ----------

export type RecoveryLevel = 'basse' | 'correcte' | 'bonne';

/** Last night's numbers (sleep / stress fall back to yesterday, like recoveryFlag). */
export function recoveryNumbers(date: string, days: Record<string, DayLog>) {
  const t = days[date]?.wellbeing;
  const y = days[addDays(date, -1)]?.wellbeing;
  return { sleepH: t?.sleepH ?? y?.sleepH, bodyBattery: t?.bodyBattery, stress: t?.stress ?? y?.stress, source: t?.source };
}

/** basse = recoveryFlag().low; bonne = sleep ≥ 7 h, Body Battery ≥ 60 and stress < 35; null without numbers. */
export function recoveryLevel(date: string, days: Record<string, DayLog>): RecoveryLevel | null {
  const n = recoveryNumbers(date, days);
  if (n.sleepH === undefined && n.bodyBattery === undefined && n.stress === undefined) return null;
  if (recoveryFlag(date, days).low) return 'basse';
  if ((n.sleepH ?? 0) >= 7 && (n.bodyBattery ?? 0) >= 60 && n.stress !== undefined && n.stress < 35) return 'bonne';
  return 'correcte';
}

export const RECOVERY_LABEL: Record<RecoveryLevel, string> = { basse: 'Récup basse', correcte: 'Récup correcte', bonne: 'Bonne récup' };

/** "sommeil 5,7 h · BB 27 · stress 44" (empty string without numbers). */
export function recoveryLine(date: string, days: Record<string, DayLog>): string {
  const n = recoveryNumbers(date, days);
  return [
    n.sleepH !== undefined ? `sommeil ${fmtKg(n.sleepH)} h` : null,
    n.bodyBattery !== undefined ? `BB ${n.bodyBattery}` : null,
    n.stress !== undefined ? `stress ${n.stress}` : null,
  ].filter(Boolean).join(' · ');
}

// ---------- Garmin numbers form ----------

interface GField { key: GarminField; label: string; unit: string; min: number; max: number; decimal: boolean; ph: string }
export const GFIELDS: GField[] = [
  { key: 'sleepH', label: 'Sommeil', unit: 'h', min: 0, max: 16, decimal: true, ph: 'ex. 7,5' },
  { key: 'bodyBattery', label: 'Body Battery', unit: '', min: 0, max: 100, decimal: false, ph: 'ex. 65' },
  { key: 'stress', label: 'Stress moyen', unit: '', min: 0, max: 100, decimal: false, ph: 'ex. 30' },
  { key: 'restingHr', label: 'FC repos', unit: 'bpm', min: 30, max: 120, decimal: false, ph: 'ex. 60' },
  { key: 'steps', label: 'Pas', unit: '', min: 0, max: 100000, decimal: false, ph: 'ex. 8000' },
];

export const fmtGVal = (f: GField, v: number | undefined) =>
  v === undefined ? '' : f.decimal ? String(v).replace('.', ',') : f.key === 'steps' ? fmtInt(v) : String(v);

/** The Garmin numbers of `date`, editable. `after` runs once saved. */
export function garminForm(date: string, after?: () => void): HTMLElement {
  const wb = store.getDay(date).wellbeing ?? {};
  const yWb = store.getDay(addDays(date, -1)).wellbeing ?? {};
  const inputs = new Map<keyof Wellbeing, HTMLInputElement>();
  const err = h('p', { class: 'small tone-bad', role: 'alert' });

  const grid = h('div', { class: 'grid-2' },
    GFIELDS.map((f) => {
      const input = h('input', {
        type: 'text', inputMode: f.decimal ? 'decimal' : 'numeric', placeholder: f.ph,
        value: fmtGVal(f, wb[f.key] as number | undefined).replace(/\s/g, ''),
      });
      inputs.set(f.key, input);
      const y = yWb[f.key] as number | undefined;
      return field(f.unit ? `${f.label} (${f.unit})` : f.label, input, y !== undefined ? `Hier : ${fmtGVal(f, y)}` : undefined);
    }),
  );

  function save() {
    const next: Wellbeing = { ...wb };
    const manual = new Set<GarminField>(wb.manual ?? []);
    for (const f of GFIELDS) {
      const raw = inputs.get(f.key)!.value.replace(/\s/g, '');
      if (!raw) {
        if (next[f.key] !== undefined) manual.add(f.key);
        delete next[f.key];
        continue;
      }
      const v = parseNum(raw);
      if (v === undefined || v < f.min || v > f.max) { err.textContent = `${f.label} : entre ${f.min} et ${fmtInt(f.max)}.`; return; }
      next[f.key] = f.decimal ? Math.round(v * 10) / 10 : Math.round(v);
      // Changed by hand: the Garmin import won't overwrite it anymore.
      if (next[f.key] !== wb[f.key]) manual.add(f.key);
    }
    if (manual.size) next.manual = [...manual];
    err.textContent = '';
    (document.activeElement as HTMLElement | null)?.blur();
    void store.updateDay(date, (d) => {
      d.wellbeing = next;
      // Numbers that clearly meet a pillar tick it (never untick).
      const hb = { ...(d.habits ?? {}) };
      if ((next.sleepH ?? 0) >= 7) hb.sleep = true;
      if ((next.steps ?? 0) >= 8000) hb.walk = true;
      d.habits = hb;
    });
    after?.();
  }

  const fromGarmin = wb.source === 'garmin' && GFIELDS.some((f) => wb.garmin?.[f.key] !== undefined && wb[f.key] === wb.garmin[f.key]);
  return h('div', { class: 'stack' },
    fromGarmin ? h('p', { class: 'small muted' }, 'Arrivés tout seuls depuis Garmin. Tu peux corriger : ta valeur sera gardée.') : null,
    grid,
    err,
    h('button', { class: 'btn primary block', type: 'button', onclick: save }, 'Enregistrer'),
  );
}

/** "Tes chiffres" sheet (opened from the recovery pill on Today). */
export function openGarminSheet(date: string) {
  const sheet = openSheet('Tes chiffres', garminForm(date, () => sheet.close()));
}

// ---------- late period: test ----------

export function lateBlock(date: string, info: CycleInfo, after?: () => void): HTMLElement {
  const test = store.getDay(date).cycle?.pregnancyTest;
  const set = (v: 'neg' | 'pos') => { updateCycle(date, (c) => { c.pregnancyTest = test === v ? undefined : v; }); after?.(); };
  return h('div', { class: 'stack bal-sub', style: 'gap:8px' },
    h('h3', null, 'Faire un test'),
    h('p', { class: 'small' },
      info.lateBy >= 1
        ? 'Un test urinaire est fiable dès le jour des règles attendues. Le matin, avec les premières urines, c’est le plus sûr. Négatif et toujours rien dans 3 jours : refais-en un.'
        : 'Tes règles sont attendues aujourd’hui. Si rien demain, un test urinaire est déjà fiable.'),
    h('div', { class: 'row wrap', style: 'gap:6px' },
      h('span', { class: 'small muted' }, 'Test du jour :'),
      toggleChip('Négatif', test === 'neg', () => set('neg')),
      toggleChip('Positif', test === 'pos', () => set('pos')),
    ),
  );
}
