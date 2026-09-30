// Training plan engine: pré-prépa (general triathlon prep) then half-ironman prep.
//
// Rules, in priority order (see docs/SPEC.md, "V7 — plan sportif"):
//   1. The menstrual cycle comes first. Sessions are placed from the cycle forecast (logged period
//      starts + average length, future cycles projected; recomputed as soon as a period is logged).
//      Règles: gentle only. Folliculaire / fenêtre fertile: the week's key session. Lutéale: endurance,
//      no hard intensity. Prémenstruel: short and easy. Retard: easy/moderate. Pregnancy: ≤ modéré.
//   2. No swimming from `noSwimBefore` days before a period, during it, and `noSwimAfter` days after.
//   3. Strength ≤ 30 min. Mobility 10–20 min as optional extras.
//   4. Running starts from `runBaseMin` of continuous easy running (no run-walk), ≤ ~10 %/week,
//      a lighter week every 4th week, strides / light tempo only in the follicular or fertile phase.
//   5. `sessionsPerWeek` sessions on top of basketball; no hard session on a basket day or the day after.
//   6. Bike = outdoor rides, weekend first. 7. Every session has a ~15 min "version mini".
// Pure and deterministic from (profile, logged cycle days, as-of date); memoized.

import type { DayLog, Intensity, PhaseId, PlannedSession, PlanWeek, Profile, SeasonBlock, Sport } from '../types';
import { addDays, daysBetween, mondayOf, today, weekday } from '../lib/dates';
import { phaseOn } from '../lib/nutrition';
import { cycleModel, cycleSettings, loggedPeriodDays, periodStarts, phaseLabel, positionOn } from '../lib/cycle';
import type { CycleInfo, CycleModel, CyclePhase } from '../lib/cycle';

type Days = Record<string, DayLog>;
const NO_DAYS: Days = {};

// ---------- settings ----------

export const PLAN_DEFAULTS = { noSwimBefore: 3, noSwimAfter: 2, runBaseMin: 30, sessionsPerWeek: 3 } as const;

export interface PlanSettings { noSwimBefore: number; noSwimAfter: number; runBaseMin: number; sessionsPerWeek: number }

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : dflt;
  return Math.max(lo, Math.min(hi, n));
};

export function planSettings(p: Profile): PlanSettings {
  return {
    noSwimBefore: clampInt(p.noSwimBefore, 0, 7, PLAN_DEFAULTS.noSwimBefore),
    noSwimAfter: clampInt(p.noSwimAfter, 0, 7, PLAN_DEFAULTS.noSwimAfter),
    runBaseMin: clampInt(p.runBaseMin, 10, 90, PLAN_DEFAULTS.runBaseMin),
    sessionsPerWeek: clampInt(p.sessionsPerWeek, 1, 7, PLAN_DEFAULTS.sessionsPerWeek),
  };
}

// ---------- public API ----------

/** Every week from the Monday of profile.startDate to the race week. Pass the logged days to follow the cycle. */
export function planWeeks(p: Profile, days: Days = NO_DAYS, asOf?: string): PlanWeek[] {
  return build(p, days, asOf).weeks;
}

export function weekOf(date: string, p: Profile, days: Days = NO_DAYS, asOf?: string): PlanWeek | undefined {
  return planWeeks(p, days, asOf).find((w) => date >= w.start && date < addDays(w.start, 7));
}

export function sessionsOn(date: string, p: Profile, days: Days = NO_DAYS, asOf?: string): PlannedSession[] {
  return weekOf(date, p, days, asOf)?.sessions.filter((s) => s.date === date) ?? [];
}

/** Big blocks from the start to the race, for the season overview. */
export function season(p: Profile): SeasonBlock[] {
  return blocks(p, calendar(p));
}

/** The season block containing `date` (clamped to the plan), if any. */
export function blockOn(date: string, p: Profile): SeasonBlock | undefined {
  return season(p).find((b) => date >= b.start && date <= b.end);
}

/** What the plan knows about one day: cycle phase (estimate), no-swim window, basket. */
export interface PlanDay {
  date: string;
  phase: CyclePhase | null;
  /** True when the phase comes from a projected (future or back-projected) cycle. */
  projected: boolean;
  noSwim: boolean;
  basket: boolean;
  afterBasket: boolean;
}

export function planDay(date: string, p: Profile, days: Days = NO_DAYS, asOf?: string): PlanDay {
  const b = build(p, days, asOf);
  return dayCtx(date, b.fc, b.basket, b.cal, p);
}

/** One-line summary: "3 séances + basket · séance clé mardi (phase folliculaire)". */
export function weekSummary(week: PlanWeek, p: Profile, days: Days = NO_DAYS, asOf?: string): string {
  const req = week.sessions.filter((s) => !s.optional && s.sport !== 'other');
  const basket = (p.basketDays ?? []).length > 0 && !week.sessions.every((s) => s.optional);
  const count = req.length
    ? `${req.length} séance${req.length > 1 ? 's' : ''}${basket ? ' + basket' : ''}`
    : week.sessions.length ? 'tout est optionnel' : 'repos';
  const key = week.sessions.find((s) => s.key);
  if (key) {
    const ph = planDay(key.date, p, days, asOf).phase;
    return `${count} · séance clé ${DAY_NAMES[weekday(key.date)]}${ph ? ` (${PHASE_WORD[ph]})` : ''}`;
  }
  if (!req.length) return count;
  const b = build(p, days, asOf);
  if (!b.fc) return count;
  return `${count} · pas de séance clé : semaine en endurance, calée sur ton cycle`;
}

/** Short label for a phase tag. */
export const PHASE_SHORT: Record<CyclePhase, string> = {
  regles: 'règles', folliculaire: 'follic.', fertile: 'fertile', luteale: 'lutéale', premenstruel: 'pré-règles', retard: 'retard',
};

const PHASE_WORD: Record<CyclePhase, string> = {
  regles: 'règles', folliculaire: 'phase folliculaire', fertile: 'fenêtre fertile', luteale: 'phase lutéale', premenstruel: 'avant les règles', retard: 'retard',
};

const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// ---------- memo ----------

interface Built {
  weeks: PlanWeek[];
  fc: Forecast | null;
  basket: Set<number>;
  cal: Calendar;
}

let memoKey = '';
let memoVal: Built | null = null;

function cycleKey(days: Days): string {
  const bleed: string[] = [];
  const lh: string[] = [];
  for (const d of Object.values(days)) {
    const c = d.cycle;
    if (!c) continue;
    if (c.period === 'start') bleed.push('s' + d.date);
    else if (c.period === 'flow') bleed.push('f' + d.date);
    if (c.lh === 'pos') lh.push(d.date);
  }
  return bleed.sort().join(',') + '|' + lh.sort().join(',');
}

function build(p: Profile, days: Days, asOf?: string): Built {
  const at = asOf ?? today();
  const key = JSON.stringify([
    p.startDate, p.lavageEnd, p.vacationStart, p.vacationEnd, p.prepStart, p.raceDate, p.raceName, p.basketDays ?? [],
    cycleSettings(p), p.sex, planSettings(p), cycleKey(days), at,
  ]);
  if (memoVal && key === memoKey) return memoVal;
  memoVal = compute(p, days, at);
  memoKey = key;
  return memoVal;
}

// ---------- cycle forecast ----------

interface Pos { phase: CyclePhase; projected: boolean; info: CycleInfo }

interface Forecast {
  pos(date: string): Pos | null;
  noSwim: Set<string>;
}

function phaseFrom(date: string, day: number, periodLen: number, fs: string, fe: string, next: string): CyclePhase {
  if (day <= periodLen) return 'regles';
  if (date >= fs && date <= fe) return 'fertile';
  if (date < fs) return 'folliculaire';
  if (daysBetween(date, next) <= 5) return 'premenstruel';
  return 'luteale';
}

/** Cycle forecast used by the plan. Null when tracking is off, in pregnancy mode, or with nothing logged. */
function forecast(p: Profile, days: Days, asOf: string, cal: Calendar, set: PlanSettings): Forecast | null {
  const cs = cycleSettings(p);
  if (!cs.tracking || cs.pregnant || p.sex === 'm') return null;
  const starts = periodStarts(days);
  if (!starts.length) return null;
  const at = asOf > starts[starts.length - 1] ? asOf : starts[starts.length - 1];
  const m: CycleModel = cycleModel(at, p, days);
  const len = m.length;
  const first = starts[0];

  const nextOf = (cycleStart: string, projected: boolean): string => {
    if (projected) return addDays(cycleStart, len);
    const c = m.cycles.find((x) => x.start === cycleStart);
    if (c?.next) return c.next;
    if (c && m.info && m.info.cycleStart === cycleStart) return m.info.nextPeriod;
    return addDays(cycleStart, len);
  };

  // Period length: logged bleeding days when longer than the setting; projected periods use their average.
  const logged = starts.map((s) => loggedPeriodDays(s, days)).filter((n): n is number => n !== null);
  const avgLogged = logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : 0;
  const periodLen = (start: string) => Math.max(starts.includes(start) ? loggedPeriodDays(start, days) ?? avgLogged : avgLogged, cs.periodLength);

  const cache = new Map<string, Pos | null>();
  const pos = (date: string): Pos | null => {
    if (cache.has(date)) return cache.get(date)!;
    let out: Pos | null;
    if (date < first) {
      // Before the first logged period: project cycles backwards (estimate).
      const k = Math.ceil(daysBetween(date, first) / len);
      const start = addDays(first, -k * len);
      const next = addDays(start, len);
      const ovulation = addDays(next, -cs.lutealLength);
      const fs = addDays(ovulation, -5);
      const fe = addDays(ovulation, 1);
      const day = daysBetween(start, date) + 1;
      const phase = phaseFrom(date, day, cs.periodLength, fs, fe, next);
      out = { phase, projected: true, info: { day, length: len, phase, cycleStart: start, ovulation, fertileStart: fs, fertileEnd: fe, nextPeriod: next, ovulationFromLH: false, lateBy: 0 } };
    } else {
      const dp = positionOn(m, date);
      if (!dp) out = null;
      else {
        const next = nextOf(dp.cycleStart, dp.projected);
        out = {
          phase: dp.phase, projected: dp.projected,
          info: {
            day: dp.day, length: len, phase: dp.phase, cycleStart: dp.cycleStart, ovulation: dp.ovulation,
            fertileStart: dp.fertileStart, fertileEnd: dp.fertileEnd, nextPeriod: next, ovulationFromLH: dp.ovulationFromLH,
            lateBy: dp.phase === 'retard' ? daysBetween(next, date) : 0,
          },
        };
      }
    }
    if (out && out.phase !== 'retard' && out.info.day <= periodLen(out.info.cycleStart)) {
      out = { ...out, phase: 'regles', info: { ...out.info, phase: 'regles' } };
    }
    cache.set(date, out);
    return out;
  };

  // No-swim window around every period: logged, back-projected and projected ones.
  const noSwim = new Set<string>();
  const from = addDays(mondayOf(cal.start), -7);
  const to = addDays(cal.race, 7);
  const mark = (a: string, b: string) => {
    for (let d = a < from ? from : a; d <= b && d <= to; d = addDays(d, 1)) noSwim.add(d);
  };
  const all: string[] = [...starts];
  for (let s = addDays(first, -len); addDays(s, len + set.noSwimAfter) >= from; s = addDays(s, -len)) all.push(s);
  if (m.predictedFrom) for (let s = m.predictedFrom; addDays(s, -set.noSwimBefore) <= to; s = addDays(s, len)) all.push(s);
  for (const s of all) mark(addDays(s, -set.noSwimBefore), addDays(s, periodLen(s) - 1 + set.noSwimAfter));
  // Any bleeding day actually logged, and the days after it.
  for (const d of Object.values(days)) {
    if (d.cycle?.period === 'start' || d.cycle?.period === 'flow') mark(d.date, addDays(d.date, set.noSwimAfter));
  }
  // Late period: it can come any day.
  for (let d = m.info?.nextPeriod ?? to; d <= at && d <= to; d = addDays(d, 1)) if (pos(d)?.phase === 'retard') mark(d, addDays(d, set.noSwimAfter));

  return { pos, noSwim };
}

// ---------- calendar ----------

type BlockKey = 'reprise' | 'fondations' | 'consolidation' | 'vacances' | 'base' | 'construction' | 'specifique' | 'affutage';
type Major = 'pre' | 'vac' | 'prep';

interface Calendar {
  start: string;
  w1: string;
  fondStart: string;
  consStart: string;
  vacStart: string;
  vacEnd: string;
  prepStart: string;
  buildStart: string;
  specStart: string;
  taperStart: string;
  race: string;
}

const minD = (a: string, b: string) => (a < b ? a : b);
const maxD = (a: string, b: string) => (a > b ? a : b);

function calendar(p: Profile): Calendar {
  const w1 = mondayOf(p.startDate);
  const vacStart = p.vacationStart;
  const prepStart = p.prepStart;
  const race = p.raceDate;
  const fondStart = minD(addDays(w1, 21), vacStart);
  const consStart = minD(addDays(w1, 56), vacStart);
  const prepMon = mondayOf(prepStart);
  const raceMon = mondayOf(race);
  const taperStart = maxD(prepStart, addDays(raceMon, -7));
  const specStart = maxD(prepStart, addDays(raceMon, -35));
  const remWeeks = Math.max(0, Math.round(daysBetween(prepMon, mondayOf(specStart)) / 7));
  const buildStart = maxD(prepStart, addDays(prepMon, Math.ceil(remWeeks / 2) * 7));
  return { start: p.startDate, w1, fondStart, consStart, vacStart, vacEnd: p.vacationEnd, prepStart, buildStart, specStart, taperStart, race };
}

function blockKeyOn(date: string, c: Calendar): BlockKey {
  if (date < c.fondStart) return 'reprise';
  if (date < c.consStart) return 'fondations';
  if (date < c.vacStart) return 'consolidation';
  if (date < c.prepStart) return 'vacances';
  if (date < c.buildStart) return 'base';
  if (date < c.specStart) return 'construction';
  if (date < c.taperStart) return 'specifique';
  return 'affutage';
}

const majorOf = (k: BlockKey): Major =>
  k === 'vacances' ? 'vac' : k === 'reprise' || k === 'fondations' || k === 'consolidation' ? 'pre' : 'prep';

// ---------- day context ----------

interface DayCtx extends PlanDay {
  pos: Pos | null;
}

function dayCtx(date: string, fc: Forecast | null, basket: Set<number>, cal: Calendar, p: Profile): DayCtx {
  const onHoliday = (d: string) => d >= cal.vacStart && d <= cal.vacEnd;
  const isBasket = (d: string) => d >= p.startDate && basket.has(weekday(d)) && !onHoliday(d);
  const pos = fc ? fc.pos(date) : null;
  return {
    date,
    phase: pos?.phase ?? null,
    projected: pos?.projected ?? false,
    noSwim: fc ? fc.noSwim.has(date) : false,
    basket: isBasket(date),
    afterBasket: isBasket(addDays(date, -1)),
    pos,
  };
}

// ---------- session texts ----------

const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const r100 = (n: number) => Math.round(n / 100) * 100;
const fmtM = (m: number) => `${m.toLocaleString('fr-FR')} m`;
const fmtH = (min: number) => {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return hh ? `${hh} h${mm ? String(mm).padStart(2, '0') : ''}` : `${mm} min`;
};

const MINI = {
  swim: '15 min de nage facile, la nage que tu veux, pauses au bord autorisées.',
  bike: 'Mauvais temps ou peu d’envie : 30 min de marche rapide, ou 15 min d’étirements. Pas besoin de home trainer.',
  run: '15 min de course très facile, en continu, juste pour le plaisir.',
  strength: '2 tours : 10 squats, 10 ponts fessiers, 20 s de gainage. Moins de 10 min et c’est fait.',
  walk: '15 min de marche dehors, sans objectif.',
  mobility: '5 min de respiration calme + 5 min d’étirements doux.',
};

const STRENGTH_A = 'Circuit jambes & gainage : 12 squats, 10 fentes arrière par jambe, 15 ponts fessiers, 30 s de gainage ventral, 20 s de gainage latéral par côté, 15 montées sur pointes (mollets).';
const STRENGTH_B = 'Circuit dos, épaules & chevilles : 12 tirages à l’élastique (dos, utile en nage), 12 rotations externes d’épaule à l’élastique, 8 pompes sur les genoux, 30 s de planche, 12 squats, 30 s d’équilibre sur une jambe par côté (chevilles).';

const MOBILITY_TXT = 'Hanches (fente basse, 45 s par côté), arrière des cuisses, mollets contre un mur, dos (chat-vache × 8), épaules (bras croisé, 30 s par côté), puis 2 min de respiration lente allongée.';

// ---------- why lines ----------

interface WhyOpts { key?: boolean; ttc: boolean; pregnant: boolean; afterBasket: boolean; sport: Sport; gentle?: boolean }

function whyLine(ph: CyclePhase | null, o: WhyOpts): string {
  if (o.pregnant) return 'Mode grossesse : modéré au maximum, sans intensité en course. À valider avec ta sage-femme.';
  const after = o.afterBasket ? ' Lendemain de basket : on reste facile.' : '';
  switch (ph) {
    case 'regles':
      return 'Règles : en douceur, rien d’obligatoire. Bouger tranquillement peut soulager les crampes.';
    case 'folliculaire':
      return o.key ? 'Phase folliculaire : énergie haute, c’est ta séance clé de la semaine.' : `Phase folliculaire : l’énergie remonte, profite-en sans forcer.${after}`;
    case 'fertile':
      return o.key ? 'Fenêtre fertile : énergie au top, c’est ta séance clé de la semaine.' : `Fenêtre fertile : énergie au top, reste raisonnable.${after}`;
    case 'luteale':
      return o.ttc
        ? `Phase lutéale, période d’attente : modéré, bois bien et évite de surchauffer.${after}`
        : `Phase lutéale : endurance tranquille, le corps chauffe plus vite.${after}`;
    case 'premenstruel':
      return 'Avant les règles : plus court et facile. La version mini est parfaite aussi.';
    case 'retard':
      return 'Règles en retard : facile à modéré en attendant, sans pression.';
    default:
      return o.afterBasket ? 'Lendemain de basket : on reste facile.' : 'Note tes règles dans Cycle : le plan se calera sur tes phases.';
  }
}

// ---------- intensity rules ----------

const RANK: Record<Intensity, number> = { facile: 0, 'modéré': 1, soutenu: 2 };
const minI = (a: Intensity, b: Intensity): Intensity => (RANK[a] <= RANK[b] ? a : b);

/** Ceiling for a day: cycle phase, pregnancy, basket the day before. */
function dayCap(d: DayCtx, pregnant: boolean): Intensity {
  if (pregnant) return 'modéré';
  let cap: Intensity = 'soutenu';
  switch (d.phase) {
    case 'regles': case 'premenstruel': cap = 'facile'; break;
    case 'luteale': case 'retard': cap = 'modéré'; break;
    default: break;
  }
  if (d.basket || d.afterBasket) cap = minI(cap, 'modéré');
  return cap;
}

/** Volume factor for a day from the cycle phase. */
function dayFactor(d: DayCtx): number {
  switch (d.phase) {
    case 'regles': return 0.75;
    case 'premenstruel': return 0.8;
    case 'retard': return 0.9;
    default: return 1;
  }
}

const keyPhase = (d: DayCtx) => d.phase === 'folliculaire' || d.phase === 'fertile';

// ---------- weekly volumes ----------

interface Vol {
  /** Longest run of the week (the key run), minutes. */
  run: number;
  /** Outdoor ride, minutes. */
  bike: number;
  swim: number;
  /** Swim distance (m) for prep sessions. */
  swimM: number;
  strength: number;
  light: boolean;
}

const RUN_STEP = 1.08;
const BIKE_STEP = 1.11;

/**
 * Running and riding levels carried from week to week. A level only grows after a
 * normal week that really had that session (a run replaced by a walk does not count),
 * by ≤ 10 %; every 4th week is lighter.
 */
interface Levels { run: number; bike: number; swimM: number }

function preVol(k: number, key: BlockKey, lv: Levels): Vol {
  const light = (k + 1) % 4 === 0;
  const f = light ? 0.8 : 1;
  const swim = key === 'reprise' ? 30 : key === 'fondations' ? 40 : 45;
  return { run: Math.round(lv.run * f), bike: r5(lv.bike * (light ? 0.75 : 1)), swim: r5(swim * f), swimM: 0, strength: light ? 20 : 25, light };
}

function prepVol(q: number, key: BlockKey, lv: Levels): Vol {
  const recovery = key !== 'affutage' && (q + 1) % 4 === 0;
  const f = key === 'affutage' ? 0.6 : recovery ? 0.75 : 1;
  const m = r100(lv.swimM * f);
  return { run: Math.round(lv.run * f), bike: r5(lv.bike * f), swim: r5(m / 1000 * 22 + 10), swimM: m, strength: recovery || key === 'affutage' ? 20 : 30, light: recovery };
}

function grow(lv: Levels, vol: Vol, sessions: PlannedSession[], prep: boolean) {
  if (vol.light) return;
  const runCap = prep ? 105 : 60;
  if (sessions.some((s) => s.sport === 'run' && !s.optional)) lv.run = Math.min(lv.run * (prep ? 1.07 : RUN_STEP), runCap);
  if (sessions.some((s) => s.sport === 'bike' && !s.optional)) lv.bike = Math.min(lv.bike * (prep ? 1.08 : BIKE_STEP), prep ? 180 : 110);
  if (prep) lv.swimM = Math.min(lv.swimM * 1.05, 2500);
}

// ---------- scheduling ----------

type Kind = 'run' | 'bike' | 'swim' | 'strength' | 'run2' | 'swim2' | 'bike2';
type Variant = 'runKey' | 'run' | 'walkForRun' | 'bike' | 'bikeForSwim' | 'swim' | 'mobForSwim' | 'strength' | 'mobForStrength' | 'run2' | 'swim2' | 'bike2';

const VARIANT_SPORT: Record<Variant, Sport> = {
  runKey: 'run', run: 'run', walkForRun: 'walk', bike: 'bike', bikeForSwim: 'bike', swim: 'swim', mobForSwim: 'mobility',
  strength: 'strength', mobForStrength: 'mobility', run2: 'run', swim2: 'swim', bike2: 'bike',
};

interface Opt { day: number; v: Variant; cost: number }

// Preference ranks (0 = best) by weekday, Monday = 0.
const KEY_PREF = [5, 0, 1, 2, 4, 3, 0.5]; // Sunday long run when free, else Tuesday, Wednesday…
const SWIM_PREF = [0, 1.5, 0.5, 2, 1, 3, 3];
const RUN_PREF = [1, 0, 0.5, 1, 1.5, 2, 2];

interface WeekCtx {
  mon: string;
  k: number;
  q: number;
  key: BlockKey;
  vol: Vol;
  days: DayCtx[];
  /** Weekdays (0–6) inside the plan and this block. */
  inPlan: boolean[];
  pregnant: boolean;
  ttc: boolean;
  prep: boolean;
}

function optionsFor(kind: Kind, w: WeekCtx): Opt[] {
  const out: Opt[] = [];
  for (let d = 0; d < 7; d++) {
    const x = w.days[d];
    if (!w.inPlan[d] || x.basket) continue;
    const regles = x.phase === 'regles';
    switch (kind) {
      case 'run':
        if (!w.pregnant && keyPhase(x) && !x.afterBasket) out.push({ day: d, v: 'runKey', cost: KEY_PREF[d] });
        if (!regles) out.push({ day: d, v: 'run', cost: 10 + (x.afterBasket ? 3 : 0) + RUN_PREF[d] });
        else out.push({ day: d, v: 'walkForRun', cost: 30 + RUN_PREF[d] });
        break;
      case 'run2':
        if (!regles) out.push({ day: d, v: 'run2', cost: 6 + RUN_PREF[d] + (x.afterBasket ? 1 : 0) });
        else out.push({ day: d, v: 'walkForRun', cost: 26 });
        break;
      case 'bike':
        out.push({ day: d, v: 'bike', cost: (d === 5 ? 0 : d === 6 ? 1 : 7) + (regles ? 1 : 0) });
        break;
      case 'bike2':
        out.push({ day: d, v: 'bike2', cost: 6 + (d >= 5 ? 0 : 1) });
        break;
      case 'swim':
      case 'swim2':
        if (!x.noSwim) out.push({ day: d, v: kind, cost: SWIM_PREF[d] + (kind === 'swim2' ? 2 : 0) });
        else out.push({ day: d, v: d >= 5 ? 'bikeForSwim' : 'mobForSwim', cost: 25 + SWIM_PREF[d] });
        break;
      case 'strength':
        if (!regles) out.push({ day: d, v: 'strength', cost: 4 + (keyPhase(x) ? 0 : 2) + SWIM_PREF[d] * 0.2 });
        else out.push({ day: d, v: 'mobForStrength', cost: 20 });
        break;
    }
  }
  return out;
}

const isHardVariant = (v: Variant) => v === 'runKey';

/** Best assignment of the week's sessions to days (branch and bound). */
function assign(kinds: Kind[], w: WeekCtx): { kind: Kind; opt: Opt }[] {
  const opts = kinds.map((k) => ({ k, o: optionsFor(k, w).sort((a, b) => a.cost - b.cost) }));
  const order = opts.map((_, i) => i).sort((a, b) => opts[a].o.length - opts[b].o.length);
  const load: Variant[][] = Array.from({ length: 7 }, () => []);
  const pick: (Opt | null)[] = kinds.map(() => null);
  let best: (Opt | null)[] | null = null;
  let bestCost = Infinity;
  const doubleCost = 6;

  const spacing = () => {
    let c = 0;
    for (let d = 0; d < 7; d++) {
      const busy = (i: number) => i >= 0 && i < 7 && (load[i].length > 0 || w.days[i].basket);
      if (load[d].length && busy(d - 1)) c += 0.4;
    }
    return c;
  };

  const rec = (i: number, cost: number) => {
    if (cost >= bestCost) return;
    if (i === order.length) {
      const total = cost + spacing();
      if (total < bestCost) { bestCost = total; best = [...pick]; }
      return;
    }
    const idx = order[i];
    for (const o of opts[idx].o) {
      const here = load[o.day];
      let extra = 0;
      if (here.length) {
        // Two sessions a day at most; in pré-prépa only strength attached to a run or a swim.
        if (here.length >= 2) continue;
        const sport = VARIANT_SPORT[o.v];
        if (here.some((v) => VARIANT_SPORT[v] === sport)) continue;
        if (isHardVariant(o.v) && here.some(isHardVariant)) continue;
        const attach = o.v === 'strength' && here.some((v) => v === 'run' || v === 'runKey' || v === 'swim' || v === 'run2' || v === 'swim2');
        if (!attach && !w.prep) continue;
        extra = attach ? (w.prep ? 2 : 3) : doubleCost;
      }
      here.push(o.v);
      pick[idx] = o;
      rec(i + 1, cost + o.cost + extra);
      here.pop();
      pick[idx] = null;
    }
    // Leaving a session out is the very last resort.
    pick[idx] = null;
    rec(i + 1, cost + 200);
  };
  rec(0, 0);
  const res: { kind: Kind; opt: Opt }[] = [];
  (best ?? []).forEach((o, i) => { if (o) res.push({ kind: kinds[i], opt: o }); });
  return res;
}

/** Sessions to place in a week, by priority. */
function weekKinds(n: number): Kind[] {
  return (['run', 'swim', 'bike', 'strength', 'run2', 'swim2', 'bike2'] as Kind[]).slice(0, Math.max(1, Math.min(7, n)));
}

// ---------- session builders ----------

interface Spec {
  sport: Sport;
  title: string;
  minutes: number;
  intensity: Intensity;
  details: string;
  mini: string;
  optional?: boolean;
  key?: boolean;
  note?: string;
  why?: string;
}

function makeSession(v: Variant, w: WeekCtx, x: DayCtx): Spec {
  const cap = dayCap(x, w.pregnant);
  const f = dayFactor(x);
  const vol = w.vol;
  const light = vol.light;
  const why = (key = false) => whyLine(x.phase, { key, ttc: w.ttc, pregnant: w.pregnant, afterBasket: x.afterBasket, sport: VARIANT_SPORT[v] });
  const pre = !w.prep;

  switch (v) {
    case 'runKey': {
      const m = Math.round(vol.run);
      let title: string, details: string, intensity: Intensity;
      const tempoWeek = !light && (w.key === 'fondations' ? w.k % 2 === 0 : w.key !== 'reprise');
      if (w.key === 'reprise' || !tempoWeek) {
        title = 'Course clé : endurance + lignes droites';
        details = `${m} min en continu, allure conversation. Dans les 5 dernières minutes, 4 lignes droites de 15 s en accélérant progressivement, 45 s de trot entre. C’est ta sortie la plus longue de la semaine.`;
        intensity = 'modéré';
      } else if (w.key === 'fondations') {
        title = 'Course clé : tempo léger';
        details = `${m} min en tout : 12 min faciles, puis 3 × 3 min un peu plus vite (tu parles par mots, pas par phrases), 2 min de trot entre, et le reste tranquille.`;
        intensity = 'soutenu';
      } else if (w.key === 'consolidation') {
        title = 'Course clé : tempo';
        details = `${m} min en tout : 12 min faciles, 2 × 7 min à allure soutenue mais contrôlée, 3 min de trot entre, retour au calme en trottinant.`;
        intensity = 'soutenu';
      } else if (w.key === 'base') {
        title = 'Sortie longue course';
        details = `${fmtH(m)} en aisance, en continu. Les 10 dernières minutes un peu plus allongées si tout va bien, puis 4 lignes droites de 15 s.`;
        intensity = 'modéré';
      } else if (w.key === 'construction') {
        title = 'Course clé : allure half';
        details = `${fmtH(m)} en tout : 15 min faciles, 3 × 8 min à allure half, 2 min de trot entre, le reste en aisance.`;
        intensity = 'soutenu';
      } else if (w.key === 'specifique') {
        title = 'Sortie longue spécifique';
        details = `${fmtH(m)} en aisance, dont les 20 dernières minutes à allure half. Teste ce que tu mangeras le jour J.`;
        intensity = 'soutenu';
      } else {
        title = 'Course rappel';
        details = `${m} min faciles dont 3 × 3 min à allure half, 2 min de trot entre.`;
        intensity = 'modéré';
      }
      return { sport: 'run', title, minutes: m, intensity: minI(intensity, cap), details, mini: MINI.run, key: true, why: why(true) };
    }
    case 'run':
    case 'run2': {
      // Pré-prépa: the week's only run keeps the level; in prep the key run is the long one.
      const base = v === 'run2' ? vol.run * 0.65 : vol.run * (w.prep ? 0.85 : 1);
      const m = Math.max(15, Math.round(base * f));
      const details = `${m} min en continu, allure conversation (zone 2) : tu peux parler en phrases. Si le souffle monte, ralentis plutôt que de t’arrêter.`;
      return { sport: 'run', title: v === 'run2' ? 'Course facile' : 'Course en endurance', minutes: m, intensity: 'facile', details, mini: MINI.run, why: why() };
    }
    case 'walkForRun':
      return {
        sport: 'walk', title: 'Marche tranquille', minutes: 30, intensity: 'facile',
        details: '30 min de marche à ton rythme, dehors si possible. Ça détend le ventre et le dos.',
        mini: MINI.walk, why: why(), note: 'Règles : on remplace la course par une marche tranquille. Ça compte pareil.',
      };
    case 'bike':
    case 'bike2':
    case 'bikeForSwim': {
      if (x.phase === 'regles') {
        const m = Math.min(40, r5(vol.bike * f));
        return {
          sport: 'bike', title: 'Vélo très tranquille', minutes: m, intensity: 'facile',
          details: `${m} min dehors, tout doux, sur du plat : juste faire tourner les jambes, sans effort.`,
          mini: MINI.bike, why: why(),
          note: v === 'bikeForSwim' ? 'Pas de piscine autour des règles : on la remplace par un vélo tranquille.' : undefined,
        };
      }
      if (v === 'bikeForSwim' || v === 'bike2') {
        const m = v === 'bike2' ? r5(vol.bike * 0.6 * f) : Math.min(45, r5(vol.bike * 0.6 * f));
        return {
          sport: 'bike', title: 'Vélo tranquille', minutes: m, intensity: 'facile',
          details: `${fmtH(m)} dehors en endurance facile, parcours plat. Tu dois pouvoir discuter tout du long.`,
          mini: MINI.bike, why: why(),
          note: v === 'bikeForSwim' ? 'Pas de piscine autour des règles : on la remplace par un vélo tranquille.' : undefined,
        };
      }
      const m = r5(vol.bike * f);
      const brick = w.prep && !light && (w.key === 'construction' || w.key === 'specifique') && w.q % 2 === 1 && x.phase !== 'premenstruel';
      const natural: Intensity = m > 60 ? 'modéré' : 'facile';
      const details = `Sortie vélo dehors, ${fmtH(m)} en endurance : tu peux discuter, tu pédales rond. Parcours plat ou vallonné doux, bois toutes les 15 min${m >= 75 ? ', mange un petit quelque chose toutes les 45 min' : ''}.` +
        (w.prep && w.key !== 'base' && !light ? ' Les 20 dernières minutes à allure half si les jambes sont bonnes.' : '') +
        (brick ? ' Enchaîne 15 min de course très facile en rentrant.' : '');
      return {
        sport: 'bike', title: brick ? 'Sortie vélo + course' : m >= 75 ? 'Sortie longue vélo' : 'Sortie vélo', minutes: m + (brick ? 15 : 0),
        intensity: minI(natural, cap), details, mini: MINI.bike, why: why(),
      };
    }
    case 'swim':
    case 'swim2': {
      if (!pre) {
        const dist = v === 'swim2' ? r100(vol.swimM * 0.75) : vol.swimM;
        const m = r5(Math.round((dist / 1000) * 22 + 10) * (x.phase === 'premenstruel' ? 0.85 : 1));
        const tech = v === 'swim2' || w.key === 'base' || light;
        return {
          sport: 'swim', title: tech ? 'Natation endurance' : 'Natation allure course', minutes: m,
          intensity: minI(tech ? 'facile' : 'modéré', cap),
          details: tech
            ? `${fmtM(dist)} : 300 m souples, 8 × 25 m d’éducatifs, puis des séries de 200 à 400 m en crawl régulier, 20 s de repos.`
            : `${fmtM(dist)} : 400 m souples, ${light ? 4 : 6} × 200 m à allure course, 20 s de repos, le reste facile. Respiration des deux côtés.`,
          mini: MINI.swim, why: why(),
        };
      }
      const m = r5(vol.swim * (x.phase === 'premenstruel' ? 0.85 : 1));
      let details: string;
      if (w.key === 'reprise') {
        details = `Technique, ${m} min : 200 m souples pour t’échauffer, 8 × 25 m d’éducatifs (battements avec planche, rattrapé, respiration tous les 3 temps), puis 6 × 50 m de crawl relâché, 30 s de repos. Expire longuement dans l’eau.`;
      } else if (w.key === 'fondations') {
        const cont = [400, 550, 700, 850, 900][Math.min(4, Math.max(0, w.k - 3))];
        details = `${m} min : 200 m d’échauffement, 6 × 25 m d’éducatifs, puis ${fmtM(light ? 400 : cont)} de crawl continu et tranquille (10 s au bord si besoin), 100 m souples.`;
      } else {
        const dist = light ? 1000 : 1400;
        details = `${fmtM(dist)} : 300 m souples, 3 × ${fmtM(r100((dist - 500) / 3))} de crawl régulier, 30 s de repos, 4 × 25 m de battements, 100 m retour au calme.`;
      }
      return { sport: 'swim', title: w.key === 'reprise' ? 'Natation technique' : 'Natation endurance', minutes: m, intensity: 'facile', details, mini: MINI.swim, why: why() };
    }
    case 'mobForSwim':
    case 'mobForStrength':
      return {
        sport: 'mobility', title: 'Étirements & mobilité', minutes: 20, intensity: 'facile',
        details: MOBILITY_TXT, mini: MINI.mobility, why: why(),
        note: v === 'mobForSwim'
          ? 'Pas de piscine autour des règles : on la remplace par des étirements doux.'
          : 'Règles : on remplace le renfo par des étirements doux.',
      };
    case 'strength': {
      const m = Math.min(30, x.phase === 'premenstruel' ? 20 : vol.strength);
      const circuit = w.k % 2 === 0 ? STRENGTH_A : STRENGTH_B;
      const rounds = m <= 20 ? 2 : 3;
      return {
        sport: 'strength', title: 'Renfo triathlon', minutes: m, intensity: 'facile',
        details: `${m} min maximum. Échauffement 3 min (montées de genoux, moulinets de bras), puis ${rounds} tours, 1 min de pause entre. ${circuit}`,
        mini: MINI.strength, why: why(),
      };
    }
  }
}

function optionalStrength(w: WeekCtx, x: DayCtx): Spec {
  const m = x.phase === 'premenstruel' || w.vol.light ? 20 : 25;
  const circuit = w.k % 2 === 0 ? STRENGTH_A : STRENGTH_B;
  return {
    sport: 'strength', title: 'Renfo en complément', minutes: m, intensity: 'facile', optional: true,
    details: `${m} min maximum, juste après ta séance ou le soir. ${m <= 20 ? 2 : 3} tours, 1 min de pause entre. ${circuit}`,
    mini: MINI.strength,
    why: w.pregnant ? 'Mode grossesse : renfo doux, sans bloquer la respiration. À valider avec ta sage-femme.' : x.phase === 'folliculaire' || x.phase === 'fertile'
      ? 'Phase folliculaire : bon moment pour le renfo, il protège tes genoux et ton dos.'
      : 'En complément, si l’envie est là : il protège tes genoux et ton dos.',
  };
}

function optionalMobility(x: DayCtx, pregnant: boolean): Spec {
  return {
    sport: 'mobility', title: x.basket ? 'Étirements après le basket' : 'Étirements doux', minutes: x.basket ? 10 : 15, intensity: 'facile', optional: true,
    details: x.basket
      ? 'Le soir, après le basket : mollets, arrière des cuisses, hanches, 45 s par position, puis quelques respirations lentes.'
      : MOBILITY_TXT,
    mini: MINI.mobility,
    why: pregnant
      ? 'Mode grossesse : étirements doux, à valider avec ta sage-femme.'
      : x.basket ? 'Soir de basket : quelques étirements pour bien récupérer.' : x.afterBasket ? 'Lendemain de basket : repos ou mobilité, c’est tout.' : x.phase === 'regles' ? 'Règles : bouger doucement peut soulager les crampes.' : 'Un moment pour toi, si l’envie est là.',
  };
}

// ---------- weeks ----------

function toSession(date: string, s: Spec): PlannedSession {
  const out: PlannedSession = { id: `${date}-${s.sport}`, date, sport: s.sport, title: s.title, minutes: s.minutes, intensity: s.intensity, details: s.details };
  if (s.mini) out.mini = s.mini;
  if (s.optional) out.optional = true;
  if (s.key) out.key = true;
  if (s.why) out.why = s.why;
  if (s.note) out.note = s.note;
  return out;
}

const FOCUS: Record<BlockKey, string[]> = {
  reprise: ['On installe l’habitude, pas la performance.', 'Même heure, même sac prêt : le plus dur, c’est de partir.', 'Trois semaines de suite, c’est déjà une routine. Bravo d’être là.'],
  fondations: ['On pose les fondations : un peu plus long, toujours facile.', 'Régulière plutôt que forte. Tu construis quelque chose de solide.', 'Écoute ton corps. Une mini vaut mieux qu’une séance sautée.'],
  consolidation: ['On consolide. Tu es plus solide qu’il y a deux mois.', 'Un peu de tempo quand ton cycle s’y prête, le reste reste facile.', 'Garde de l’envie en réserve : on vise la régularité.'],
  vacances: ['Vacances : bouge pour le plaisir, rien n’est obligatoire.'],
  base: ['Base : du volume facile, beaucoup de facile.', 'Tu construis le moteur. Patience, ça paie.', 'Facile aujourd’hui, fort en juin.'],
  construction: ['Construction : un peu de rythme, beaucoup de régularité.', 'Tu enchaînes. Tu deviens triathlète.', 'Les séances dures sont courtes ; le reste reste facile.'],
  specifique: ['Spécifique : tu répètes la course, à ton allure.', 'Allure half, ravito, transitions : tu fignoles.', 'Presque au bout. On garde l’envie intacte.'],
  affutage: ['Affûtage : moins de volume, un peu de rythme. Tu gardes la fraîcheur pour le jour J.'],
};

function compute(p: Profile, days: Days, asOf: string): Built {
  const cal = calendar(p);
  const set = planSettings(p);
  const cs = cycleSettings(p);
  const pregnant = cs.pregnant && p.sex !== 'm';
  const ttc = cs.ttc && !pregnant;
  const basket = new Set((p.basketDays ?? []).filter((d) => d >= 0 && d <= 6));
  const fc = forecast(p, days, asOf, cal, set);
  const weeks: PlanWeek[] = [];
  const built: Built = { weeks, fc, basket, cal };
  if (cal.w1 > cal.race) return built;

  const raceMon = mondayOf(cal.race);
  const prepMon = mondayOf(cal.prepStart);
  const lv: Levels = { run: set.runBaseMin, bike: 45, swimM: 1500 };
  let prepStarted = false;
  let index = 1;
  for (let mon = cal.w1; mon <= raceMon; mon = addDays(mon, 7), index++) {
    const thu = maxD(addDays(mon, 3), p.startDate);
    const key = blockKeyOn(minD(thu, cal.race), cal);
    const phase: PhaseId = phaseOn(maxD(mon, p.startDate), p).id;
    const dctx = Array.from({ length: 7 }, (_, d) => dayCtx(addDays(mon, d), fc, basket, cal, p));

    if (mon === raceMon) {
      weeks.push({ index, start: mon, phase, focus: 'Semaine de course. Tu as fait le travail : repose-toi et fais-toi confiance.', sessions: raceWeek(p, cal, dctx, pregnant) });
      continue;
    }

    const major = majorOf(key);
    const inPlan = dctx.map((x) => x.date >= p.startDate && x.date <= cal.race && majorOf(blockKeyOn(x.date, cal)) === major);
    const k = Math.round(daysBetween(cal.w1, mon) / 7);
    const q = Math.max(0, Math.round(daysBetween(prepMon, mon) / 7));
    const focusList = FOCUS[key];
    const focusIdx = major === 'prep' ? q : k;

    if (major === 'vac') {
      weeks.push({ index, start: mon, phase, focus: addDays(mon, 3) > cal.vacEnd ? 'Retour en douceur. On reprend le fil sans rien rattraper.' : FOCUS.vacances[0], sessions: holidayWeek(dctx, inPlan, cal, pregnant, ttc) });
      continue;
    }

    if (major === 'prep' && !prepStarted) {
      // After the holidays: restart a little below the December level.
      prepStarted = true;
      lv.run = Math.max(set.runBaseMin, lv.run * 0.9);
      lv.bike = Math.max(75, lv.bike * 0.85);
    }
    const vol = major === 'pre' ? preVol(k, key, lv) : prepVol(q, key, lv);
    const w: WeekCtx = { mon, k, q, key, vol, days: dctx, inPlan, pregnant, ttc, prep: major === 'prep' };
    let n = set.sessionsPerWeek;
    if (major === 'prep') n = Math.max(n, key === 'affutage' ? 4 : q < 3 ? 4 : 5);
    const planDays = inPlan.filter(Boolean).length;
    if (planDays < 7) n = Math.min(n, Math.ceil((n * planDays) / 7));

    const picks = assign(weekKinds(n), w);
    const byDay = new Map<number, Spec[]>();
    const add = (d: number, s: Spec) => {
      const list = byDay.get(d) ?? [];
      if (list.some((x) => x.sport === s.sport)) return false;
      list.push(s);
      byDay.set(d, list);
      return true;
    };
    for (const { opt } of picks) add(opt.day, makeSession(opt.v, w, dctx[opt.day]));

    // Swim moved away from its usual day because of the no-swim window: say so.
    const usual = [0, 1, 2, 3, 4, 5, 6].filter((d) => inPlan[d] && !dctx[d].basket).sort((a, b) => SWIM_PREF[a] - SWIM_PREF[b])[0];
    if (usual !== undefined && dctx[usual].noSwim) {
      for (const [d, list] of byDay) for (const s of list) {
        if (s.sport === 'swim' && d !== usual) s.note = `Piscine décalée : pas de nage autour des règles, alors on la place ${DAY_NAMES[d]}.`;
      }
    }

    // Strength as an optional add-on when it is not one of the week's sessions.
    if (!picks.some((x) => x.kind === 'strength')) {
      const host = picks
        .filter(({ opt }) => (opt.v === 'runKey' || opt.v === 'run' || opt.v === 'swim') && dctx[opt.day].phase !== 'regles' && dctx[opt.day].phase !== 'retard')
        .sort((a, b) => (a.opt.v === 'runKey' ? -1 : 0) - (b.opt.v === 'runKey' ? -1 : 0))[0];
      if (host) add(host.opt.day, optionalStrength(w, dctx[host.opt.day]));
    }

    // One optional stretching moment: an empty day after basket or in the period, else a basket evening.
    const empty = (d: number) => inPlan[d] && !dctx[d].basket && !byDay.has(d);
    const mobDay = [0, 1, 2, 3, 4, 5, 6].find((d) => empty(d) && (dctx[d].afterBasket || dctx[d].phase === 'regles'))
      ?? [0, 1, 2, 3, 4, 5, 6].find((d) => inPlan[d] && dctx[d].basket)
      ?? [0, 1, 2, 3, 4, 5, 6].find((d) => empty(d));
    const hasMobility = [...byDay.values()].some((l) => l.some((x) => x.sport === 'mobility'));
    if (mobDay !== undefined && !hasMobility) add(mobDay, optionalMobility(dctx[mobDay], pregnant));

    const sessions: PlannedSession[] = [];
    for (const d of [...byDay.keys()].sort((a, b) => a - b)) {
      const list = byDay.get(d)!.sort((a, b) => Number(!!a.optional) - Number(!!b.optional));
      for (const s of list) sessions.push(toSession(addDays(mon, d), s));
    }
    grow(lv, vol, sessions, major === 'prep');
    weeks.push({ index, start: mon, phase, focus: focusList[focusIdx % focusList.length], sessions });
  }
  return built;
}

function holidayWeek(dctx: DayCtx[], inPlan: boolean[], cal: Calendar, pregnant: boolean, ttc: boolean): PlannedSession[] {
  const out: PlannedSession[] = [];
  const returning = addDays(dctx[0].date, 3) > cal.vacEnd;
  const why = (x: DayCtx) => whyLine(x.phase, { ttc, pregnant, afterBasket: x.afterBasket, sport: 'other' });
  const free = (d: number) => inPlan[d] && !dctx[d].basket;
  const used = new Set<number>();
  const pickDay = (prefs: number[], ok: (d: number) => boolean) => {
    const d = prefs.find((x) => free(x) && !used.has(x) && ok(x));
    if (d !== undefined) used.add(d);
    return d;
  };
  // Swim (sea on holiday), walk, mobility: all optional.
  const swimDay = pickDay([1, 3, 5, 0, 2, 4, 6], (d) => !dctx[d].noSwim);
  if (swimDay !== undefined) {
    const x = dctx[swimDay];
    out.push(toSession(x.date, returning
      ? { sport: 'swim', title: 'Natation tranquille', minutes: 30, intensity: 'facile', optional: true, details: '30 min de nage facile, avec quelques longueurs de battements.', mini: MINI.swim, why: why(x) }
      : { sport: 'swim', title: 'Nage en mer', minutes: 25, intensity: 'facile', optional: true, details: 'Nage le long de la plage, tranquille, 20 à 30 min. Reste près du bord, avec quelqu’un en vue, et de la crème solaire.', mini: '10 min de nage + 5 min à flotter.', why: why(x) }));
  } else {
    const d = pickDay([1, 3, 5, 0, 2, 4, 6], () => true);
    if (d !== undefined) {
      const x = dctx[d];
      out.push(toSession(x.date, { sport: 'walk', title: returning ? 'Marche tranquille' : 'Balade sur la plage', minutes: 30, intensity: 'facile', optional: true, details: '30 min de marche à ton rythme, pieds nus si tu peux.', mini: MINI.walk, why: why(x), note: 'Pas de baignade sportive autour des règles : on la remplace par une balade.' }));
    }
  }
  const walkDay = pickDay([3, 5, 6, 2, 4, 0, 1], () => true);
  if (walkDay !== undefined) {
    const x = dctx[walkDay];
    out.push(toSession(x.date, returning
      ? { sport: 'bike', title: 'Vélo tranquille', minutes: 40, intensity: 'facile', optional: true, details: '40 min dehors en endurance pour dérouiller les jambes. Mauvais temps : une marche rapide.', mini: MINI.bike, why: why(x) }
      : { sport: 'walk', title: 'Balade', minutes: 45, intensity: 'facile', optional: true, details: 'Une marche ou une petite rando, au rythme des pauses photo.', mini: MINI.walk, why: why(x) }));
  }
  const mobDay = pickDay([6, 5, 4, 0, 2, 1, 3], () => true);
  if (mobDay !== undefined) {
    const x = dctx[mobDay];
    out.push(toSession(x.date, { sport: 'mobility', title: returning ? 'Mobilité' : 'Étirements face à la mer', minutes: 15, intensity: 'facile', optional: true, details: 'Au lever : hanches, dos, épaules, 1 min par mouvement, puis quelques respirations lentes.', mini: MINI.mobility, why: why(x) }));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function raceWeek(p: Profile, cal: Calendar, dctx: DayCtx[], pregnant: boolean): PlannedSession[] {
  const race = cal.race;
  const raceMon = mondayOf(race);
  const plan: { off: number; spec: Spec }[] = [
    { off: -5, spec: { sport: 'swim', title: 'Natation activation', minutes: 30, intensity: 'facile', details: '1 200 m faciles dont 4 × 100 m à allure course.', mini: MINI.swim } },
    { off: -4, spec: { sport: 'bike', title: 'Vélo activation', minutes: 40, intensity: 'facile', details: '40 min dehors, faciles, dont 3 × 3 min à allure course.', mini: MINI.bike } },
    { off: -3, spec: { sport: 'run', title: 'Course activation', minutes: 25, intensity: 'facile', details: '20 min faciles en continu + 4 lignes droites. Tu sors en te sentant bien.', mini: MINI.run } },
    { off: -1, spec: { sport: 'bike', title: 'Déblocage', minutes: 30, intensity: 'facile', details: '20 min de vélo tranquille + 10 min de course très lente. Prépare ton sac, dors tôt.', mini: '10 min de vélo, c’est suffisant.' } },
    {
      off: 0,
      spec: {
        sport: 'other', title: `Jour J : ${p.raceName || 'Half Ironman'}`, minutes: 420, intensity: 'soutenu',
        details: '1,9 km de nage, 90 km de vélo, 21,1 km de course. Pars plus doucement que tu le crois, mange et bois toutes les 20 min sur le vélo. Souris à l’arrivée.',
        mini: '',
      },
    },
  ];
  const out: PlannedSession[] = [];
  for (const { off, spec } of plan) {
    const date = addDays(race, off);
    if (date < raceMon || date < cal.prepStart || date < p.startDate) continue;
    const x = dctx[weekday(date)];
    if (off !== 0 && x.basket) continue;
    const s: Spec = { ...spec, why: whyLine(x.phase, { ttc: false, pregnant, afterBasket: x.afterBasket, sport: spec.sport }) };
    if (off === 0) {
      s.why = 'Jour J : tout ce chemin pour ce moment. Profite.';
      if (x.noSwim) s.note = 'Tes règles pourraient tomber autour du jour J : prévois ta protection préférée pour la nage, et écoute-toi.';
      if (pregnant) s.note = 'Mode grossesse : la course est à valider avec ta sage-femme.';
    } else if (spec.sport === 'swim' && x.noSwim) {
      Object.assign(s, { sport: 'mobility', title: 'Étirements & mobilité', minutes: 20, details: MOBILITY_TXT, mini: MINI.mobility, note: 'Pas de piscine autour des règles : on la remplace par des étirements doux.' });
    } else if (spec.sport === 'run' && x.phase === 'regles') {
      Object.assign(s, { sport: 'walk', title: 'Marche tranquille', minutes: 25, details: '25 min de marche à ton rythme.', mini: MINI.walk, note: 'Règles : on remplace la course par une marche tranquille.' });
    }
    if (!s.mini) delete (s as Partial<Spec>).mini;
    out.push(toSession(date, s));
  }
  return out;
}

// ---------- cycle-aware helpers used by the screens ----------

/**
 * Lower a session's intensity to `cap` when it is above it.
 * `reason` prefixes the note (e.g. "Phase lutéale", "Mode grossesse").
 */
export function adaptSession(
  s: PlannedSession,
  cap: Intensity,
  reason = 'Cette phase',
): { session: PlannedSession; note?: string } {
  if (RANK[s.intensity] <= RANK[cap]) return { session: s, note: s.note };
  return {
    session: { ...s, intensity: cap },
    note: s.note ?? `${reason} : garde-la tranquille, en endurance.`,
  };
}

/**
 * Cycle position on `date` as the plan sees it: logged cycles, then projected ones
 * (estimate), also before the first logged period. Null when tracking is off, in
 * pregnancy mode, or when no period is logged.
 */
export function cycleForecast(date: string, p: Profile, days: Days, asOf?: string): CycleInfo | null {
  return build(p, days, asOf).fc?.pos(date)?.info ?? null;
}

/** Intensity ceiling for `date` from the cycle (or pregnancy), with the note prefix. */
export function sessionCapOn(date: string, p: Profile, days: Days, asOf?: string): { cap: Intensity; reason?: string } {
  const cs = cycleSettings(p);
  if (cs.pregnant) return { cap: 'modéré', reason: 'Mode grossesse' };
  const d = planDay(date, p, days, asOf);
  if (!d.phase) return { cap: 'soutenu' };
  const cap: Intensity = d.phase === 'regles' || d.phase === 'premenstruel' ? 'facile' : d.phase === 'luteale' || d.phase === 'retard' ? 'modéré' : 'soutenu';
  return { cap, reason: phaseLabel(d.phase) };
}

/** Planned sessions on `date` (already cycle-aware), with their note. */
export function adaptedSessionsOn(date: string, p: Profile, days: Days, asOf?: string): { session: PlannedSession; note?: string }[] {
  const { cap, reason } = sessionCapOn(date, p, days, asOf);
  return sessionsOn(date, p, days, asOf).map((s) => (s.sport === 'other' ? { session: s, note: s.note } : adaptSession(s, cap, reason)));
}

/** Days of the week starting `weekStart` in follicular/fertile phase: good days for key sessions (estimate). */
export function goodDays(weekStart: string, p: Profile, days: Days, asOf?: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const ph = planDay(d, p, days, asOf).phase;
    if (ph === 'folliculaire' || ph === 'fertile') out.push(d);
  }
  return out;
}

// ---------- season ----------

function blocks(p: Profile, c: Calendar): SeasonBlock[] {
  const raw: SeasonBlock[] = [
    { name: 'Reprise', start: p.startDate, end: addDays(c.fondStart, -1), goal: 'Retrouver le plaisir : tes séances + basket, calées sur ton cycle, course en continu.' },
    { name: 'Fondations', start: c.fondStart, end: addDays(c.consStart, -1), goal: 'Courir 40 min en continu, nager 800 m sans t’arrêter, sortie vélo d’1 h.' },
    { name: 'Consolidation', start: c.consStart, end: addDays(c.vacStart, -1), goal: 'Sortie vélo vers 1 h 30, un peu de tempo en phase folliculaire.' },
    { name: 'Maldives', start: c.vacStart, end: addDays(c.prepStart, -1), goal: 'Nager en mer (hors règles), marcher, profiter. Puis reprendre en douceur.' },
    { name: 'Base', start: c.prepStart, end: addDays(c.buildStart, -1), goal: 'Du volume facile : vélo vers 2 h, course vers 1 h.' },
    { name: 'Construction', start: c.buildStart, end: addDays(c.specStart, -1), goal: 'Allure half sur les trois sports, sorties longues qui grandissent.' },
    { name: 'Spécifique', start: c.specStart, end: addDays(c.taperStart, -1), goal: 'Répéter la course : vélo 3 h, course 1 h 45, nage 2 500 m.' },
    { name: 'Affûtage', start: c.taperStart, end: addDays(c.race, -1), goal: 'Moins de volume, un peu de rythme : arriver reposée.' },
    { name: 'Course', start: c.race, end: c.race, goal: '1,9 km · 90 km · 21,1 km. Profite de chaque kilomètre.' },
  ];
  return raw
    .map((b) => ({ ...b, start: maxD(b.start, p.startDate), end: minD(b.end, c.race) }))
    .filter((b) => b.start <= b.end);
}
