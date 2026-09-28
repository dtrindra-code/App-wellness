// Energy targets, phases and weight-trend maths. Pure functions only.

import type { DayLog, PhaseId, Profile, Sport, Workout } from '../types';
import { addDays, daysBetween } from './dates';
import { cycleSettings } from './cycle';

export interface PhaseInfo {
  id: PhaseId;
  label: string;
  /** One sentence the Today screen can show. */
  hint: string;
  start: string;
  end: string;
}

export function phases(p: Profile): PhaseInfo[] {
  return [
    { id: 'avant', label: 'Avant le départ', hint: 'On démarre bientôt.', start: '2000-01-01', end: addDays(p.startDate, -1) },
    { id: 'lavage', label: 'Lavage', hint: 'Moins de sel, de sucre et d’alcool, beaucoup d’eau, des protéines à chaque repas.', start: p.startDate, end: p.lavageEnd },
    { id: 'progressive', label: 'Perte progressive', hint: 'Déficit régulier, on garde les protéines hautes et on bouge un peu chaque jour.', start: addDays(p.lavageEnd, 1), end: addDays(p.vacationStart, -1) },
    { id: 'vacances', label: 'Maldives', hint: 'Profite. Nage dans le lagon, marche, et reste à peu près à l’équilibre.', start: p.vacationStart, end: addDays(p.prepStart, -1) },
    { id: 'prepa', label: 'Prépa half', hint: 'L’entraînement devient la priorité : on mange pour s’entraîner.', start: p.prepStart, end: addDays(p.raceDate, -1) },
    { id: 'course', label: 'Course', hint: 'Jour J.', start: p.raceDate, end: '2100-01-01' },
  ];
}

export function phaseOn(date: string, p: Profile): PhaseInfo {
  return phases(p).find((ph) => date >= ph.start && date <= ph.end) ?? phases(p)[0];
}

/** Mifflin–St Jeor. Falls back to a sex-neutral average when sex is unknown. */
export function bmr(p: Profile, weight: number): number {
  const age = p.age ?? 35;
  const base = 10 * weight + 6.25 * p.heightCm - 5 * age;
  const sexAdj = p.sex === 'm' ? 5 : p.sex === 'f' ? -161 : -78;
  return Math.round(base + sexAdj);
}

/** Maintenance calories excluding logged workouts. */
export function maintenance(p: Profile, weight: number): number {
  return Math.round(bmr(p, weight) * p.activity);
}

const MET: Record<Sport, number> = {
  swim: 7,
  bike: 6,
  run: 8.5,
  strength: 4.5,
  basket: 6.5,
  walk: 3.5,
  mobility: 2.5,
  other: 5,
};

export function workoutKcal(w: Workout, weight: number): number {
  const effort = w.rpe ? 0.7 + w.rpe * 0.06 : 1; // rpe 5 => 1.0
  return Math.round((MET[w.sport] ?? MET.other) * weight * ((w.minutes || 0) / 60) * effort) || 0;
}

export interface Targets {
  /** Base calorie target for the day, before workouts. */
  kcal: number;
  /** Extra budget earned by today's workouts (50 % of their estimated burn). */
  sportBonus: number;
  /** kcal + sportBonus. */
  budget: number;
  protein: number;
  /** Soft carb ceiling in grams (only during lavage). */
  carbsMax?: number;
  waterL: number;
  maintenance: number;
  floor: number;
}

/**
 * Daily targets. `cycleAdjust` = extra kcal from the cycle phase (see lib/cycle.ts adviceFor().kcalAdjust).
 * Safety rules: while trying to conceive the deficit is capped and the floor is 1400 kcal;
 * in pregnancy mode there is no deficit at all. Faster loss must come from movement, never from eating less.
 */
export function targets(date: string, p: Profile, weight: number, day?: DayLog, cycleAdjust = 0): Targets {
  const phase = phaseOn(date, p).id;
  // Same defaults as the cycle screens (old profiles without `cycle` get DEFAULT_CYCLE).
  const { ttc, pregnant } = cycleSettings(p);
  const maint = maintenance(p, weight);
  const floor = pregnant ? maint : Math.max(ttc ? 1400 : 1200, bmr(p, weight));
  let deficit = phase === 'lavage' ? 600 : phase === 'progressive' ? 500 : phase === 'avant' ? 300 : phase === 'prepa' ? 250 : 0;
  if (ttc) deficit = Math.min(deficit, 450);
  if (pregnant) deficit = 0;
  const kcal = Math.max(floor, Math.round((maint - deficit + (pregnant ? 0 : cycleAdjust)) / 10) * 10);
  const burn = (day?.workouts ?? []).reduce((s, w) => s + workoutKcal(w, weight), 0);
  const sportBonus = Math.round((burn * 0.5) / 10) * 10;
  return {
    kcal,
    sportBonus,
    budget: kcal + sportBonus,
    protein: Math.round(weight * (pregnant ? 1.2 : 1.8)),
    carbsMax: phase === 'lavage' && !pregnant ? (ttc ? 120 : 100) : undefined,
    waterL: phase === 'lavage' ? 2.5 : 2,
    maintenance: maint,
    floor,
  };
}

/**
 * How much the diet alone covers of a weekly loss pace, and what is left for movement.
 * Returns kcal/day: `dietDeficit` from targets, `neededDeficit` for `kgPerWeek`, `moveKcal` = the gap (>= 0).
 */
export function paceBreakdown(date: string, p: Profile, weight: number, kgPerWeek: number) {
  const t = targets(date, p, weight);
  const dietDeficit = Math.max(0, t.maintenance - t.kcal);
  const neededDeficit = Math.round((kgPerWeek * 7700) / 7);
  return { dietDeficit, neededDeficit, moveKcal: Math.max(0, neededDeficit - dietDeficit) };
}

export function totals(day: DayLog) {
  return day.meals.reduce(
    (t, m) => ({
      kcal: t.kcal + (m.kcal || 0),
      protein: t.protein + (m.protein || 0),
      carbs: t.carbs + (m.carbs || 0),
      fat: t.fat + (m.fat || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** Trailing moving average (window in days, calendar-based). */
export function movingAverage(points: { date: string; weight: number }[], windowDays = 7) {
  return points.map((pt) => {
    const from = addDays(pt.date, -(windowDays - 1));
    const win = points.filter((q) => q.date >= from && q.date <= pt.date);
    const avg = win.reduce((s, q) => s + q.weight, 0) / win.length;
    return { date: pt.date, avg: Math.round(avg * 10) / 10 };
  });
}

/** Least-squares slope in kg/day over the last `days` days (null if < 3 points). */
export function slopePerDay(points: { date: string; weight: number }[], days = 14): number | null {
  if (!points.length) return null;
  const last = points[points.length - 1].date;
  const win = points.filter((p) => daysBetween(p.date, last) < days);
  if (win.length < 3) return null;
  const xs = win.map((p) => daysBetween(win[0].date, p.date));
  const ys = win.map((p) => p.weight);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return den ? num / den : null;
}

/** Weight the plan expects on `date`: fast drop during lavage, then linear to goal. */
export function plannedWeight(date: string, p: Profile): number {
  // Goal above the start weight: no planned loss (keeps the curve monotone).
  const total = Math.max(0, p.startWeight - p.goalWeight);
  const lavageDrop = Math.min(3, total * 0.3);
  if (date <= p.startDate) return p.startWeight;
  if (date <= p.lavageEnd) {
    const f = daysBetween(p.startDate, date) / Math.max(1, daysBetween(p.startDate, p.lavageEnd));
    return round1(p.startWeight - lavageDrop * f);
  }
  if (date >= p.goalDate) {
    const milestone = p.startWeight - total;
    const final = p.finalGoalWeight ?? milestone;
    if (!(final < milestone)) return round1(milestone);
    // Holidays: hold the milestone. Then −0.5 kg/week until the final goal,
    // starting at the later of the milestone date and the prep start.
    if (date < p.prepStart) return round1(milestone);
    const from = p.goalDate > p.prepStart ? p.goalDate : p.prepStart;
    const weeks = daysBetween(from, date) / 7;
    return round1(Math.max(final, milestone - 0.5 * weeks));
  }
  const f = daysBetween(p.lavageEnd, date) / Math.max(1, daysBetween(p.lavageEnd, p.goalDate));
  return round1(p.startWeight - lavageDrop - (total - lavageDrop) * f);
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
