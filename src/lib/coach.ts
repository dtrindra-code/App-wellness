// Rules-based coach (no AI, no network): picks warm, contextual messages from the
// user's own data. Everything here is pure and offline, so the app can pre-compute
// the day's notifications (coachMessages) and the Today screen can show coachNow().
//
// Tone rules: warm, specific, "tu", never guilt, never "tu aurais dû", never any
// compensation advice (no skipped meal, no punishment session). In pregnancy mode,
// no weight-loss talk at all.
// Notification limits: title ≤ 40 chars, body ≤ 140 chars (enforced by clamp()).

import type { AppState, DayLog, PhaseId, PlannedSession, Profile, Slip, SlipKind, SlipTrigger } from '../types';
import { addDays, daysBetween, mondayOf, parseISO, today, weekday } from './dates';
import { phaseOn, targets, totals, movingAverage, slopePerDay } from './nutrition';
import { adviceFor, cycleOn, cycleSettings } from './cycle';
import type { CycleInfo } from './cycle';
import { recoveryFlag, habitScore, HABITS } from './habits';
import type { RecoveryFlag } from './habits';
import { adaptedSessionsOn, sessionsOn } from '../data/plan';

export type CoachSlot = 'matin' | 'midi' | 'aprem' | 'soir' | 'bilan';

export interface CoachMessage {
  title: string;
  body: string;
}

export const TITLE_MAX = 40;
export const BODY_MAX = 140;

// ---------- small helpers ----------

/** FNV-1a hash → stable pick per date + slot (changes every day, stable within a day). */
function hash(s: string): number {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x >>> 0;
}

function pick<T>(list: readonly T[], seed: string): T {
  return list[hash(seed) % list.length];
}

type Vars = Record<string, string | number>;
type Tpl = readonly [string, string];

function fill(t: string, v: Vars = {}): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => (v[k] !== undefined ? String(v[k]) : ''));
}

function cut(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const sp = slice.lastIndexOf(' ');
  return (sp > max * 0.6 ? slice.slice(0, sp) : slice).replace(/[\s,;:.—-]+$/, '') + '…';
}

function clamp(m: CoachMessage): CoachMessage {
  return { title: cut(m.title, TITLE_MAX), body: cut(m.body, BODY_MAX) };
}

function msg(tpls: readonly Tpl[], seed: string, v?: Vars): CoachMessage {
  const [title, body] = pick(tpls, seed);
  return clamp({ title: fill(title, v), body: fill(body, v) });
}

const fmt1 = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

function hhmmToHour(t: string): number {
  const [hh, mm] = t.split(':').map(Number);
  return (hh || 0) + (mm || 0) / 60;
}

function nowHour(): number {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

// ---------- context ----------

interface Ctx {
  date: string;
  p: Profile;
  days: Record<string, DayLog>;
  day: DayLog;
  yday: DayLog | undefined;
  phase: PhaseId;
  /** Day number in the plan (1 = start day), ≤ 0 before the start. */
  planDay: number;
  toStart: number;
  toMaldives: number;
  toRace: number;
  pregnant: boolean;
  ttc: boolean;
  cycle: CycleInfo | null;
  session: PlannedSession | null;
  sessionDone: boolean;
  basket: boolean;
  recovery: RecoveryFlag;
  sleepH?: number;
  stress?: number;
  slipsToday: Slip[];
  slipsYday: Slip[];
  eatenKcal: number;
  protein: number;
  proteinTarget: number;
  budget: number;
  water: number;
  waterTarget: number;
  meals: number;
  habits: number;
  /** Weight trend in kg/week (negative = down), null when unknown or pregnant. */
  trendWeek: number | null;
  /** Consecutive days with something logged, ending today (or yesterday). */
  streak: number;
  seed: string;
}

function isActive(d: DayLog | undefined): boolean {
  if (!d) return false;
  return d.meals.length > 0 || d.workouts.length > 0 || typeof d.weight === 'number' ||
    habitScore(d) > 0 || !!d.checkin?.morningMood || !!d.checkin?.evening || (d.water ?? 0) > 0;
}

function streakOn(date: string, days: Record<string, DayLog>): number {
  let d = isActive(days[date]) ? date : addDays(date, -1);
  let n = 0;
  while (isActive(days[d]) && n < 400) { n++; d = addDays(d, -1); }
  return n;
}

function mainSession(date: string, p: Profile, days: Record<string, DayLog>): PlannedSession | null {
  const list = adaptedSessionsOn(date, p, days).map((a) => a.session);
  return list.find((s) => !s.optional) ?? list[0] ?? null;
}

function context(date: string, state: AppState): Ctx {
  const p = state.profile;
  const days = state.days;
  const day = days[date] ?? { date, meals: [], workouts: [] };
  const yday = days[addDays(date, -1)];
  const cs = cycleSettings(p);
  const cycle = cs.tracking && !cs.pregnant ? cycleOn(date, p, days) : null;
  const weights = Object.values(days)
    .filter((d) => typeof d.weight === 'number' && d.date <= date)
    .map((d) => ({ date: d.date, weight: d.weight as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const weight = weights.length ? weights[weights.length - 1].weight : p.startWeight;
  const adjust = cycle ? adviceFor(cycle, p, date).kcalAdjust : 0;
  const t = targets(date, p, weight, day, adjust);
  const eaten = totals(day);
  const session = mainSession(date, p, days);
  const slope = cs.pregnant ? null : slopePerDay(weights, 14);
  return {
    date, p, days, day, yday,
    phase: phaseOn(date, p).id,
    planDay: daysBetween(p.startDate, date) + 1,
    toStart: daysBetween(date, p.startDate),
    toMaldives: daysBetween(date, p.vacationStart),
    toRace: daysBetween(date, p.raceDate),
    pregnant: cs.pregnant,
    ttc: cs.ttc,
    cycle,
    session,
    sessionDone: !!session && day.workouts.some((w) => w.plannedId === session.id),
    basket: p.basketDays.includes(weekday(date)),
    recovery: recoveryFlag(date, days),
    sleepH: day.wellbeing?.sleepH ?? yday?.wellbeing?.sleepH,
    stress: day.wellbeing?.stress,
    slipsToday: day.slips ?? [],
    slipsYday: yday?.slips ?? [],
    eatenKcal: eaten.kcal,
    protein: eaten.protein,
    proteinTarget: t.protein,
    budget: t.budget,
    water: day.water ?? 0,
    waterTarget: t.waterL,
    meals: day.meals.length,
    habits: habitScore(day),
    trendWeek: slope === null ? null : Math.round(slope * 70) / 10,
    streak: streakOn(date, days),
    seed: date,
  };
}

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// ---------- message library ----------

const BEFORE_START: Tpl[] = [
  ['J−{n} avant le départ', 'Rien à prouver avant le {start}. Si tu veux t’échauffer : une gourde toujours pleine, c’est tout.'],
  ['On se prépare, tranquille', 'Encore {n} jours avant le début. Profite, et note juste ce qui te fait envie pour ton frigo.'],
  ['Bientôt le départ', 'Dans {n} jours, on commence ensemble. Pas de régime avant l’heure : on prépare le terrain, c’est tout.'],
];

const EVE_OF_START: Tpl[] = [
  ['Demain, c’est le jour 1', 'Aujourd’hui, pas de régime : frigo, gourde, baskets prêtes. Demain on démarre ensemble, pas à pas.'],
  ['Dernier jour avant le départ', 'Pas besoin de « dernier festin » ni de restriction. Une journée normale, et demain je suis là dès le matin.'],
];

const DAY_ONE: Tpl[] = [
  ['Jour 1, on y est', 'Un seul objectif aujourd’hui : des protéines à chaque repas et ta gourde pas loin. Je suis avec toi.'],
  ['C’est parti, doucement', 'Premier jour : pas besoin d’être parfaite. Un repas après l’autre, beaucoup d’eau. Le reste suivra.'],
];

const AFTER_SLIP: Tpl[] = [
  ['Nouvelle journée', 'Hier, c’est hier. Ce matin : un petit-déj normal, ta gourde, et on avance. Tu n’as rien à rattraper.'],
  ['On repart, tranquille', 'Un craquage ne défait pas des semaines de travail. Aujourd’hui on mange normalement, pas moins.'],
  ['Page blanche', 'Pas de compensation : juste ton rythme habituel. Un repas équilibré après l’autre, c’est comme ça qu’on gagne.'],
  ['Je suis toujours là', 'Tu as été honnête hier, c’est une force. Aujourd’hui, un seul focus : des protéines au petit-déj.'],
];

const LATE_TTC: Tpl[] = [
  ['Tes règles se font attendre', '{n} jours de retard. Si tu veux être fixée, un test le matin est le plus fiable. Quoi qu’il dise, je suis là.'],
  ['Un petit retard', 'Règles attendues il y a {n} jours. Un test peut se faire dès maintenant. En attendant : douceur, pas d’alcool.'],
];

const LATE: Tpl[] = [
  ['Tes règles se font attendre', '{n} jours de retard. Stress et nuits courtes peuvent décaler un cycle. En cas de doute, un test te rassurera.'],
];

const LOW_RECOVERY: Tpl[] = [
  ['Journée douce', '{reason} : aujourd’hui, on vise la version mini, pas la perf. Se reposer fait partie du plan.'],
  ['On lève le pied', '{reason}. Ton corps a besoin de récup : marche, eau, un vrai repas. Ça compte autant qu’une séance.'],
  ['Mode récup', '{reason} : sois gentille avec toi aujourd’hui. La version mini, ou juste 20 min de marche.'],
];

const PERIOD: Tpl[] = [
  ['Prends soin de toi', 'Jour {d} des règles. Bouillotte, tisane, marche douce si ça te dit. Tu as le droit d’y aller mollo.'],
  ['Douceur au programme', 'Règles, jour {d}. Moins d’énergie, c’est normal. Du fer au menu (lentilles, sardines) et zéro pression.'],
  ['Écoute ton corps', 'Jour {d} des règles : la version mini compte vraiment. Et un carré de chocolat noir, c’est du magnésium.'],
];

const FERTILE_TTC: Tpl[] = [
  ['Fenêtre fertile', 'Juste pour info : tu es dans ta fenêtre fertile. Le plan reste doux, et toi aussi avec toi-même.'],
  ['Fenêtre fertile, tout en douceur', 'Période fertile estimée. Énergie souvent au top : profite-en pour bouger, sans te mettre dans le rouge.'],
];

const PREGNANT_MORNING: Tpl[] = [
  ['Bonjour toi', 'Aujourd’hui : manger à ta faim, boire, bouger doucement si ça te dit. Rien d’autre à prouver.'],
  ['Une journée à ton rythme', 'Un petit-déj complet, ta gourde, et une marche si l’énergie est là. Tu fais déjà beaucoup.'],
  ['Prends soin de vous deux', 'Écoute ta fatigue : la sieste est une activité légitime. Et un fruit dans ton sac pour plus tard.'],
];

const VACATION: Tpl[] = [
  ['Profite du lagon', 'Tu y es. Nage, marche, savoure. On garde juste un œil sur l’eau et des protéines au petit-déj.'],
  ['Bonjour les Maldives', 'Aujourd’hui, pas de compte à rebours : du soleil, de la mer, et de l’eau dans ta gourde.'],
  ['Mode vacances', 'Tu as travaillé pour ça. Profite, sans compter. Une nage le matin, c’est cadeau.'],
];

const SESSION_DAY: Tpl[] = [
  ['Au programme : {sport}', '{title}, {min} min. Si l’énergie manque, la version mini compte tout autant.'],
  ['Ta séance du jour', '{title} ({min} min). Cale-la dans ton agenda comme un rendez-vous avec toi.'],
  ['Aujourd’hui on bouge', '{title}, {min} min, {intensity}. Pas besoin d’être parfaite, juste d’y aller.'],
];

const BASKET_DAY: Tpl[] = [
  ['Basket ce soir', 'Un vrai repas à midi et un goûter vers 17 h : tu joueras mieux, et tu n’arriveras pas affamée au dîner.'],
];

const COUNTDOWN_CLOSE: Tpl[] = [
  ['J−{n} avant les Maldives', 'La dernière ligne droite, c’est la régularité, pas l’effort de dernière minute. Tu es prête.'],
  ['Plus que {n} jours', 'On ne change rien : eau, protéines, un peu de mouvement. Tu as déjà fait le plus dur.'],
];

const MORNING_FOCUS: Record<string, Tpl[]> = {
  lavage: [
    ['J−{toM} · Focus eau', 'Aujourd’hui, un seul focus : {water} L d’eau. Gourde pleine dès maintenant, et on la remplit à chaque pause.'],
    ['J−{toM} · Focus protéines', 'Des protéines à chaque repas : œufs, skyr, poulet, poisson ou tofu. C’est ce qui te tiendra jusqu’au soir.'],
    ['J−{toM} · Moins de sel', 'Focus du jour : moins de sel et de plats tout prêts. Le corps relâche l’eau, tu te sentiras plus légère.'],
    ['J−{toM} · Légumes d’abord', 'Un seul focus : la moitié de l’assiette en légumes, midi et soir. Simple, et ça change tout.'],
    ['J−{toM} · Boissons', 'Focus du jour : eau, thé, café sans sucre. Les boissons sucrées, on les met de côté pendant le lavage.'],
  ],
  progressive: [
    ['J−{toM} · Un focus', 'Aujourd’hui : des protéines au petit-déj. C’est le geste qui fait tenir toute la journée.'],
    ['J−{toM} · On avance', 'Régulière plutôt que parfaite. Un focus : ta gourde toujours à portée de main.'],
    ['J−{toM} · Bouge un peu', 'Focus du jour : 20 min de marche, n’importe quand. Ça compte vraiment dans la balance de la semaine.'],
    ['J−{toM} · Assiette complète', 'Un seul focus : protéines + légumes + un féculent raisonnable à chaque repas. Tu connais la chanson.'],
  ],
  prepa: [
    ['J−{toR} avant le half', 'Tu manges pour t’entraîner : un féculent autour des séances, des protéines à chaque repas.'],
    ['Focus récup', 'Dormir, boire, manger assez : c’est là que tu progresses. La séance, c’est le signal, la récup le résultat.'],
  ],
  course: [
    ['Jour J', 'Tu y es. Tout ce que tu as fait t’a amenée ici. Respire, souris, et avance un pas après l’autre.'],
  ],
  after: [
    ['Bonjour', 'Un repas équilibré, un peu de mouvement, beaucoup de douceur. Tu connais le chemin.'],
  ],
};

const LOW_MOOD: Tpl[] = [
  ['Merci de m’avoir dit', 'Journée au ralenti autorisée. Un repas après l’autre, et une petite marche si ça te fait du bien.'],
  ['On y va doucement', 'Pas la grande forme ? Alors on vise simple : de l’eau, un vrai déjeuner, et c’est déjà bien.'],
];

const MIDI_PREGNANT: Tpl[] = [
  ['Pause déj', 'Une assiette complète : protéines bien cuites, légumes, féculents. Mange à ta faim, sans rien sauter.'],
  ['À table', 'Un vrai déjeuner et un grand verre d’eau. Et un fruit pour l’après-midi, dans ton sac.'],
];

const MIDI_AFTER_SLIP: Tpl[] = [
  ['Déjeuner normal', 'Pas moins que d’habitude : protéines, légumes, un féculent. Sauter un repas, c’est la porte ouverte à 17 h.'],
  ['On mange, vraiment', 'Aujourd’hui on ne compense pas. Un déjeuner complet, et tu verras : l’après-midi sera plus facile.'],
];

const MIDI_PROTEIN: Tpl[] = [
  ['Protéines au déj', 'Encore ~{left} g de protéines à trouver aujourd’hui : poulet, poisson, œufs, tofu ou lentilles, et des légumes.'],
  ['La paume de protéines', 'Une portion de protéines grande comme ta paume, la moitié de l’assiette en légumes. Il te reste ~{left} g.'],
];

const MIDI_LAVAGE: Tpl[] = [
  ['Midi version lavage', 'La moitié de l’assiette en légumes, une paume de protéines, peu de sel. Un grand verre d’eau avant.'],
  ['Pause déj', 'Protéines + légumes, et une petite part de féculents. Et si tu en es à {water} L, un grand verre maintenant.'],
];

const MIDI_SESSION: Tpl[] = [
  ['Carburant pour ta séance', '{title} aujourd’hui : garde un féculent à midi, ton corps en aura besoin. Et des protéines, toujours.'],
];

const MIDI_GENERIC: Tpl[] = [
  ['Pause déj', 'Protéines + légumes d’abord, le reste ensuite. Mange assise, sans écran si tu peux. Tu le mérites.'],
  ['À table', 'Une assiette complète et un grand verre d’eau. Rien de compliqué, c’est la régularité qui paie.'],
  ['Petit rappel de midi', 'Des légumes, une protéine, un féculent. Et ta gourde : tu en es à {water} L sur {wt}.'],
];

const APREM_PRE: Tpl[] = [
  ['Le cap des 16 h', 'Avant les règles, l’envie de sucre est réelle. Prévois un vrai goûter : yaourt grec + fruit. Sans culpabilité.'],
  ['Envie de sucre ?', 'C’est hormonal, pas un manque de volonté. 2 carrés de chocolat noir + une poignée d’amandes, et ça passe.'],
];

const APREM_LUTEAL: Tpl[] = [
  ['Petit creux prévu', 'En phase lutéale, le corps dépense un peu plus. Un goûter protéiné maintenant évite la fringale de 18 h.'],
  ['Goûter autorisé (et conseillé)', 'Ton corps a besoin d’un peu plus ces jours-ci : +100 kcal sont prévues. Skyr, fruit, ou tartine + fromage.'],
];

const APREM_SLEEP: Tpl[] = [
  ['Nuit courte, faim sournoise', 'Après une petite nuit, les envies montent vers 16 h. Anticipe : fromage blanc, fruit, amandes. Et de l’eau.'],
  ['Coup de barre ?', 'C’est ta nuit qui parle, pas toi. Un goûter protéiné + un grand verre d’eau, et 5 min dehors si tu peux.'],
];

const APREM_STRESS: Tpl[] = [
  ['Pause respiration', 'Stress haut aujourd’hui : 5 min de cohérence cardiaque avant le goûter, ça calme aussi les envies.'],
];

const APREM_PERIOD: Tpl[] = [
  ['Envie de réconfort ?', 'Une tisane, un chocolat chaud, un carré de noir : le réconfort a sa place pendant les règles. Sans culpabilité.'],
];

const APREM_PATTERN: Tpl[] = [
  ['Ton heure sensible', 'C’est souvent en fin d’après-midi que ça coince pour toi. Un goûter prévu maintenant, c’est ton meilleur allié.'],
];

const APREM_PREGNANT: Tpl[] = [
  ['Petite pause', 'Un goûter, de l’eau, et les pieds en l’air 5 min si tu peux. Tu fais un travail énorme, même au repos.'],
];

const APREM_GENERIC: Tpl[] = [
  ['Le goûter, ton allié', 'Un vrai goûter vers 16 h évite l’attaque du placard à 18 h : yaourt grec + fruit, ou une poignée d’amandes.'],
  ['Petit creux ?', 'Avant de craquer pour le distributeur : un grand verre d’eau, puis un fruit + quelques noix. Ça tient bien.'],
  ['Pause de 16 h', 'Lève-toi, bois un verre d’eau, marche 5 min. Si la faim est là, un skyr ou un fruit. Pas d’interdit.'],
  ['Anticipe le creux', 'Prévois ton goûter maintenant plutôt que de le subir plus tard. Fromage blanc, fruit, œuf dur : au choix.'],
];

const SOIR_SLIP: Tpl[] = [
  ['Merci d’avoir été honnête', 'Tu l’as noté, c’est déjà prendre soin de toi. Ce soir : de l’eau, du calme, au lit un peu plus tôt.'],
  ['Ça arrive, vraiment', 'Une journée avec un craquage reste une journée où tu as essayé. Demain, un petit-déj normal et on repart.'],
];

const SOIR_WIN: Tpl[] = [
  ['Ta victoire du jour', '{win}. Et toi, comment s’est passée ta journée ? Dis-le-moi en un tap.'],
  ['Bravo pour aujourd’hui', '{win}. Viens me raconter ta journée, ça prend 2 secondes.'],
  ['Un point pour toi', '{win}. Bien, moyen, dur ? Dis-moi comment c’était.'],
];

const SOIR_NOWIN: Tpl[] = [
  ['Comment ça va ?', 'Chaque journée compte, même les moyennes. Viens me dire comment c’était, en un tap.'],
  ['Petit check du soir', 'Pas besoin d’une journée parfaite pour venir me voir. Bien, moyen ou dur : tout est ok.'],
];

const SOIR_DONE: Tpl[] = [
  ['Bonne nuit', 'Écrans off 30 min avant de dormir, si tu peux. Demain on continue, ensemble.'],
  ['À demain', 'La journée est faite. Un verre d’eau, un bon lit : c’est aussi ça, le plan.'],
];

const SOIR_EVE_START: Tpl[] = [
  ['Demain, on y va', 'Prépare ta gourde et ta tenue ce soir. Demain, jour 1. Je serai là dès le matin.'],
];

const SOIR_PREGNANT: Tpl[] = [
  ['Comment te sens-tu ?', 'La journée est finie. Dis-moi comment c’était, et repose-toi : c’est ton travail du soir.'],
];

// ---------- wins ----------

/** Concrete wins of the day, most meaningful first (short French phrases). */
export function dayWins(date: string, state: AppState): string[] {
  const c = context(date, state);
  const w: string[] = [];
  if (c.sessionDone && c.session) w.push(`${c.session.title} : faite`);
  else if (c.day.workouts.length) {
    const min = c.day.workouts.reduce((s, x) => s + (x.minutes || 0), 0);
    w.push(min ? `${min} min de sport au compteur` : 'Tu as bougé aujourd’hui');
  }
  if (c.water >= c.waterTarget) w.push(`${fmt1(c.water)} L d’eau, objectif atteint`);
  if (c.proteinTarget && c.protein >= c.proteinTarget * 0.85) w.push('Tes protéines sont au rendez-vous');
  if (c.habits >= 3) w.push(`${c.habits} piliers cochés`);
  if ((c.day.wellbeing?.breathing ?? 0) > 0) w.push('Tu as pris le temps de respirer');
  if (c.meals >= 3) w.push('Tous tes repas sont notés');
  if (c.slipsToday.length) w.push('Tu as noté un moment difficile sans te juger');
  if (c.streak >= 3) w.push(`${c.streak} jours d’affilée avec moi`);
  if (typeof c.day.weight === 'number' && !c.pregnant) w.push('Pesée faite');
  return w;
}

// ---------- slot builders ----------

function sportLabel(s: PlannedSession): string {
  const map: Record<string, string> = { swim: 'natation', bike: 'vélo', run: 'course', strength: 'renfo', basket: 'basket', walk: 'marche', mobility: 'mobilité', other: 'séance' };
  return map[s.sport] ?? 'séance';
}

function matin(c: Ctx, mood?: number): CoachMessage {
  const s = `${c.seed}|matin`;
  const toM = Math.max(0, c.toMaldives);
  if (c.phase === 'avant') {
    if (c.toStart === 1) return msg(EVE_OF_START, s);
    return msg(BEFORE_START, s, { n: c.toStart, start: startLabel(c.p.startDate) });
  }
  if (c.planDay === 1) return msg(DAY_ONE, s);
  if (mood !== undefined && mood <= 2) return msg(LOW_MOOD, s);
  if (c.cycle?.phase === 'retard' && c.cycle.lateBy >= 2) return msg(c.ttc ? LATE_TTC : LATE, s, { n: c.cycle.lateBy });
  if (c.slipsYday.length && !c.slipsToday.length) return msg(AFTER_SLIP, s);
  if (c.pregnant) return msg(PREGNANT_MORNING, s);
  if (c.recovery.low) return msg(LOW_RECOVERY, s, { reason: c.recovery.reason });
  if (c.cycle?.phase === 'regles') return msg(PERIOD, s, { d: c.cycle.day });
  if (c.phase === 'course' && c.toRace === 0) return msg(MORNING_FOCUS.course, s);
  if (c.phase === 'vacances') return msg(VACATION, s);
  if (c.cycle?.phase === 'fertile' && c.ttc && hash(s) % 2 === 0) return msg(FERTILE_TTC, s);
  if (c.toMaldives > 0 && c.toMaldives <= 7) return msg(COUNTDOWN_CLOSE, s, { n: c.toMaldives });
  if (c.session && !c.sessionDone) {
    return msg(SESSION_DAY, s, { sport: sportLabel(c.session), title: c.session.title, min: c.session.minutes, intensity: c.session.intensity });
  }
  if (c.basket) return msg(BASKET_DAY, s);
  const lib = MORNING_FOCUS[c.phase === 'lavage' ? 'lavage' : c.phase === 'progressive' ? 'progressive' : c.phase === 'prepa' ? 'prepa' : 'after'];
  return msg(lib, s, { toM, toR: Math.max(0, c.toRace), water: fmt1(c.waterTarget) });
}

function midi(c: Ctx): CoachMessage {
  const s = `${c.seed}|midi`;
  const v = { water: fmt1(c.water), wt: fmt1(c.waterTarget), left: Math.max(0, Math.round(c.proteinTarget - c.protein)), title: c.session?.title ?? '' };
  if (c.pregnant) return msg(MIDI_PREGNANT, s);
  if (c.slipsYday.length || c.slipsToday.length) return msg(MIDI_AFTER_SLIP, s);
  if (c.session && !c.sessionDone && c.session.minutes >= 45 && hash(s) % 2 === 0) return msg(MIDI_SESSION, s, v);
  if (c.phase === 'lavage') return msg(MIDI_LAVAGE, s, v);
  if (c.meals > 0 && c.protein < c.proteinTarget * 0.35) return msg(MIDI_PROTEIN, s, v);
  return msg(MIDI_GENERIC, s, v);
}

function aprem(c: Ctx, state: AppState): CoachMessage {
  const s = `${c.seed}|aprem`;
  if (c.pregnant) return msg(APREM_PREGNANT, s);
  const ph = c.cycle?.phase;
  if (ph === 'premenstruel') return msg(APREM_PRE, s);
  if (c.sleepH !== undefined && c.sleepH < 6.5) return msg(APREM_SLEEP, s);
  if (c.stress !== undefined && c.stress >= 50) return msg(APREM_STRESS, s);
  if (ph === 'luteale' || ph === 'retard') return msg(APREM_LUTEAL, s);
  if (ph === 'regles') return msg(APREM_PERIOD, s);
  const time = slipPatterns(state).find((x) => x.key === 'time:aprem');
  if (time) return msg(APREM_PATTERN, s);
  return msg(APREM_GENERIC, s);
}

function soir(c: Ctx, state: AppState): CoachMessage {
  const s = `${c.seed}|soir`;
  if (c.phase === 'avant' && c.toStart === 1) return msg(SOIR_EVE_START, s);
  if (c.day.checkin?.evening) return msg(SOIR_DONE, s);
  if (c.slipsToday.length) return msg(SOIR_SLIP, s);
  if (c.pregnant) return msg(SOIR_PREGNANT, s);
  const wins = dayWins(c.date, state);
  if (wins.length) return msg(SOIR_WIN, s, { win: pick(wins.slice(0, 3), s) });
  return msg(SOIR_NOWIN, s);
}

function bilan(date: string, state: AppState): CoachMessage {
  const r = weeklyReview(date, state);
  const s = `${date}|bilan`;
  const title = pick(['Ton bilan de la semaine', 'Ta semaine, en vrai', 'Bilan du dimanche'], s);
  const win = r.wins[0] ?? 'Tu es toujours là';
  return clamp({ title, body: `${win}. Pour la semaine prochaine, un seul focus : ${r.focus}.` });
}

function startLabel(iso: string): string {
  const d = parseISO(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

// ---------- public API ----------

/** Messages for each notification slot of `date`, computed from local data. */
export function coachMessages(date: string, state: AppState): Record<CoachSlot, CoachMessage> {
  const c = context(date, state);
  return {
    matin: matin(c),
    midi: midi(c),
    aprem: aprem(c, state),
    soir: soir(c, state),
    bilan: bilan(date, state),
  };
}

/** Which slot applies at `hour` on `date` (Sunday evening → bilan). */
export function slotAt(date: string, hour: number): CoachSlot {
  if (weekday(date) === 6 && hour >= 17) return 'bilan';
  if (hour < 11.5) return 'matin';
  if (hour < 15) return 'midi';
  if (hour < 18) return 'aprem';
  return 'soir';
}

/** The one message to show on the Today screen right now. */
export function coachNow(date: string, state: AppState): CoachMessage {
  const c = context(date, state);
  const hour = date === today() ? nowHour() : 8;
  const slot = slotAt(date, hour);
  const mood = c.day.checkin?.morningMood;
  // Just logged a slip: reassurance first, whatever the hour.
  const lastSlip = c.slipsToday[c.slipsToday.length - 1];
  if (lastSlip && hour - hhmmToHour(lastSlip.time) < 3 && hour >= hhmmToHour(lastSlip.time)) {
    return msg(SOIR_SLIP, `${date}|now-slip`);
  }
  if (c.day.checkin?.evening === 'dur') {
    return msg([
      ['Je suis là', 'Les journées dures font partie du chemin, elles ne l’effacent pas. Ce soir : calme, eau, au lit tôt.'],
      ['Doucement ce soir', 'Tu as tenu une journée difficile. C’est ça qu’on retient. Demain est une nouvelle page.'],
    ], `${date}|now-dur`);
  }
  if (slot !== 'soir' && slot !== 'bilan' && mood !== undefined && mood <= 2 && !c.pregnant) return msg(LOW_MOOD, `${date}|now-mood`);
  switch (slot) {
    case 'matin': return matin(c, mood);
    case 'midi': return midi(c);
    case 'aprem': return aprem(c, state);
    case 'bilan': return bilan(date, state);
    default: return soir(c, state);
  }
}

// ---------- check-in replies ----------

export const MOOD_LABELS = ['Pas top', 'Bof', 'Ça va', 'Bien', 'Au top'] as const;

/** Reply to the morning mood (1 … 5). */
export function morningReply(mood: number, date: string, state: AppState): CoachMessage {
  const c = context(date, state);
  const s = `${date}|mood${mood}`;
  if (mood <= 2) {
    return msg([
      ['Merci de me le dire', 'Alors aujourd’hui, on vise simple : de l’eau, des vrais repas, la version mini si tu bouges. C’est assez.'],
      ['Journée douce, alors', 'Pas la grande forme, ça arrive. Sois aussi gentille avec toi qu’avec une amie. Je reste là.'],
    ], s);
  }
  if (mood === 3) {
    return msg([
      ['Ok, on fait avec', 'Une journée « ça va », c’est une bonne base. Un seul focus : des protéines au petit-déj.'],
      ['Ça va, c’est bien', 'Pas besoin d’être au top pour avancer. Un pas aujourd’hui, et c’est gagné.'],
    ], s);
  }
  const sess = c.session && !c.sessionDone && !c.pregnant ? `Belle énergie pour ${lowerFirst(c.session.title)}.` : 'Profite de cette énergie, sans en faire trop.';
  return msg([
    ['Trop bien !', `${sess} Et n’oublie pas ta gourde.`],
    ['J’adore lire ça', `${sess} Garde un peu de cette forme pour ce soir.`],
  ], s);
}

export type EveningAnswer = 'bien' | 'moyen' | 'dur';

/** Reply to the evening check-in. */
export function eveningReply(ans: EveningAnswer, date: string, state: AppState): CoachMessage {
  const s = `${date}|eve-${ans}`;
  const wins = dayWins(date, state);
  const win = wins[0];
  if (ans === 'bien') {
    return msg([
      ['Trop bien', win ? `${win}. Garde ça en tête en t’endormant. À demain.` : 'Une bonne journée de plus dans ta collection. Savoure-la. À demain.'],
      ['Belle journée', win ? `${win} : c’est comme ça qu’on avance. Repose-toi bien.` : 'Tu vois, tu sais faire. Bonne nuit, et à demain.'],
    ], s);
  }
  if (ans === 'moyen') {
    return msg([
      ['Une journée normale', win ? `${win} : ça compte. Les journées moyennes font aussi le chemin. À demain.` : 'Les journées moyennes font aussi le chemin. Demain, un seul focus : ta gourde.'],
      ['C’est ok', 'Moyen, c’est déjà pas mal. Rien à rattraper : au lit un peu plus tôt, et on repart demain.'],
    ], s);
  }
  return msg([
    ['Merci de me le dire', 'Les journées dures font partie du chemin, elles ne l’effacent pas. Ce soir : de l’eau, du calme, au lit tôt.'],
    ['Je suis là', 'Tu as tenu une journée difficile, c’est ça qu’on retient. Sois douce avec toi. Demain est une nouvelle page.'],
  ], s);
}

// ---------- slips ----------

export const SLIP_KIND_LABEL: Record<SlipKind, string> = {
  sucre: 'Sucré',
  grignotage: 'Grignotage',
  'gros-repas': 'Gros repas',
  alcool: 'Alcool',
  fastfood: 'Fast-food',
  autre: 'Autre',
};

export const SLIP_TRIGGER_LABEL: Record<SlipTrigger, string> = {
  stress: 'Stress',
  fatigue: 'Fatigue',
  faim: 'Faim',
  emotion: 'Émotion',
  social: 'Soirée / social',
  regles: 'Règles',
  ennui: 'Ennui',
  autre: 'Autre',
};

export interface SlipPattern {
  /** e.g. "trigger:stress", "time:aprem", "cycle", "sleep". */
  key: string;
  title: string;
  text: string;
  count: number;
  total: number;
}

type TimeBucket = 'matin' | 'midi' | 'aprem' | 'soir' | 'nuit';
const bucketOf = (t: string): TimeBucket => {
  const hh = hhmmToHour(t);
  return hh < 11 ? 'matin' : hh < 14.5 ? 'midi' : hh < 18.5 ? 'aprem' : hh < 22 ? 'soir' : 'nuit';
};

const BUCKET: Record<TimeBucket, { when: string; tip: string }> = {
  matin: { when: 'le matin', tip: 'Un petit-déj plus protéiné (œufs, skyr) peut calmer ça dès le réveil.' },
  midi: { when: 'autour du déjeuner', tip: 'Un déjeuner un peu plus complet, avec protéines et féculent, aide souvent.' },
  aprem: { when: 'en fin d’après-midi', tip: 'Un vrai goûter prévu vers 16 h change souvent la donne.' },
  soir: { when: 'le soir', tip: 'Un dîner prêt à l’avance et une tisane après peuvent aider.' },
  nuit: { when: 'tard le soir', tip: 'Souvent la fatigue parle : se coucher un peu plus tôt est ta meilleure arme.' },
};

const TRIGGER_TEXT: Record<SlipTrigger, string> = {
  stress: 'Ce n’est pas un manque de volonté : c’est ton signal. Quelques respirations lentes avant d’ouvrir le placard peuvent aider.',
  fatigue: 'Les jours fatigués, prévois un goûter solide et un dîner simple déjà prêt. Ce n’est pas toi, c’est la fatigue.',
  faim: 'Un signe que tes repas sont un peu justes. Ajoute des protéines ou un féculent : on ne serre pas plus.',
  emotion: 'Manger pour se consoler est humain. Tu peux aussi essayer d’écrire deux lignes, ou d’appeler quelqu’un.',
  social: 'La vie sociale compte. Un plan simple : manger un peu avant, et un verre d’eau entre chaque verre.',
  regles: 'Ces jours-là, ton corps demande vraiment plus. Un peu plus de marge est normale.',
  ennui: 'Une petite marche ou une tisane peut couper l’envie en 10 min.',
  autre: 'Le noter t’aide déjà à mieux te connaître.',
};

interface DatedSlip extends Slip { date: string }

function allSlips(state: AppState): DatedSlip[] {
  return Object.values(state.days)
    .flatMap((d) => (d.slips ?? []).map((sl) => ({ ...sl, date: d.date })))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** Kind insights once ≥ 3 slips are logged (strongest first). Empty before that. */
export function slipPatterns(state: AppState): SlipPattern[] {
  const slips = allSlips(state);
  const total = slips.length;
  if (total < 3) return [];
  const out: SlipPattern[] = [];

  // Most common trigger.
  const trig = new Map<SlipTrigger, number>();
  for (const sl of slips) for (const t of sl.triggers ?? []) trig.set(t, (trig.get(t) ?? 0) + 1);
  const topTrig = [...trig.entries()].filter(([t]) => t !== 'autre').sort((a, b) => b[1] - a[1])[0];
  if (topTrig && topTrig[1] >= 2 && topTrig[1] / total >= 0.4) {
    const [t, n] = topTrig;
    out.push({
      key: `trigger:${t}`,
      title: `${SLIP_TRIGGER_LABEL[t]} : ${n} fois sur ${total}`,
      text: `Le déclencheur « ${SLIP_TRIGGER_LABEL[t].toLowerCase()} » revient souvent. ${TRIGGER_TEXT[t]}`,
      count: n, total,
    });
  }

  // Time of day.
  const buckets = new Map<TimeBucket, number>();
  for (const sl of slips) { const b = bucketOf(sl.time); buckets.set(b, (buckets.get(b) ?? 0) + 1); }
  const topB = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topB && topB[1] >= 2 && topB[1] / total >= 0.5) {
    const [b, n] = topB;
    out.push({
      key: `time:${b}`,
      title: `Souvent ${BUCKET[b].when}`,
      text: `${n} sur ${total} arrivent ${BUCKET[b].when}. ${BUCKET[b].tip}`,
      count: n, total,
    });
  }

  // Cycle phase share (second half of the cycle).
  const cs = cycleSettings(state.profile);
  if (cs.tracking && !cs.pregnant) {
    let known = 0;
    let late = 0;
    for (const sl of slips) {
      const info = cycleOn(sl.date, state.profile, state.days);
      if (!info) continue;
      known++;
      if (info.phase === 'luteale' || info.phase === 'premenstruel' || info.phase === 'retard') late++;
    }
    if (known >= 3 && late >= 2 && late / known >= 0.5) {
      out.push({
        key: 'cycle',
        title: 'Lié à ton cycle',
        text: `${late} sur ${known} tombent dans la 2e moitié du cycle. Ce n’est pas dans ta tête : l’appétit monte vraiment avant les règles. On prévoit plus large ces jours-là.`,
        count: late, total: known,
      });
    }
  }

  // After short nights.
  let withSleep = 0;
  let short = 0;
  for (const sl of slips) {
    const sh = state.days[sl.date]?.wellbeing?.sleepH;
    if (sh === undefined) continue;
    withSleep++;
    if (sh < 6.5) short++;
  }
  if (withSleep >= 2 && short >= 2 && short / withSleep >= 0.5) {
    out.push({
      key: 'sleep',
      title: 'Après les nuits courtes',
      text: `${short} sur ${withSleep} suivent une nuit de moins de 6 h 30. Après une petite nuit, la faim monte vraiment : dormir est ton meilleur anti-fringale.`,
      count: short, total: withSleep,
    });
  }

  return out.sort((a, b) => b.count / b.total - a.count / a.total);
}

export interface SlipResponse {
  title: string;
  body: string;
  /** Exactly 3 concrete, kind next steps. Never restriction or compensation. */
  steps: string[];
  insight?: SlipPattern;
}

const KIND_TEXT: Record<SlipKind, string[]> = {
  sucre: ['Une envie de sucre, c’est souvent le corps qui demande de l’énergie, pas un défaut de caractère.', 'Le sucre réconforte vite, c’est humain d’y aller.'],
  grignotage: ['Grignoter, c’est souvent une pause déguisée : ton corps ou ta tête avait besoin de quelque chose.', 'Le grignotage arrive à tout le monde, surtout quand la journée est longue.'],
  'gros-repas': ['Un gros repas, c’est un repas. Le suivant sera normal, et ça suffit.', 'Un repas copieux ne change rien à ta tendance sur plusieurs semaines.'],
  alcool: ['Un verre (ou plusieurs), ça fait partie de la vie. On hydrate, on dort, et on reprend.', 'Les soirées font partie de la vie. Rien de grave, on s’occupe juste de toi maintenant.'],
  fastfood: ['Le fast-food dépanne, c’est tout. Pas besoin d’en faire un drame.', 'Un repas rapide, c’est parfois la seule option. Ça ne dit rien de toi.'],
  autre: ['Quoi qu’il se soit passé, tu as eu le réflexe de le noter. C’est ça, la vraie progression.'],
};

const TRIGGER_EMPATHY: Partial<Record<SlipTrigger, string>> = {
  stress: 'Avec le stress, le corps cherche du réconfort rapide : c’est de la biologie.',
  fatigue: 'Fatiguée, on a vraiment plus faim. Ce n’est pas toi, c’est ta nuit.',
  faim: 'Si tu avais faim, c’est un signal utile : tes repas ont peut-être besoin d’un peu plus.',
  emotion: 'Les émotions ont le droit d’exister, et manger en est une réponse humaine.',
  social: 'Partager un bon moment, c’est aussi prendre soin de toi.',
  regles: 'Autour des règles, l’appétit monte vraiment. Sois douce avec toi.',
  ennui: 'L’ennui pousse souvent vers le placard. Tu viens de le remarquer, c’est déjà beaucoup.',
};

/** Compassionate reply + 3 next steps for a slip just logged on `date`. */
export function slipResponse(slip: Slip, date: string, state: AppState): SlipResponse {
  const s = `${date}|${slip.id}`;
  const title = pick(['Merci de me l’avoir dit', 'Ça arrive, vraiment', 'On respire', 'Tu as bien fait de le noter'], s);
  const parts: string[] = [pick(KIND_TEXT[slip.kind] ?? KIND_TEXT.autre, s)];
  const trig = (slip.triggers ?? []).find((t) => TRIGGER_EMPATHY[t]);
  if (trig) parts.push(TRIGGER_EMPATHY[trig]!);
  else {
    const cs = cycleSettings(state.profile);
    const info = cs.tracking && !cs.pregnant ? cycleOn(date, state.profile, state.days) : null;
    if (info && (info.phase === 'premenstruel' || info.phase === 'luteale')) {
      parts.push('Et tu es en 2e moitié de cycle : l’appétit monte vraiment ces jours-là.');
    }
  }
  parts.push('Un moment ne définit pas ta semaine.');

  const hour = hhmmToHour(slip.time);
  const late = hour >= 20;
  const t = slip.triggers ?? [];
  const steps: string[] = [];
  steps.push(slip.kind === 'alcool'
    ? 'Un grand verre d’eau maintenant, et un autre avant de dormir'
    : 'Bois un grand verre d’eau, tranquillement');
  steps.push(late || slip.kind === 'gros-repas'
    ? 'Demain, un petit-déj normal avec des protéines — on ne saute rien, on ne compense pas'
    : 'Ton prochain repas : normal, avec protéines et légumes — on ne compense pas');
  if (late || t.includes('fatigue') || slip.kind === 'alcool') steps.push('Au lit un peu plus tôt ce soir, écrans off si tu peux');
  else if (t.includes('stress') || t.includes('emotion')) steps.push('5 min de cohérence cardiaque (onglet Équilibre) pour relâcher la pression');
  else if (t.includes('regles')) steps.push('Une bouillotte, une tisane, et beaucoup de douceur avec toi');
  else steps.push('10 min de marche si tu peux, juste pour prendre l’air');

  const patterns = slipPatterns(state);
  return { title, body: parts.join(' '), steps, insight: patterns[0] };
}

// ---------- weekly review ----------

export interface WeeklyReview {
  /** Monday and Sunday of the reviewed week. */
  start: string;
  end: string;
  sessionsPlanned: number;
  sessionsDone: number;
  minutesMoved: number;
  daysWithMeals: number;
  proteinDays: number;
  waterDays: number;
  habitsTotal: number;
  weighIns: number;
  /** Change of the 7-day average over the week (kg), null if unknown or pregnant. */
  weightChange: number | null;
  slips: number;
  checkins: { bien: number; moyen: number; dur: number };
  sleepAvg: number | null;
  /** Wins first, short French phrases (never empty). */
  wins: string[];
  /** One short focus for next week (lowercase phrase). */
  focus: string;
  /** One kind sentence for the card header. */
  headline: string;
  /** Next week's phase label when it changes (e.g. "Perte progressive"). */
  nextPhase?: string;
}

/**
 * Review of a Monday → Sunday week. On Monday, the week that just ended;
 * any other day, the week containing `date` (days after `date` are ignored).
 */
export function weeklyReview(date: string, state: AppState): WeeklyReview {
  const p = state.profile;
  const days = state.days;
  const start = weekday(date) === 0 ? addDays(date, -7) : mondayOf(date);
  const end = addDays(start, 6);
  const last = end < date ? end : date;
  const pregnant = cycleSettings(p).pregnant;

  let sessionsPlanned = 0, sessionsDone = 0, minutesMoved = 0, daysWithMeals = 0, proteinDays = 0, waterDays = 0, habitsTotal = 0, weighIns = 0, slips = 0;
  const checkins = { bien: 0, moyen: 0, dur: 0 };
  const sleeps: number[] = [];
  for (let d = start; d <= last; d = addDays(d, 1)) {
    const day = days[d];
    const planned = sessionsOn(d, p, days).filter((x) => !x.optional);
    sessionsPlanned += planned.length;
    if (!day) continue;
    sessionsDone += planned.filter((x) => day.workouts.some((w) => w.plannedId === x.id)).length;
    minutesMoved += day.workouts.reduce((s, w) => s + (w.minutes || 0), 0);
    if (day.meals.length) daysWithMeals++;
    const t = targets(d, p, typeof day.weight === 'number' ? day.weight : p.startWeight, day);
    if (day.meals.length && totals(day).protein >= t.protein * 0.85) proteinDays++;
    if ((day.water ?? 0) >= t.waterL) waterDays++;
    habitsTotal += habitScore(day);
    if (typeof day.weight === 'number') weighIns++;
    slips += day.slips?.length ?? 0;
    const ev = day.checkin?.evening;
    if (ev) checkins[ev]++;
    if (typeof day.wellbeing?.sleepH === 'number') sleeps.push(day.wellbeing.sleepH);
  }
  const sleepAvg = sleeps.length >= 3 ? Math.round((sleeps.reduce((a, b) => a + b, 0) / sleeps.length) * 10) / 10 : null;

  let weightChange: number | null = null;
  if (!pregnant) {
    const pts = Object.values(days)
      .filter((d) => typeof d.weight === 'number' && d.date <= last)
      .map((d) => ({ date: d.date, weight: d.weight as number }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const ma = movingAverage(pts);
    const before = ma.filter((x) => x.date < start).pop();
    const after = ma.filter((x) => x.date >= start).pop();
    if (before && after && weighIns >= 2) weightChange = Math.round((after.avg - before.avg) * 10) / 10;
  }

  const wins: string[] = [];
  if (sessionsDone) wins.push(`${sessionsDone} ${plural(sessionsDone, 'séance faite', 'séances faites')}`);
  else if (minutesMoved >= 30) wins.push(`${minutesMoved} min de sport au compteur`);
  if (waterDays >= 4) wins.push(`Hydratée ${waterDays} jours sur 7`);
  if (proteinDays >= 3) wins.push(`Protéines au top ${proteinDays} jours`);
  if (daysWithMeals >= 4) wins.push(`Repas notés ${daysWithMeals} jours`);
  if (habitsTotal >= 10) wins.push(`${habitsTotal} piliers cochés`);
  if (weightChange !== null && weightChange <= -0.2) wins.push(`Tendance : −${fmt1(Math.abs(weightChange))} kg sur la semaine`);
  const nCheck = checkins.bien + checkins.moyen + checkins.dur;
  if (nCheck >= 3) wins.push(`Tu es venue me voir ${nCheck} soirs`);
  if (slips) wins.push('Tu as noté tes moments difficiles sans te juger');
  if (!wins.length) wins.push('Tu es toujours là, et c’est ce qui compte');

  const patterns = slipPatterns(state);
  let focus: string;
  if (sleepAvg !== null && sleepAvg < 6.5) focus = 'au lit 30 min plus tôt, 3 soirs';
  else if (slips >= 2 && patterns.some((x) => x.key === 'time:aprem')) focus = 'un vrai goûter prévu vers 16 h';
  else if (waterDays < 4) focus = 'ta gourde toujours à portée de main';
  else if (daysWithMeals >= 3 && proteinDays < 3) focus = 'des protéines à chaque repas';
  else if (sessionsPlanned > 0 && sessionsDone < sessionsPlanned / 2) focus = 'caler tes séances dans ton agenda dès lundi';
  else if (habitsTotal < 7) focus = 'un pilier par jour, pas plus';
  else focus = 'garder ce rythme, il te va bien';

  const nextMon = addDays(end, 1);
  const curPhase = phaseOn(end, p);
  const nextPh = phaseOn(nextMon, p);
  const nextPhase = nextPh.id !== curPhase.id ? nextPh.label : undefined;

  const hard = checkins.dur + slips;
  const headline = hard >= 3
    ? 'Une semaine pas simple, et tu es toujours là. C’est exactement ça, avancer.'
    : wins.length >= 3
      ? 'Belle semaine. Regarde tout ce que tu as fait.'
      : 'Chaque semaine compte, même les plus calmes.';

  return {
    start, end, sessionsPlanned, sessionsDone, minutesMoved, daysWithMeals, proteinDays, waterDays,
    habitsTotal, weighIns, weightChange, slips, checkins, sleepAvg, wins, focus, headline, nextPhase,
  };
}

/** Number of lifestyle pillars (for UI copy). */
export const PILLARS = HABITS.length;
