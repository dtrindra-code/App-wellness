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

import type { AppState, CheckpointKey, DayLog, JourneyCheckpoint, JourneyDay, JourneySettings, Profile } from '../types';
import { store } from '../store';
import { addDays, daysBetween, mondayOf, today, weekday } from './dates';
import { cycleOn, cycleSettings } from './cycle';
import { CHAPTERS, DEFAULT_RULES, EMOTIONS, LIFE_DOMAINS, MODULES, NEEDS, PROMPTS, RULES, checkpointFor, promptFor } from '../data/journey';
import type { EmotionKey, NeedKey, PromptPhase } from '../data/journey';

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
    return base ? { day: n, title: base.title, question: base.question, chips: base.chips, tip: base.tip, questions: [{ q: base.question, chips: base.chips }], themeLabel: '', module: undefined } : null;
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

type Answer = NonNullable<JourneyDay['answer']>;

/** Text of question `i` (old pages kept one `text`: it belongs to the first question). */
export function answerText(a: JourneyDay['answer'] | undefined, i: number): string {
  if (!a) return '';
  const v = a.answers?.[i];
  if (typeof v === 'string') return v;
  return i === 0 && !a.answers ? a.text ?? '' : '';
}

/** Answers per question, old format included. */
export function answerTexts(a: JourneyDay['answer'] | undefined, count: number): string[] {
  return Array.from({ length: count }, (_, i) => answerText(a, i));
}

function cleanAnswer(a: Answer): Answer | undefined {
  const answers = (a.answers ?? []).map((x) => x ?? '');
  while (answers.length && !answers[answers.length - 1].trim()) answers.pop();
  const chips = [...(a.chips ?? [])];
  const out: Answer = { chips };
  if (answers.length) { out.answers = answers; if (answers[0].trim()) out.text = answers[0].trim(); }
  if (a.skipped && !chips.length && !answers.length) out.skipped = true;
  return chips.length || answers.length || out.skipped ? out : undefined;
}

/** Save the text of question `i` of the day's page (empty text clears it). */
export function saveQuestion(date: string, i: number, text: string) {
  setJourney(date, (j) => {
    const prev = j.answer;
    const answers = prev ? answerTexts(prev, Math.max(i + 1, prev.answers?.length ?? 1)) : [];
    while (answers.length <= i) answers.push('');
    answers[i] = text.replace(/\s+$/, '');
    const next = cleanAnswer({ chips: prev && !prev.skipped ? prev.chips ?? [] : [], answers });
    if (next) j.answer = next; else delete j.answer;
  });
}

/** Toggle a quick chip of the first question. */
export function toggleAnswerChip(date: string, chip: string) {
  setJourney(date, (j) => {
    const prev = j.answer;
    const chips = new Set(prev && !prev.skipped ? prev.chips ?? [] : []);
    if (chips.has(chip)) chips.delete(chip); else chips.add(chip);
    const answers = prev ? answerTexts(prev, Math.max(1, prev.answers?.length ?? 1)) : [];
    const next = cleanAnswer({ chips: [...chips], answers });
    if (next) j.answer = next; else delete j.answer;
  });
}

/** "Passer": the page is skipped (what was written is kept only if there is some). */
export function skipPage(date: string) {
  setJourney(date, (j) => {
    const a = j.answer;
    if (a && ((a.chips?.length ?? 0) > 0 || answerTexts(a, 3).some((t) => t.trim()))) return;
    j.answer = { chips: [], skipped: true };
  });
}

export function unskipPage(date: string) {
  setJourney(date, (j) => { if (j.answer?.skipped) delete j.answer; });
}

export const isAnswered = (day: DayLog | undefined) => {
  const a = day?.journey?.answer;
  if (!a || a.skipped) return false;
  return (a.chips?.length ?? 0) > 0 || !!a.text?.trim() || (a.answers ?? []).some((t) => !!t?.trim());
};

// ---------- emotion wheel ----------

export function emotionFamily(key: string | undefined) {
  return EMOTIONS.find((e) => e.key === key);
}

/** Set / clear the morning emotion. Same family again without nuance clears it. */
export function setEmotion(date: string, family: EmotionKey | null, nuance?: string) {
  setJourney(date, (j) => {
    if (!family) { delete j.emotion; return; }
    j.emotion = nuance ? { family, nuance } : { family };
  });
}

export function emotionLabel(e: JourneyDay['emotion'] | undefined): string | null {
  const f = emotionFamily(e?.family);
  if (!f) return null;
  return e?.nuance ? `${f.label} · ${e.nuance.toLocaleLowerCase('fr-FR')}` : f.label;
}

// ---------- checkpoints (day 0 · 30 · 60) ----------

export const CHECKPOINT_DAYS = [0, 30, 60] as const;

export function checkpointData(key: CheckpointKey, p: Profile = store.profile): JourneyCheckpoint {
  return journeyOf(p)?.checkpoints?.[key] ?? {};
}

export const checkpointDone = (key: CheckpointKey, p: Profile = store.profile) => !!checkpointData(key, p).doneAt;

/** Merge `patch` into checkpoint `key` (answers are merged too; undefined removes a field). */
export function saveCheckpoint(key: CheckpointKey, patch: Partial<JourneyCheckpoint>) {
  const j = journeyOf(store.profile);
  if (!j) return;
  const cur: JourneyCheckpoint = { ...(j.checkpoints?.[key] ?? {}) };
  for (const [k, v] of Object.entries(patch) as [keyof JourneyCheckpoint, unknown][]) {
    if (k === 'answers' && v && typeof v === 'object') {
      const ans = { ...(cur.answers ?? {}) };
      for (const [ak, av] of Object.entries(v as Record<string, string | undefined>)) {
        if (av === undefined || !String(av).trim()) delete ans[ak]; else ans[ak] = String(av);
      }
      if (Object.keys(ans).length) cur.answers = ans; else delete cur.answers;
    } else if (v === undefined) {
      delete cur[k];
    } else {
      (cur as Record<string, unknown>)[k] = v;
    }
  }
  void store.saveProfile({ journey: { ...j, checkpoints: { ...(j.checkpoints ?? {}), [key]: cur } } });
}

/** Checkpoint shown instead of the day's page (day 30 and 60). */
export function checkpointOnDay(n: number | null) {
  return n === 30 || n === 60 ? checkpointFor(n) : undefined;
}

/** Life wheel values, clamped 0–10, only known domains. */
export function wheelValues(w: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of LIFE_DOMAINS) {
    const v = w?.[d.key];
    if (typeof v === 'number' && Number.isFinite(v)) out[d.key] = Math.max(0, Math.min(10, Math.round(v)));
  }
  return out;
}

/** The most recent filled wheel ("now") and the day-0 one. */
export function wheelsNowAndStart(p: Profile = store.profile): { start: Record<string, number> | null; now: Record<string, number> | null; nowKey: CheckpointKey | null } {
  const has = (k: CheckpointKey) => Object.keys(wheelValues(checkpointData(k, p).wheel)).length > 0;
  const start = has('0') ? wheelValues(checkpointData('0', p).wheel) : null;
  const nowKey = (['60', '30'] as CheckpointKey[]).find(has) ?? null;
  return { start, now: nowKey ? wheelValues(checkpointData(nowKey, p).wheel) : null, nowKey };
}

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
    if (isAnswered(state.days[d]) || ((n === 30 || n === 60) && checkpointDone(String(n) as CheckpointKey, state.profile))) answered++;
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
  /** All the answers joined (used to rank highlights). */
  text?: string;
  /** Question → answer, in order (only the answered ones). */
  qa?: { q: string; a: string }[];
}

export function entriesOf(dates: string[], state: AppState = store.state): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const d of dates) {
    const a = state.days[d]?.journey?.answer;
    if (!isAnswered(state.days[d]) || !a) continue;
    const pr = promptOn(d, state.profile, state.days);
    if (!pr) continue;
    const qs = pr.questions?.length ? pr.questions : [{ q: pr.question }];
    const texts = answerTexts(a, Math.max(qs.length, a.answers?.length ?? 0));
    const qa = texts.map((t, i) => ({ q: qs[i]?.q ?? '', a: t.trim() })).filter((x) => x.a);
    const joined = qa.map((x) => x.a).join('\n');
    out.push({ day: pr.day, date: d, title: pr.title, question: pr.question, chips: a.chips ?? [], ...(joined ? { text: joined } : {}), qa });
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

// ---------- garden map ("Ton parcours en un coup d'œil") ----------

export type MapStatus = 'bloom' | 'seed' | 'today' | 'future' | 'missed';

export interface MapDay {
  /** 0 (point de départ) … 60. */
  day: number;
  date: string;
  /** bloom: day réussie · seed: something done, not réussie · missed: past, nothing noted · today · future. */
  status: MapStatus;
  /** Every 7th day: a sprout (one week grown). */
  sprout: boolean;
  chapter: 1 | 2 | 3 | 4;
  checkpoint?: 0 | 30 | 60;
  module?: string;
}

/** The 61 stops of the garden path (day 0 + days 1 … 60) as seen on `date`. */
export function journeyMap(date: string = today(), state: AppState = store.state): MapDay[] {
  const j = journeyOf(state.profile);
  const out: MapDay[] = [];
  const start = j?.startDate ?? addDays(date, 1);
  const started = !!j && date >= start;
  out.push({
    day: 0, date: addDays(start, -1),
    status: j && checkpointDone('0', state.profile) ? 'bloom' : started ? 'missed' : 'future',
    sprout: false, chapter: 1, checkpoint: 0,
  });
  for (let n = 1; n <= JOURNEY_DAYS; n++) {
    const d = addDays(start, n - 1);
    const day = state.days[d];
    let status: MapStatus = 'future';
    if (j && d === date) status = 'today';
    else if (j && d < date) {
      const sc = dayScore(d, state);
      const cp = n === 30 || n === 60 ? checkpointDone(String(n) as CheckpointKey, state.profile) : false;
      if (sc.success || cp) status = 'bloom';
      else if (sc.done > 0 || isAnswered(day) || energyOf(day) !== undefined) status = 'seed';
      else status = 'missed';
    }
    const mod = MODULES.find((m) => m.days.includes(n));
    out.push({
      day: n, date: d, status, sprout: n % 7 === 0,
      chapter: chapterOf(n) as 1 | 2 | 3 | 4,
      ...(n === 30 || n === 60 ? { checkpoint: n as 30 | 60 } : {}),
      ...(mod ? { module: mod.key } : {}),
    });
  }
  return out;
}

// ---------- entry card state (Today) ----------

export type EntryKind =
  | 'invite' | 'upcoming' | 'page-soon' | 'page' | 'written' | 'skipped'
  | 'checkpoint' | 'checkpoint-done' | 'reset' | 'done';

export interface EntryState {
  kind: EntryKind;
  /** Journey day (1 … 60), null outside. */
  day: number | null;
  /** Day-0 baseline still to fill (shown as a chip, first 15 days). */
  baselineDue: boolean;
  /** The Sunday reset is due (Sunday evening / Monday morning). */
  resetDue: boolean;
  /** Last day of a chapter (15, 30, 45, 60). */
  chapterEnd: boolean;
  /** Days left before the start (upcoming). */
  daysToStart?: number;
}

/** What the "Revenir à moi" card on Today shows at `hour` (0–24). Null: nothing to show. */
export function entryState(date: string, hour: number, state: AppState = store.state): EntryState | null {
  const p = state.profile;
  const st = journeyStatus(date, p);
  const j = journeyOf(p);
  if (st === 'none' || !j) return { kind: 'invite', day: null, baselineDue: false, resetDue: false, chapterEnd: false };
  const baselineDue = !checkpointDone('0', p);
  const base = { baselineDue, resetDue: false, chapterEnd: false };
  if (st === 'upcoming') return { ...base, kind: 'upcoming', day: null, daysToStart: daysBetween(date, j.startDate) };
  const due = resetDue(date, hour, state);
  if (st === 'done') {
    // A week to look back, then the card leaves Today.
    if (daysBetween(addDays(j.startDate, JOURNEY_DAYS - 1), date) > 7) return null;
    return { ...base, baselineDue: false, kind: due ? 'reset' : 'done', day: null, resetDue: due };
  }
  const n = journeyDay(date, p)!;
  const out: EntryState = { ...base, baselineDue: baselineDue && n <= 15, kind: 'page', day: n, resetDue: due, chapterEnd: dayInChapter(n) === CHAPTER_DAYS };
  if (due) return { ...out, kind: 'reset' };
  if (n === 30 || n === 60) return { ...out, kind: checkpointDone(String(n) as CheckpointKey, p) ? 'checkpoint-done' : 'checkpoint' };
  const day = state.days[date];
  if (day?.journey?.answer?.skipped) return { ...out, kind: 'skipped' };
  if (isAnswered(day)) return { ...out, kind: 'written' };
  return { ...out, kind: hour < 18 ? 'page-soon' : 'page' };
}
