// Shared data model. Dates are local ISO days: "YYYY-MM-DD".

import type { NeedKey } from './data/journey';

export type Sex = 'f' | 'm';

export interface Profile {
  onboarded: boolean;
  sex: Sex | null;
  age: number | null;
  heightCm: number;
  startWeight: number;
  /** First day of the plan (the "lavage" starts here). */
  startDate: string;
  /** Milestone weight (palier) to reach by goalDate — the holidays. */
  goalWeight: number;
  /** Deadline for the milestone (departure on holidays). */
  goalDate: string;
  /** Long-term weight goal, reached after the milestone at ~0.5 kg/week. */
  finalGoalWeight?: number;
  /** Last day of the fast "lavage" phase. */
  lavageEnd: string;
  vacationStart: string;
  vacationEnd: string;
  /** First day of the half-ironman specific preparation. */
  prepStart: string;
  raceDate: string;
  raceName: string;
  /** Activity factor applied to BMR, without logged workouts (1.2 sedentary … 1.5 active job). */
  activity: number;
  /** Weekdays with basketball, 0 = Monday … 6 = Sunday. */
  basketDays: number[];
  /** Menstrual cycle settings (absent on old profiles: see DEFAULT_CYCLE). */
  cycle?: CycleSettings;
  /** No swimming from this many days before a period starts (default 3). */
  noSwimBefore?: number;
  /** No swimming for this many days after a period ends (default 2). */
  noSwimAfter?: number;
  /** Minutes the user can run continuously at easy pace today (default 30): the plan's starting point. */
  runBaseMin?: number;
  /** Planned sessions per week on top of basketball (default 3; the half prep grows it to 5). */
  sessionsPerWeek?: number;
  /** "Revenir à moi": the 60-day journey (absent until she starts it). */
  journey?: JourneySettings;
}

/** "Revenir à moi" settings (lib/journey.ts). */
export interface JourneySettings {
  /** Day 1 of the 60 days. */
  startDate: string;
  /** Current engagements (keys of data/journey RULES). */
  rules: string[];
  /** Jokers used, by Monday of the week (kept in sync with DayLog.journey.joker). */
  jokersUsed: Record<string, number>;
  /** Earlier rule sets: `rules` applied from `from` (the newest entry ≤ a date wins; else `rules`). */
  history?: { from: string; rules: string[] }[];
}

/** One day of "Revenir à moi". */
export interface JourneyDay {
  /** Energy 1 … 5 (falls back to the morning mood when absent). */
  energy?: number;
  needs?: NeedKey[];
  /** Manual engagements ticked (auto ones are computed from the day). */
  rulesDone?: Record<string, boolean>;
  /** A joker was used: the day counts as réussie. */
  joker?: boolean;
  answer?: { chips: string[]; text?: string; skipped?: boolean };
}

export interface CycleSettings {
  tracking: boolean;
  /** Fallback cycle length until enough periods are logged. */
  avgLength: number;
  periodLength: number;
  lutealLength: number;
  /** Trying to conceive: deficit capped, fertile window highlighted. */
  ttc: boolean;
  /** Pregnancy mode: no deficit, pregnancy-safe sport guidance. */
  pregnant: boolean;
  pregnantSince?: string;
}

export interface CycleDay {
  /** 'start' marks cycle day 1. */
  period?: 'start' | 'flow' | 'spotting';
  lh?: 'neg' | 'pos';
  pregnancyTest?: 'neg' | 'pos';
  /** 1 (very low) … 5 (great). */
  energy?: number;
  symptoms?: string[];
}

export interface BodyComp {
  fatPct?: number;
  musclePct?: number;
  waterPct?: number;
  visceral?: number;
  bmr?: number;
}

export type MealSlot = 'petit-dej' | 'dejeuner' | 'diner' | 'collation';
export type MealSource = 'manuel' | 'favori' | 'photo' | 'hellofresh' | 'aliment';

export interface Meal {
  id: string;
  slot: MealSlot;
  name: string;
  kcal: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  source: MealSource;
  /** Quantity eaten in grams (food search). */
  grams?: number;
  /** Generic food id (lib/foods.ts) or Open Food Facts barcode. */
  foodId?: string;
  offCode?: string;
}

export interface FavoriteMeal {
  id: string;
  name: string;
  kcal: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  /** True for HelloFresh recipes (per portion). */
  hellofresh?: boolean;
}

export type Sport =
  | 'swim'
  | 'bike'
  | 'run'
  | 'strength'
  | 'basket'
  | 'walk'
  | 'mobility'
  | 'other';

export interface Workout {
  id: string;
  sport: Sport;
  minutes: number;
  /** Perceived effort 1–10. */
  rpe?: number;
  note?: string;
  /** Id of the planned session this workout completes, if any. */
  plannedId?: string;
  /** Done as the short "mini" version. */
  mini?: boolean;
  distanceKm?: number;
  steps?: number;
  /** True when minutes were estimated from distance or steps (no duration entered). */
  estimated?: boolean;
  /** Imported from Garmin Connect (lib/garmin.ts). */
  source?: 'garmin';
  /** Garmin activity id (dedupe: an activity is imported once). */
  garminId?: string;
  /** Start time "HH:MM" (Garmin). */
  time?: string;
  avgHr?: number;
  /** Calories counted by Garmin (shown only; the app keeps its own estimate). */
  calories?: number;
}

export interface DayLog {
  date: string;
  weight?: number;
  body?: BodyComp;
  meals: Meal[];
  workouts: Workout[];
  /** Water in litres. */
  water?: number;
  note?: string;
  cycle?: CycleDay;
  /** Daily lifestyle pillars ticked (keys from lib/habits.ts HABITS). */
  habits?: Record<string, boolean>;
  /** Numbers copied from Garmin Connect. */
  wellbeing?: Wellbeing;
  /** "J'ai craqué" moments, logged without judgement. */
  slips?: Slip[];
  /** Morning / evening check-ins with the coach. */
  checkin?: Checkin;
  /** Coach regulation tips ticked that have no pillar (tip id → done). */
  tips?: Record<string, boolean>;
  /** "Revenir à moi": check-in, engagements, journal answer. */
  journey?: JourneyDay;
  /** Sunday reset of the week ending this Sunday (step key → answer). */
  journeyReset?: Record<string, { chips?: string[]; text?: string }>;
}

export type SlipKind = 'sucre' | 'grignotage' | 'gros-repas' | 'alcool' | 'fastfood' | 'autre';
export type SlipTrigger = 'stress' | 'fatigue' | 'faim' | 'emotion' | 'social' | 'regles' | 'ennui' | 'autre';

export interface Slip {
  id: string;
  /** "HH:MM" local time. */
  time: string;
  kind: SlipKind;
  triggers: SlipTrigger[];
  /** Rough extra kcal if the user wants to note it (optional). */
  kcal?: number;
  note?: string;
}

export interface Checkin {
  /** Morning: how do you feel, 1 (bad) … 5 (great). */
  morningMood?: number;
  /** Evening: how did the day go. */
  evening?: 'bien' | 'moyen' | 'dur';
  eveningNote?: string;
}

export interface Wellbeing {
  sleepH?: number;
  /** Garmin Body Battery at wake-up, 0–100. */
  bodyBattery?: number;
  /** Garmin average stress, 0–100. */
  stress?: number;
  restingHr?: number;
  steps?: number;
  /** Breathing (cohérence cardiaque) sessions done today. */
  breathing?: number;
  /** Set when some numbers came from the automatic Garmin import (lib/garmin.ts). */
  source?: 'garmin';
  /** Values as last imported from Garmin (a field still equal to it is Garmin's to update). */
  garmin?: Partial<Record<GarminField, number>>;
  /** Fields typed by hand: the Garmin import never overwrites them. */
  manual?: GarminField[];
}

/** Wellbeing numbers the Garmin import can fill. */
export type GarminField = 'sleepH' | 'bodyBattery' | 'stress' | 'restingHr' | 'steps';

export type Intensity = 'facile' | 'modéré' | 'soutenu';

export interface PlannedSession {
  /** Stable id, e.g. "2026-10-05-swim". */
  id: string;
  date: string;
  sport: Sport;
  title: string;
  minutes: number;
  intensity: Intensity;
  /** What to do, in plain French, 1–3 short sentences. */
  details: string;
  /** The "no motivation" fallback: ~15 min version. */
  mini?: string;
  optional?: boolean;
  /** One short line tying the session to the day (cycle phase, basket…). */
  why?: string;
  /** The week's key session (placed in the follicular phase / fertile window). */
  key?: boolean;
  /** Why the plan changed something (e.g. swim replaced near the period). */
  note?: string;
}

export type PhaseId = 'lavage' | 'progressive' | 'vacances' | 'prepa' | 'course' | 'avant';

export interface PlanWeek {
  index: number;
  /** Monday of the week. */
  start: string;
  phase: PhaseId;
  /** One-line intention for the week. */
  focus: string;
  sessions: PlannedSession[];
}

export interface SeasonBlock {
  name: string;
  start: string;
  end: string;
  goal: string;
}

export interface AppState {
  profile: Profile;
  days: Record<string, DayLog>;
  favorites: FavoriteMeal[];
  /** Where data lives. Always 'local' (this device only); kept for future sync. */
  backend: 'cloud' | 'local';
  loaded: boolean;
}
