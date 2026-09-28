// Daily lifestyle pillars (sleep, stress, cortisol) + small wellbeing maths
// used by the Équilibre tab and, via recoveryFlag(), by Today / Sport.
// Pure functions only. Wording stays modest: these are habits that help
// most people, not medical rules.

import type { DayLog } from '../types';
import { addDays, daysBetween, mondayOf } from './dates';
import { slopePerDay } from './nutrition';

export interface Habit { key: string; label: string; why: string }

export const HABITS: Habit[] = [
  {
    key: 'sleep',
    label: 'Sommeil 7 h ou plus, horaires réguliers',
    why: 'Après une nuit courte, la faim et l’envie de sucre montent souvent le lendemain ; des horaires réguliers comptent presque autant que la durée.',
  },
  {
    key: 'light',
    label: 'Lumière du matin, 10 min dehors',
    why: 'La lumière du jour tôt le matin aide à caler l’horloge interne : l’endormissement du soir est souvent plus facile.',
  },
  {
    key: 'coherence',
    label: 'Cohérence cardiaque ×3',
    why: 'Respirer lentement, environ 6 fois par minute, active le « frein » du système nerveux ; plusieurs études montrent une baisse du stress ressenti.',
  },
  {
    key: 'walk',
    label: 'Marche 20–30 min ou 8 000 pas',
    why: 'La marche fait baisser le stress sans fatiguer, et elle pèse vraiment dans la dépense de la journée.',
  },
  {
    key: 'coffee',
    label: 'Pas de café après 14 h',
    why: 'La moitié de la caféine est encore là 5 à 6 h après la tasse : le café de l’après-midi peut alléger le sommeil sans qu’on le sente.',
  },
  {
    key: 'screens',
    label: 'Écrans off 30 min avant le coucher',
    why: 'Lumière et notifications retardent souvent l’endormissement ; une demi-heure calme aide beaucoup de gens à mieux dormir.',
  },
  {
    key: 'breakfast',
    label: 'Petit-déj protéiné, pas de repas sauté',
    why: 'Sauter un repas puis arriver affamée pousse aux fringales ; des protéines le matin aident à tenir jusqu’au midi.',
  },
  {
    key: 'me',
    label: 'Un moment pour toi (10 min sans rien faire)',
    why: 'Dix minutes sans objectif, c’est une vraie pause pour le système nerveux, pas du temps perdu.',
  },
];

/** Key of the breathing habit, ticked automatically after 3 sessions. */
export const COHERENCE_KEY = 'coherence';
/** Breathing sessions per day that tick the habit. */
export const COHERENCE_TARGET = 3;

/** Number of pillars ticked on a day (0…HABITS.length). */
export function habitScore(day: DayLog | undefined): number {
  if (!day?.habits) return 0;
  return HABITS.reduce((n, hb) => n + (day.habits![hb.key] ? 1 : 0), 0);
}

export interface WeekHabitStats {
  /** Monday … Sunday. */
  days: { date: string; done: number }[];
  total: number;
  /** HABITS.length × 7. */
  max: number;
  /** Average pillars per day over the days that have at least one tick. */
  avg: number;
}

/** Pillars ticked per day for the week starting `monday` (any date works: it is snapped to its Monday). */
export function weekHabitStats(days: Record<string, DayLog>, monday: string): WeekHabitStats {
  const start = mondayOf(monday);
  const list = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, done: habitScore(days[date]) };
  });
  const total = list.reduce((s, d) => s + d.done, 0);
  const active = list.filter((d) => d.done > 0).length;
  return { days: list, total, max: HABITS.length * 7, avg: active ? Math.round((total / active) * 10) / 10 : 0 };
}

export interface RecoveryFlag { low: boolean; reason: string }

/**
 * Low-recovery day: last night < 6 h (sleep logged on `date`, else the day before),
 * Body Battery at wake-up < 30, or average stress ≥ 50 (today's, else yesterday's).
 * `reason` is short French, e.g. "Stress haut + sommeil court" (empty when not low).
 */
export function recoveryFlag(date: string, days: Record<string, DayLog>): RecoveryFlag {
  const t = days[date]?.wellbeing;
  const y = days[addDays(date, -1)]?.wellbeing;
  const sleep = t?.sleepH ?? y?.sleepH;
  const stress = t?.stress ?? y?.stress;
  const bb = t?.bodyBattery;
  const parts: string[] = [];
  if (stress !== undefined && stress >= 50) parts.push('stress haut');
  if (sleep !== undefined && sleep < 6) parts.push('sommeil court');
  if (bb !== undefined && bb < 30) parts.push('Body Battery bas');
  if (!parts.length) return { low: false, reason: '' };
  const reason = parts.join(' + ');
  return { low: true, reason: reason.charAt(0).toUpperCase() + reason.slice(1) };
}

export interface SleepWeightInsight {
  /** Average weight trend in kg/week on weeks with average sleep ≥ 7 h. */
  goodSlope: number;
  /** Same for weeks with average sleep < 7 h. */
  shortSlope: number;
  goodWeeks: number;
  shortWeeks: number;
}

/**
 * Compares the weekly weight slope on well-slept vs short-slept weeks (last `weeks` weeks).
 * A week counts when it has ≥ 4 nights and ≥ 3 weigh-ins logged. Null until each group has a week.
 */
export function sleepWeightInsight(days: Record<string, DayLog>, date: string, weeks = 12): SleepWeightInsight | null {
  const good: number[] = [];
  const short: number[] = [];
  const thisMonday = mondayOf(date);
  for (let w = 0; w < weeks; w++) {
    const mon = addDays(thisMonday, -7 * w);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(mon, i)).filter((d) => d <= date);
    const sleeps = dates.map((d) => days[d]?.wellbeing?.sleepH).filter((v): v is number => typeof v === 'number');
    const pts = dates
      .filter((d) => typeof days[d]?.weight === 'number')
      .map((d) => ({ date: d, weight: days[d].weight as number }));
    if (sleeps.length < 4 || pts.length < 3) continue;
    const slope = slopePerDay(pts, 7);
    if (slope === null) continue;
    const avgSleep = sleeps.reduce((a, b) => a + b, 0) / sleeps.length;
    (avgSleep >= 7 ? good : short).push(slope * 7);
  }
  if (!good.length || !short.length) return null;
  const mean = (a: number[]) => Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100;
  return { goodSlope: mean(good), shortSlope: mean(short), goodWeeks: good.length, shortWeeks: short.length };
}

/** Wellbeing entries in the `n` days ending on `date` (inclusive). */
export function recentWellbeing(days: Record<string, DayLog>, date: string, n = 7) {
  return Array.from({ length: n }, (_, i) => addDays(date, -i))
    .map((d) => ({ date: d, wb: days[d]?.wellbeing }))
    .filter((x) => x.wb && daysBetween(x.date, date) < n);
}
