// Period aggregation for the "Progrès" tab. Pure functions over AppState.
// A period is the current week (Mon → today), the current calendar month (1st → today)
// or everything since profile.startDate. Week and month are compared with the same
// number of elapsed days of the previous week / month (fair "à la même date" comparison).
// Missing data gives null (never 0 pretending to be a value), and nothing returns NaN.

import type { AppState, Profile, SlipTrigger, Sport } from '../types';
import { addDays, daysBetween, mondayOf, range } from './dates';
import { movingAverage, round1, targets, totals } from './nutrition';
import { adviceFor, cycleModel, cycleOn, cycleSettings, phaseLabel, positionOn } from './cycle';
import type { CyclePhase } from './cycle';
import { HABITS, habitScore } from './habits';
import { sessionsOn } from '../data/plan';
import type { PlannedSession } from '../types';

export type Period = 'semaine' | 'mois' | 'debut';

export interface Span { from: string; to: string }

export interface PeriodSpans {
  period: Period;
  cur: Span;
  /** Same elapsed length of the previous week / month; null for "depuis le début". */
  prev: Span | null;
  /** True when the period has not started yet (plan start in the future). */
  empty: boolean;
}

const lastDayOfMonth = (iso: string) => addDays(addDays(iso.slice(0, 8) + '01', 32).slice(0, 8) + '01', -1);

export function periodSpans(period: Period, date: string, p: Profile): PeriodSpans {
  if (period === 'semaine') {
    const mon = mondayOf(date);
    return { period, cur: { from: mon, to: date }, prev: { from: addDays(mon, -7), to: addDays(date, -7) }, empty: false };
  }
  if (period === 'mois') {
    const first = date.slice(0, 8) + '01';
    const prevFirst = addDays(first, -1).slice(0, 8) + '01';
    const prevLast = lastDayOfMonth(prevFirst);
    const sameDay = prevFirst.slice(0, 8) + date.slice(8);
    return { period, cur: { from: first, to: date }, prev: { from: prevFirst, to: sameDay < prevLast ? sameDay : prevLast }, empty: false };
  }
  const from = p.startDate;
  return { period, cur: { from: from <= date ? from : date, to: date }, prev: null, empty: from > date };
}

// ---------- small maths ----------

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r1 = (n: number | null) => (n === null ? null : round1(n));
const r0 = (n: number | null) => (n === null ? null : Math.round(n));

/** Extra kcal allowed by the cycle phase on `date` (0 when off, unknown or pregnant). */
export function cycleAdjustOn(date: string, state: AppState): number {
  const p = state.profile;
  const cs = cycleSettings(p);
  if (!cs.tracking || cs.pregnant) return 0;
  const info = cycleOn(date, p, state.days);
  return info ? adviceFor(info, p, date).kcalAdjust : 0;
}

function weightsUpTo(state: AppState, to: string) {
  return Object.values(state.days)
    .filter((d) => fin(d.weight) && d.date <= to)
    .map((d) => ({ date: d.date, weight: d.weight as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function weightOn(state: AppState, date: string): number {
  const ws = weightsUpTo(state, date);
  return ws.length ? ws[ws.length - 1].weight : state.profile.startWeight;
}

/** Planned sessions of a day; never throws (the plan is generated from the profile). */
function plannedOn(date: string, p: Profile): PlannedSession[] {
  try { return sessionsOn(date, p).filter((x) => !x.optional); } catch { return []; }
}

// ---------- weight ----------

export interface WeightStats {
  weighIns: number;
  /** 7-day average at the start of the period (last value before it, if within a week) and at its end. */
  startAvg: number | null;
  startDate: string | null;
  endAvg: number | null;
  endDate: string | null;
  /** endAvg − startAvg (kg), null without two distinct points. */
  delta: number | null;
  /** endAvg − palier / final goal (kg, positive = still to go). */
  toGoal: number | null;
  toFinal: number | null;
}

export function weightStats(state: AppState, sp: Span): WeightStats {
  const p = state.profile;
  const ws = weightsUpTo(state, sp.to);
  const ma = movingAverage(ws, 7);
  const inSpan = ma.filter((x) => x.date >= sp.from);
  const before = ma.filter((x) => x.date < sp.from && daysBetween(x.date, sp.from) <= 7).pop();
  const start = before ?? inSpan[0] ?? null;
  const end = inSpan[inSpan.length - 1] ?? null;
  const delta = start && end && start.date < end.date ? round1(end.avg - start.avg) : null;
  const toGoal = end ? round1(end.avg - p.goalWeight) : null;
  const toFinal = end && fin(p.finalGoalWeight) ? round1(end.avg - p.finalGoalWeight) : null;
  return {
    weighIns: inSpan.length,
    startAvg: start?.avg ?? null, startDate: start?.date ?? null,
    endAvg: end?.avg ?? null, endDate: end?.date ?? null,
    delta, toGoal, toFinal,
  };
}

// ---------- nutrition ----------

export interface NutritionDay { date: string; kcal: number | null; budget: number }

export interface NutritionStats {
  days: number;
  daysLogged: number;
  avgKcal: number | null;
  /** Average daily budget (target + sport bonus, cycle adjust included) over the logged days. */
  avgBudget: number | null;
  avgProtein: number | null;
  proteinTarget: number | null;
  /** Logged days where the protein reached 85 % of the target. */
  proteinDays: number;
  daysWithinBudget: number;
  slips: number;
  topTriggers: { trigger: SlipTrigger; count: number }[];
  perDay: NutritionDay[];
}

export function nutritionStats(state: AppState, sp: Span): NutritionStats {
  const p = state.profile;
  const kcals: number[] = [], budgets: number[] = [], prots: number[] = [], protTargets: number[] = [];
  let within = 0, proteinDays = 0, slips = 0;
  const trig = new Map<SlipTrigger, number>();
  const perDay: NutritionDay[] = [];
  for (const d of range(sp.from, sp.to)) {
    const day = state.days[d];
    const t = targets(d, p, weightOn(state, d), day, cycleAdjustOn(d, state));
    const logged = !!day && day.meals.length > 0;
    const tot = day ? totals(day) : null;
    perDay.push({ date: d, kcal: logged && tot ? Math.round(tot.kcal) : null, budget: t.budget });
    if (day) {
      slips += day.slips?.length ?? 0;
      for (const sl of day.slips ?? []) for (const tr of sl.triggers ?? []) trig.set(tr, (trig.get(tr) ?? 0) + 1);
    }
    if (!logged || !tot) continue;
    kcals.push(tot.kcal);
    budgets.push(t.budget);
    if (tot.kcal <= t.budget) within++;
    if (day!.meals.some((m) => fin(m.protein))) {
      prots.push(tot.protein);
      protTargets.push(t.protein);
      if (tot.protein >= t.protein * 0.85) proteinDays++;
    }
  }
  const topTriggers = [...trig.entries()]
    .filter(([t]) => t !== 'autre')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([trigger, count]) => ({ trigger, count }));
  return {
    days: perDay.length,
    daysLogged: kcals.length,
    avgKcal: r0(mean(kcals)),
    avgBudget: r0(mean(budgets)),
    avgProtein: r0(mean(prots)),
    proteinTarget: r0(mean(protTargets)),
    proteinDays,
    daysWithinBudget: within,
    slips,
    topTriggers,
    perDay,
  };
}

// ---------- sport ----------

export interface SportStats {
  /** Workouts logged (every sport counts, the mini version too). */
  sessions: number;
  minutes: number;
  /** Non-optional planned sessions in the period, and how many were completed. */
  planned: number;
  plannedDone: number;
  minis: number;
  basket: number;
  activeDays: number;
  perSport: { sport: Sport; minutes: number; count: number }[];
  run: { count: number; minutes: number; km: number | null; longestKm: number | null; longestMin: number | null } | null;
}

export function sportStats(state: AppState, sp: Span): SportStats {
  const p = state.profile;
  let sessions = 0, minutes = 0, minis = 0, basket = 0, activeDays = 0, planned = 0;
  const plannedIds = new Set<string>();
  const doneIds = new Set<string>();
  const per = new Map<Sport, { minutes: number; count: number }>();
  let runCount = 0, runMin = 0, runKm = 0, runKmN = 0, longestKm: number | null = null, longestMin: number | null = null;
  for (const d of range(sp.from, sp.to)) {
    for (const s of plannedOn(d, p)) { planned++; plannedIds.add(s.id); }
    const day = state.days[d];
    if (!day || !day.workouts.length) continue;
    activeDays++;
    for (const w of day.workouts) {
      sessions++;
      const m = fin(w.minutes) ? w.minutes : 0;
      minutes += m;
      if (w.mini) minis++;
      if (w.sport === 'basket') basket++;
      if (w.plannedId) doneIds.add(w.plannedId);
      const e = per.get(w.sport) ?? { minutes: 0, count: 0 };
      e.minutes += m; e.count++;
      per.set(w.sport, e);
      if (w.sport === 'run') {
        runCount++; runMin += m;
        if (fin(w.distanceKm)) { runKm += w.distanceKm; runKmN++; if (longestKm === null || w.distanceKm > longestKm) longestKm = w.distanceKm; }
        if (longestMin === null || m > longestMin) longestMin = m;
      }
    }
  }
  const plannedDone = [...plannedIds].filter((id) => doneIds.has(id)).length;
  return {
    sessions, minutes: Math.round(minutes), planned, plannedDone, minis, basket, activeDays,
    perSport: [...per.entries()].map(([sport, v]) => ({ sport, minutes: Math.round(v.minutes), count: v.count })).sort((a, b) => b.minutes - a.minutes),
    run: runCount ? { count: runCount, minutes: Math.round(runMin), km: runKmN ? round1(runKm) : null, longestKm: longestKm === null ? null : round1(longestKm), longestMin } : null,
  };
}

/** Workouts per Monday → Sunday week, the last `n` weeks ending with the week of `date`. */
export function weeklySessions(state: AppState, date: string, n = 8): { monday: string; count: number; minutes: number }[] {
  const mon = mondayOf(date);
  return Array.from({ length: n }, (_, i) => addDays(mon, -7 * (n - 1 - i))).map((monday) => {
    let count = 0, minutes = 0;
    for (let k = 0; k < 7; k++) {
      const d = addDays(monday, k);
      if (d > date) break;
      for (const w of state.days[d]?.workouts ?? []) { count++; minutes += fin(w.minutes) ? w.minutes : 0; }
    }
    return { monday, count, minutes: Math.round(minutes) };
  });
}

// ---------- équilibre ----------

export interface BalanceStats {
  /** Average pillars ticked per day, over the days with at least one tick. */
  pillarsAvg: number | null;
  pillarDays: number;
  pillarsMax: number;
  sleepAvg: number | null;
  sleepNights: number;
  shortNights: number;
  stressAvg: number | null;
  bodyBatteryAvg: number | null;
  breathing: number;
  perNight: { date: string; sleepH: number | null }[];
}

export function balanceStats(state: AppState, sp: Span): BalanceStats {
  const pillars: number[] = [], sleeps: number[] = [], stress: number[] = [], bb: number[] = [];
  let breathing = 0;
  const perNight: { date: string; sleepH: number | null }[] = [];
  for (const d of range(sp.from, sp.to)) {
    const day = state.days[d];
    const wb = day?.wellbeing;
    perNight.push({ date: d, sleepH: fin(wb?.sleepH) ? wb!.sleepH! : null });
    if (!day) continue;
    const sc = habitScore(day);
    if (sc > 0) pillars.push(sc);
    if (fin(wb?.sleepH)) sleeps.push(wb!.sleepH!);
    if (fin(wb?.stress)) stress.push(wb!.stress!);
    if (fin(wb?.bodyBattery)) bb.push(wb!.bodyBattery!);
    if (fin(wb?.breathing)) breathing += wb!.breathing!;
  }
  return {
    pillarsAvg: r1(mean(pillars)), pillarDays: pillars.length, pillarsMax: HABITS.length,
    sleepAvg: r1(mean(sleeps)), sleepNights: sleeps.length, shortNights: sleeps.filter((h) => h < 6).length,
    stressAvg: r0(mean(stress)), bodyBatteryAvg: r0(mean(bb)), breathing, perNight,
  };
}

// ---------- cycle ----------

export interface CyclePhaseStats {
  phase: CyclePhase;
  label: string;
  days: number;
  /** Average of (weigh-in − mean weight of its cycle), kg. Null with too few weigh-ins. */
  weightDelta: number | null;
  slips: number;
  energyAvg: number | null;
  sessions: number;
}

export interface CycleStats {
  tracking: boolean;
  pregnant: boolean;
  /** Period starts logged inside the period. */
  starts: number;
  /** Days of the period with a known cycle position. */
  knownDays: number;
  phases: CyclePhaseStats[];
}

const PHASE_ORDER: CyclePhase[] = ['regles', 'folliculaire', 'fertile', 'luteale', 'premenstruel', 'retard'];

export function cycleStats(state: AppState, sp: Span): CycleStats {
  const p = state.profile;
  const cs = cycleSettings(p);
  const empty: CycleStats = { tracking: cs.tracking, pregnant: cs.pregnant, starts: 0, knownDays: 0, phases: [] };
  if (!cs.tracking || cs.pregnant) return empty;
  const m = cycleModel(sp.to, p, state.days);
  if (!m.cycles.length) return empty;

  // Cycle baseline: mean weigh-in of each cycle (≥ 3 weigh-ins), over the whole cycle.
  const baseline = new Map<string, number>();
  m.cycles.forEach((c) => {
    const end = c.next ?? addDays(sp.to, 1);
    const ws = Object.values(state.days).filter((d) => fin(d.weight) && d.date >= c.start && d.date < end).map((d) => d.weight as number);
    if (ws.length >= 3) baseline.set(c.start, ws.reduce((a, b) => a + b, 0) / ws.length);
  });

  const acc = new Map<CyclePhase, { days: number; wd: number[]; slips: number; energy: number[]; sessions: number }>();
  let knownDays = 0;
  for (const d of range(sp.from, sp.to)) {
    const pos = positionOn(m, d);
    if (!pos) continue;
    knownDays++;
    const e = acc.get(pos.phase) ?? { days: 0, wd: [], slips: 0, energy: [], sessions: 0 };
    e.days++;
    const day = state.days[d];
    if (day) {
      const base = baseline.get(pos.cycleStart);
      if (fin(day.weight) && base !== undefined) e.wd.push(day.weight - base);
      e.slips += day.slips?.length ?? 0;
      if (fin(day.cycle?.energy)) e.energy.push(day.cycle!.energy!);
      e.sessions += day.workouts.length;
    }
    acc.set(pos.phase, e);
  }
  const starts = m.starts.filter((s) => s >= sp.from && s <= sp.to).length;
  const phases = PHASE_ORDER.filter((ph) => acc.has(ph)).map((ph) => {
    const e = acc.get(ph)!;
    return {
      phase: ph, label: phaseLabel(ph), days: e.days,
      weightDelta: e.wd.length >= 2 ? Math.round((mean(e.wd) ?? 0) * 10) / 10 : null,
      slips: e.slips, energyAvg: r1(mean(e.energy)), sessions: e.sessions,
    };
  });
  return { tracking: true, pregnant: false, starts, knownDays, phases };
}

// ---------- everything ----------

export interface Stats {
  span: Span;
  weight: WeightStats;
  nutrition: NutritionStats;
  sport: SportStats;
  balance: BalanceStats;
  cycle: CycleStats;
}

export function statsFor(state: AppState, sp: Span): Stats {
  return {
    span: sp,
    weight: weightStats(state, sp),
    nutrition: nutritionStats(state, sp),
    sport: sportStats(state, sp),
    balance: balanceStats(state, sp),
    cycle: cycleStats(state, sp),
  };
}

export interface PeriodStats {
  spans: PeriodSpans;
  cur: Stats;
  prev: Stats | null;
}

export function periodStats(period: Period, date: string, state: AppState): PeriodStats {
  const spans = periodSpans(period, date, state.profile);
  return {
    spans,
    cur: statsFor(state, spans.cur),
    prev: spans.prev ? statsFor(state, spans.prev) : null,
  };
}

/** a − b when both are numbers, else null. */
export function diff(a: number | null | undefined, b: number | null | undefined): number | null {
  return fin(a) && fin(b) ? a - b : null;
}
