// App state + persistence.
//
// Data lives ONLY on this device (localStorage) — nothing is sent to any
// server. Backups are manual JSON exports (Plus → Données).
//
// Screens read `store.state` and call the mutators; every change notifies
// subscribers, which re-render the current screen.

import type { AppState, DayLog, FavoriteMeal, Profile } from './types';

const LS_KEY = 'cap-maldives:v1';

export const DEFAULT_PROFILE: Profile = {
  onboarded: false,
  sex: null,
  age: null,
  heightCm: 165,
  startWeight: 75,
  startDate: '2026-09-30',
  goalWeight: 65,
  finalGoalWeight: 60,
  goalDate: '2026-12-13',
  lavageEnd: '2026-10-20',
  vacationStart: '2026-12-14',
  vacationEnd: '2026-12-28',
  prepStart: '2027-01-04',
  raceDate: '2027-06-13',
  raceName: 'Half Ironman',
  activity: 1.3,
  basketDays: [],
  cycle: { tracking: true, avgLength: 28, periodLength: 5, lutealLength: 14, ttc: false, pregnant: false },
};

type Listener = () => void;

declare global {
  interface Window { claude?: { use(name: string): Promise<unknown> } }
}

export function emptyDay(date: string): DayLog {
  return { date, meals: [], workouts: [] };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const isISO = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k);

/** Repair days from storage or an import: keyed by ISO date, meals/workouts always arrays, numbers finite. */
function normalizeDays(raw: unknown): Record<string, DayLog> {
  const out: Record<string, DayLog> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isISO(k) || !v || typeof v !== 'object') continue;
    const d = v as Partial<DayLog>;
    const day: DayLog = { ...(d as DayLog), date: k, meals: [], workouts: [] };
    day.meals = (Array.isArray(d.meals) ? d.meals : [])
      .filter((m) => m && typeof m === 'object')
      .map((m) => ({ ...m, kcal: Number.isFinite(Number(m.kcal)) ? Number(m.kcal) : 0 }));
    day.workouts = (Array.isArray(d.workouts) ? d.workouts : [])
      .filter((w) => w && typeof w === 'object')
      .map((w) => ({ ...w, minutes: Number.isFinite(Number(w.minutes)) ? Number(w.minutes) : 0 }));
    if (day.weight !== undefined && !(typeof day.weight === 'number' && Number.isFinite(day.weight))) delete day.weight;
    out[k] = day;
  }
  return out;
}

const normalizeFavorites = (raw: unknown): FavoriteMeal[] =>
  (Array.isArray(raw) ? raw : []).filter((f) => f && typeof f === 'object' && typeof f.name === 'string')
    .map((f) => ({ ...f, kcal: Number.isFinite(Number(f.kcal)) ? Number(f.kcal) : 0 }));

class Store {
  state: AppState = {
    profile: { ...DEFAULT_PROFILE },
    days: {},
    favorites: [],
    backend: 'local',
    loaded: false,
  };

  private listeners = new Set<Listener>();
  readonly ready: Promise<void>;

  constructor() {
    this.loadLocal();
    this.state.loaded = true;
    this.ready = Promise.resolve();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.saveLocal();
    this.listeners.forEach((fn) => fn());
  }

  // ---------- reads ----------

  get profile(): Profile {
    return this.state.profile;
  }

  getDay(date: string): DayLog {
    return this.state.days[date] ?? emptyDay(date);
  }

  /** Days with a weight, sorted by date ascending. */
  weights(): { date: string; weight: number }[] {
    return Object.values(this.state.days)
      .filter((d) => typeof d.weight === 'number')
      .map((d) => ({ date: d.date, weight: d.weight as number }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Most recent logged weight on or before `date`, else the profile start weight. */
  weightOn(date: string): number {
    const ws = this.weights().filter((w) => w.date <= date);
    return ws.length ? ws[ws.length - 1].weight : this.state.profile.startWeight;
  }

  // ---------- writes ----------

  /** Mutate a day (created if missing) and persist it. */
  async updateDay(date: string, mutate: (d: DayLog) => void): Promise<void> {
    const next = clone(this.getDay(date));
    mutate(next);
    next.date = date;
    this.state.days[date] = next;
    this.emit();
  }

  async saveProfile(patch: Partial<Profile>): Promise<void> {
    this.state.profile = { ...this.state.profile, ...patch };
    this.emit();
  }

  async saveFavorites(items: FavoriteMeal[]): Promise<void> {
    this.state.favorites = clone(items);
    this.emit();
  }

  exportJSON(): string {
    const { profile, days, favorites } = this.state;
    return JSON.stringify({ app: 'cap-maldives', version: 1, exportedAt: new Date().toISOString(), profile, days, favorites }, null, 2);
  }

  async importJSON(text: string): Promise<void> {
    const data = JSON.parse(text);
    if (!data || data.app !== 'cap-maldives') throw new Error('Ce fichier ne vient pas de l’app.');
    this.state.profile = { ...DEFAULT_PROFILE, ...data.profile };
    this.state.days = normalizeDays(data.days);
    this.state.favorites = normalizeFavorites(data.favorites);
    this.emit();
  }

  // ---------- persistence ----------

  private loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.state.profile = { ...DEFAULT_PROFILE, ...data.profile };
      this.state.days = normalizeDays(data.days);
      this.state.favorites = normalizeFavorites(data.favorites);
    } catch {
      /* storage unavailable: start fresh */
    }
  }

  private saveLocal() {
    try {
      const { profile, days, favorites } = this.state;
      localStorage.setItem(LS_KEY, JSON.stringify({ profile, days, favorites }));
    } catch {
      /* ignore */
    }
  }

}

export const store = new Store();
