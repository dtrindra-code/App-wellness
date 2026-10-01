// "Revenir à moi": a 60-day journey (4 chapters of 15 days, 5 min a day at most).
// Each day: a 30 s check-in (energy + needs), 5 gentle engagements (some ticked
// automatically from the day's data, two synced both ways with the pillars), and one
// journal prompt adapted to the cycle phase. A day is "réussie" at 80 % of the
// engagements, or with a joker (2 per week). Missing a day never resets anything.
// Pure functions + a few store mutators. Content lives in src/data/journey.ts.
//
// Privacy: everything is stored in Profile.journey and DayLog.journey / journeyReset,
// so it stays on the device and travels only inside store.exportJSON() (manual export
// and the encrypted backup). Coach messages never quote what she wrote.

import type { AppState, DayLog, JourneyDay, JourneySettings, Profile } from '../types';
import { store } from '../store';
import { addDays, daysBetween, mondayOf, today, weekday } from './dates';
import { cycleOn, cycleSettings } from './cycle';
import { CHAPTERS, DEFAULT_RULES, NEEDS, PROMPTS, RULES, promptFor } from '../data/journey';
import type { NeedKey, PromptPhase } from '../data/journey';

export const JOURNEY_DAYS = 60;
export const CHAPTER_DAYS = 15;
export const JOKERS_PER_WEEK = 2;
export const SUCCESS_RATIO = 0.8;
/** Moving: total workout minutes or steps that tick the "move" rule automatically. */
export const MOVE_MINUTES = 20;
export const MOVE_STEPS = 7000;
export const WATER_L = 2;

type Days = Record<string, DayLog>;

// ---------- settings & calendar ----------

export function journeyOf(p: Profile): JourneySettings | null {
  const j = p.journey;
  if (!j || typeof j.startDate !== 'string') return null;
  return j;
}

export type JourneyStatus = 'none' | 'upcoming' | 'active' | 'done';

export function journeyStatus(date: string, p: Profile): JourneyStatus {
  const j = journeyOf(p);
  if (!j) return 'none';
  const n = daysBetween(j.startDate, date) + 1;
  if (n < 1) return 'upcoming';
  return n > JOURNEY_DAYS ? 'done' : 'active';
}

/** Day of the journey on `date` (1 … 60), null when not started yet or finished. */
export function journeyDay(date: string, p: Profile = store.profile): number | null {
  const j = journeyOf(p);
  if (!j) return null;
  const n = daysBetween(j.startDate, date) + 1;
  return n >= 1 && n <= JOURNEY_DAYS ? n : null;
}

export const chapterOf = (day: number) => Math.min(4, Math.max(1, Math.ceil(day / CHAPTER_DAYS)));
export const dayInChapter = (day: number) => ((day - 1) % CHAPTER_DAYS) + 1;
/** Date of journey day `n`. */
export const dateOfDay = (j: JourneySettings, n: number) => addDays(j.startDate, n - 1);

export function chapterInfo(index: number) {
  return CHAPTERS.find((c) => c.index === index) ?? CHAPTERS[index - 1] ?? CHAPTERS[0];
}

export function needLabel(key: string): string {
  return NEEDS.find((n) => n.key === key)?.label ?? key;
}

export function ruleDef(key: string) {
  return RULES.find((r) => r.key === key);
}

/** "besoin de calme" / "besoin d’aide" (elision before a vowel or a mute h). */
export function besoinDe(key: string): string {
  const l = needLabel(key).toLocaleLowerCase('fr-FR');
  return /^[aeiouyàâéèêëîïôûüh]/.test(l) ? `besoin d’${l}` : `besoin de ${l}`;
}

/** Rules that applied on `date` (rule changes keep the past days' score honest). */
export function rulesOn(date: string, p: Profile = store.profile): string[] {
  const j = journeyOf(p);
  const valid = (keys: string[]) => keys.filter((k) => !!ruleDef(k));
  if (!j) return valid([...DEFAULT_RULES]);
  const past = [...(j.history ?? [])].filter((x) => x.from <= date).sort((a, b) => a.from.localeCompare(b.from)).pop();
  return valid(past ? past.rules : j.rules);
}

// ---------- phase for the prompts ----------

/** Phase used to adapt the prompt: pregnancy first, then the logged cycle; null without cycle data. */
export function phaseForPrompt(date: string, p: Profile = store.profile, days: Days = store.state.days): PromptPhase | null {
  const cs = cycleSettings(p);
  if (cs.pregnant) return 'grossesse';
  if (!cs.tracking) return null;
  try {
    return cycleOn(date, p, days)?.phase ?? null;
  } catch {
    return null;
  }
}

/** The day's journal prompt (base text or the phase variant). Null outside the 60 days. */
export function promptOn(date: string, p: Profile = store.profile, days: Days = store.state.days) {
  const n = journeyDay(date, p);
  if (n === null) return null;
  try {
    return { day: n, ...promptFor(n, phaseForPrompt(date, p, days)) };
  } catch {
    const base = PROMPTS.find((x) => x.day === n);
    return base ? { day: n, title: base.title, question: base.question, chips: base.chips, tip: base.tip } : null;
  }
}

// ---------- engagements ----------

export function workoutMinutes(day: DayLog | undefined): number {
  return (day?.workouts ?? []).reduce((s, w) => s + (Number(w.minutes) || 0), 0);
}

/** Done automatically from the day's data (move / water / pillar). */
export function autoDone(key: string, day: DayLog | undefined): boolean {
  const auto = ruleDef(key)?.auto;
  if (!auto || !day) return false;
  if (auto === 'move') return workoutMinutes(day) >= MOVE_MINUTES || (day.wellbeing?.steps ?? 0) >= MOVE_STEPS;
  if (auto === 'water') return (day.water ?? 0) >= WATER_L;
  if (auto.startsWith('habit:')) return !!day.habits?.[auto.slice(6)];
  return false;
}

export const habitOfRule = (key: string): string | null => {
  const auto = ruleDef(key)?.auto;
  return auto && auto.startsWith('habit:') ? auto.slice(6) : null;
};

export function ruleDone(key: string, day: DayLog | undefined): boolean {
  if (habitOfRule(key)) return autoDone(key, day);
  return autoDone(key, day) || !!day?.journey?.rulesDone?.[key];
}

export interface DayScore {
  done: number;
  total: number;
  /** Engagements needed for a "réussie" day (80 %, rounded up). */
  need: number;
  joker: boolean;
  success: boolean;
}

export function dayScore(date: string, state: AppState = store.state): DayScore {
  const day = state.days[date];
  const rules = rulesOn(date, state.profile);
  const done = rules.filter((k) => ruleDone(k, day)).length;
  const total = rules.length;
  const need = Math.max(1, Math.ceil(total * SUCCESS_RATIO - 1e-9));
  const joker = !!day?.journey?.joker;
  return { done, total, need, joker, success: joker || (total > 0 && done >= need) };
}

function setJourney(date: string, fn: (j: JourneyDay, d: DayLog) => void) {
  void store.updateDay(date, (d) => {
    const j: JourneyDay = { ...(d.journey ?? {}) };
    fn(j, d);
    d.journey = j;
  });
}

/**
 * Tick / untick an engagement. Pillar rules tick the pillar itself (both ways synced).
 * Returns false when the rule is already done automatically (nothing to untick).
 */
export function toggleRule(date: string, key: string): boolean {
  const day = store.getDay(date);
  const hk = habitOfRule(key);
  if (hk) {
    void store.updateDay(date, (d) => {
      const hb = { ...(d.habits ?? {}) };
      if (hb[hk]) delete hb[hk]; else hb[hk] = true;
      d.habits = hb;
    });
    return true;
  }
  if (autoDone(key, day)) return false;
  setJourney(date, (j) => {
    const r = { ...(j.rulesDone ?? {}) };
    if (r[key]) delete r[key]; else r[key] = true;
    j.rulesDone = r;
  });
  return true;
}

// ---------- jokers ----------

export function jokersUsedInWeek(date: string, days: Days = store.state.days): number {
  const mon = mondayOf(date);
  let n = 0;
  for (let i = 0; i < 7; i++) if (days[addDays(mon, i)]?.journey?.joker) n++;
  return n;
}

export function jokersLeft(date: string, days: Days = store.state.days): number {
  return Math.max(0, JOKERS_PER_WEEK - jokersUsedInWeek(date, days));
}

/** Use (or give back) the joker of `date`. False when none is left this week. */
export function setJoker(date: string, on: boolean): boolean {
  const j = journeyOf(store.profile);
  if (!j) return false;
  const had = !!store.getDay(date).journey?.joker;
  if (on === had) return true;
  if (on && jokersLeft(date) <= 0) return false;
  const mon = mondayOf(date);
  void store.batch(async () => {
    setJourney(date, (jd) => { if (on) jd.joker = true; else delete jd.joker; });
    const used = { ...(j.jokersUsed ?? {}) };
    used[mon] = Math.max(0, (used[mon] ?? 0) + (on ? 1 : -1));
    void store.saveProfile({ journey: { ...j, jokersUsed: used } });
  });
  return true;
}

// ---------- check-in & journal ----------

/** Energy of the day: the journey check-in, else the morning mood (one check-in, not two). */
export function energyOf(day: DayLog | undefined): number | undefined {
  const e = day?.journey?.energy ?? day?.checkin?.morningMood;
  return typeof e === 'number' && e >= 1 && e <= 5 ? e : undefined;
}

export function setEnergy(date: string, energy: number | undefined) {
  void store.updateDay(date, (d) => {
    const j: JourneyDay = { ...(d.journey ?? {}) };
    if (energy === undefined) delete j.energy; else j.energy = energy;
    d.journey = j;
    // Merged with the coach's morning question: answering here answers it too.
    if (energy !== undefined && d.checkin?.morningMood === undefined) d.checkin = { ...(d.checkin ?? {}), morningMood: energy };
  });
}

export const MAX_NEEDS = 3;

export function toggleNeed(date: string, key: NeedKey): boolean {
  const cur = store.getDay(date).journey?.needs ?? [];
  if (!cur.includes(key) && cur.length >= MAX_NEEDS) return false;
  setJourney(date, (j) => {
    const list = j.needs ?? [];
    j.needs = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  });
  return true;
}

export function saveAnswer(date: string, answer: JourneyDay['answer'] | undefined) {
  setJourney(date, (j) => { if (answer) j.answer = answer; else delete j.answer; });
}

export const isAnswered = (day: DayLog | undefined) => !!day?.journey?.answer && !day.journey.answer.skipped;

// ---------- start / settings ----------

export function startJourney(startDate: string, rules: string[]) {
  void store.saveProfile({ journey: { startDate, rules: [...rules], jokersUsed: {}, history: [] } });
}

/** Change the engagements from `from` on (past days keep their own set). */
export function changeRules(rules: string[], from: string = today()) {
  const j = journeyOf(store.profile);
  if (!j) return;
  // Not started yet: just replace.
  if (from <= j.startDate) {
    void store.saveProfile({ journey: { ...j, rules: [...rules], history: [] } });
    return;
  }
  const byFrom = new Map((j.history ?? []).map((x) => [x.from, x]));
  if (!byFrom.size) byFrom.set(j.startDate, { from: j.startDate, rules: [...j.rules] });
  // A second change on the same day replaces the first.
  byFrom.set(from, { from, rules: [...rules] });
  const history = [...byFrom.values()].sort((a, b) => a.from.localeCompare(b.from));
  void store.saveProfile({ journey: { ...j, rules: [...rules], history } });
}

export function stopJourney() {
  void store.saveProfile({ journey: undefined });
}

// ---------- progress ----------

export interface JourneyStats {
  /** Current day (1 … 60), or 60 when finished, 0 before the start. */
  day: number;
  chapter: number;
  dayInChapter: number;
  /** Days réussies so far. */
  success: number;
  /** Days that count in the ratio: every past day, plus today once réussie. */
  elapsed: number;
  /** success / elapsed (0 … 1), null before any day counts. */
  ratio: number | null;
  /** Consecutive réussies (jokers included) ending today, or yesterday while today is open. */
  streak: number;
  answered: number;
  jokersLeft: number;
}

export function journeyStats(date: string = today(), state: AppState = store.state): JourneyStats | null {
  const j = journeyOf(state.profile);
  if (!j) return null;
  const raw = daysBetween(j.startDate, date) + 1;
  const day = Math.max(0, Math.min(JOURNEY_DAYS, raw));
  let success = 0, elapsed = 0, answered = 0;
  for (let n = 1; n <= day; n++) {
    const d = dateOfDay(j, n);
    const ok = dayScore(d, state).success;
    if (ok) success++;
    if (d < date || ok || raw > JOURNEY_DAYS) elapsed++;
    if (isAnswered(state.days[d])) answered++;
  }
  let streak = 0;
  if (day >= 1) {
    const last = raw > JOURNEY_DAYS ? dateOfDay(j, JOURNEY_DAYS) : date;
    let d = dayScore(last, state).success ? last : addDays(last, -1);
    while (d >= j.startDate && streak < JOURNEY_DAYS && dayScore(d, state).success) { streak++; d = addDays(d, -1); }
  }
  const cur = Math.max(1, day);
  return {
    day, chapter: chapterOf(cur), dayInChapter: dayInChapter(cur),
    success, elapsed, ratio: elapsed ? success / elapsed : null, streak, answered,
    jokersLeft: jokersLeft(date, state.days),
  };
}

// ---------- recaps & insights ----------

export interface NeedCount { key: string; label: string; count: number }

function countNeeds(dates: string[], days: Days): NeedCount[] {
  const m = new Map<string, number>();
  for (const d of dates) for (const k of days[d]?.journey?.needs ?? []) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, label: needLabel(key), count })).sort((a, b) => b.count - a.count);
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export interface JournalEntry {
  day: number;
  date: string;
  title: string;
  question: string;
  chips: string[];
  text?: string;
}

export function entriesOf(dates: string[], state: AppState = store.state): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const d of dates) {
    const a = state.days[d]?.journey?.answer;
    if (!a || a.skipped) continue;
    const pr = promptOn(d, state.profile, state.days);
    if (!pr) continue;
    out.push({ day: pr.day, date: d, title: pr.title, question: pr.question, chips: a.chips ?? [], text: a.text });
  }
  return out;
}

export interface ChapterRecap {
  chapter: number;
  dates: string[];
  entries: JournalEntry[];
  topNeeds: NeedCount[];
  /** Energy per day (null when not noted). */
  energy: (number | null)[];
  energyStart: number | null;
  energyEnd: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  success: number;
}

/** Recap of chapter `index` (1 … 4), days up to `upTo` only. */
export function chapterRecap(index: number, upTo: string = today(), state: AppState = store.state): ChapterRecap | null {
  const j = journeyOf(state.profile);
  if (!j) return null;
  const dates = Array.from({ length: CHAPTER_DAYS }, (_, i) => dateOfDay(j, (index - 1) * CHAPTER_DAYS + i + 1)).filter((d) => d <= upTo);
  const energy = dates.map((d) => energyOf(state.days[d]) ?? null);
  const half = Math.ceil(dates.length / 2);
  const first = energy.slice(0, half).filter((v): v is number => v !== null);
  const second = energy.slice(half).filter((v): v is number => v !== null);
  const energyStart = avg(first), energyEnd = avg(second);
  let trend: ChapterRecap['trend'] = null;
  if (energyStart !== null && energyEnd !== null && first.length >= 2 && second.length >= 2) {
    const diff = energyEnd - energyStart;
    trend = diff >= 0.4 ? 'up' : diff <= -0.4 ? 'down' : 'flat';
  }
  return {
    chapter: index, dates,
    entries: entriesOf(dates, state),
    topNeeds: countNeeds(dates, state.days).slice(0, 3),
    energy, energyStart, energyEnd, trend,
    success: dates.filter((d) => dayScore(d, state).success).length,
  };
}

export interface WeekInsight {
  /** Days of the journey in the 7 days ending on `date`. */
  days: number;
  topNeed: NeedCount | null;
  needs: NeedCount[];
  energyAvg: number | null;
  success: number;
}

/** Last 7 days (ending on `date`) for the coach and the Sunday reset. */
export function weekInsight(date: string = today(), state: AppState = store.state): WeekInsight | null {
  const j = journeyOf(state.profile);
  if (!j) return null;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(date, -i)).filter((d) => journeyDay(d, state.profile) !== null);
  if (!dates.length) return null;
  const needs = countNeeds(dates, state.days);
  const energies = dates.map((d) => energyOf(state.days[d])).filter((v): v is number => v !== undefined);
  return {
    days: dates.length,
    topNeed: needs[0] ?? null,
    needs,
    energyAvg: avg(energies),
    success: dates.filter((d) => dayScore(d, state).success).length,
  };
}

// ---------- Sunday reset ----------

/** Sunday the reset of `date` belongs to: Monday → the day before; else this week's Sunday. */
export function resetSunday(date: string): string {
  const wd = weekday(date);
  return wd === 0 ? addDays(date, -1) : addDays(mondayOf(date), 6);
}

export function resetDone(sunday: string, days: Days = store.state.days): boolean {
  const r = days[sunday]?.journeyReset;
  return !!r && Object.keys(r).length > 0;
}

/** Card on Today: Sunday from 17 h, Monday morning while the reset is not done. */
export function resetDue(date: string, hour: number, state: AppState = store.state): boolean {
  const st = journeyStatus(date, state.profile);
  if (st !== 'active' && !(st === 'done' && daysBetween(addDays(journeyOf(state.profile)!.startDate, JOURNEY_DAYS - 1), date) <= 1)) return false;
  const wd = weekday(date);
  if (wd === 6 && hour >= 17) return !resetDone(date, state.days);
  if (wd === 0 && hour < 12) return !resetDone(addDays(date, -1), state.days);
  return false;
}

export interface ResetWeek {
  monday: string;
  sunday: string;
  dates: string[];
  energy: (number | null)[];
  needs: NeedCount[];
  success: number;
  journeyDays: number;
  highlights: JournalEntry[];
}

/** Step 1 of the reset: the week Monday → `sunday`. */
export function resetWeek(sunday: string, state: AppState = store.state): ResetWeek {
  const monday = mondayOf(sunday);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const inJourney = dates.filter((d) => journeyDay(d, state.profile) !== null && d <= today());
  const entries = entriesOf(inJourney, state);
  // Highlights: the answers with the most to say first, then in order.
  const highlights = [...entries].sort((a, b) => (b.text?.length ?? 0) + b.chips.length * 10 - ((a.text?.length ?? 0) + a.chips.length * 10)).slice(0, 3)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    monday, sunday, dates,
    energy: dates.map((d) => energyOf(state.days[d]) ?? null),
    needs: countNeeds(dates, state.days),
    success: inJourney.filter((d) => dayScore(d, state).success).length,
    journeyDays: inJourney.length,
    highlights,
  };
}

export function saveResetStep(sunday: string, key: string, value: { chips?: string[]; text?: string }) {
  void store.updateDay(sunday, (d) => {
    const r = { ...(d.journeyReset ?? {}) };
    const clean: { chips?: string[]; text?: string } = {};
    if (value.chips?.length) clean.chips = [...value.chips];
    if (value.text?.trim()) clean.text = value.text.trim();
    if (clean.chips || clean.text) r[key] = clean; else delete r[key];
    // An empty object still marks the reset as opened and finished.
    d.journeyReset = r;
  });
}

/** Mark the reset as done even when every step was skipped. */
export function finishReset(sunday: string) {
  void store.updateDay(sunday, (d) => {
    const r = { ...(d.journeyReset ?? {}) };
    if (!Object.keys(r).length) r.done = {};
    d.journeyReset = r;
  });
}
