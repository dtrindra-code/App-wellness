// "Le mot du coach" on the Progrès tab: three short warm lines built from the period stats.
// 1. the biggest win, 2. one honest (never guilt) observation, 3. one focus.
// Pregnancy mode: no weight-loss talk at all.

import type { AppState } from '../types';
import type { PeriodStats } from '../lib/stats';
import { h, fmtKg, ICON, iconCircle } from '../lib/ui';
import { parseISO } from '../lib/dates';
import { cycleSettings } from '../lib/cycle';
import { sleepWeightInsight } from '../lib/habits';
import type { SlipTrigger } from '../types';

/** Local copy (lib/coach.ts is edited elsewhere): lowercase, for inline use. */
export const TRIGGER_WORD: Record<SlipTrigger, string> = {
  stress: 'le stress', fatigue: 'la fatigue', faim: 'la faim', emotion: 'les émotions',
  social: 'les soirées', regles: 'les règles', ennui: 'l’ennui', autre: 'autre chose',
};

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** "1er oct." / "12 oct." */
export function fmtSince(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const pl = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function coachLines(ps: PeriodStats, state: AppState): string[] {
  const { cur, prev, spans } = ps;
  const pregnant = cycleSettings(state.profile).pregnant;
  const when = spans.period === 'semaine' ? 'cette semaine' : spans.period === 'mois' ? 'ce mois-ci' : `depuis le ${fmtSince(spans.cur.from)}`;
  const vs = spans.period === 'semaine' ? 'la semaine dernière' : 'le mois dernier';
  const { weight: w, nutrition: n, sport: sp, balance: b } = cur;

  // 1. Biggest win.
  const wins: string[] = [];
  if (!pregnant && w.delta !== null && w.delta <= -0.3) wins.push(`−${fmtKg(Math.abs(w.delta))} kg ${when}, en moyenne sur 7 jours.`);
  if (sp.sessions >= 2) wins.push(`${pl(sp.sessions, 'séance', 'séances')}${sp.minis ? ` dont ${sp.minis} ${sp.minis > 1 ? 'minis' : 'mini'}` : ''} ${when}.`);
  if (n.daysLogged >= 3) wins.push(`Repas notés ${n.daysLogged} jours sur ${n.days}.`);
  if (b.pillarDays >= 3 && b.pillarsAvg !== null) wins.push(`${fmtKg(b.pillarsAvg)} piliers par jour en moyenne.`);
  if (sp.sessions === 1) wins.push(`Une séance ${when} : le mouvement est lancé.`);
  if (!wins.length) wins.push('Tu es là, et c’est déjà le plus important.');

  // 2. One honest, gentle observation.
  let obs: string | null = null;
  if (prev && prev.sport.sessions - sp.sessions >= 2) {
    obs = `Un peu moins de séances que ${vs} (${sp.sessions} contre ${prev.sport.sessions}) : ça arrive, la version mini compte aussi.`;
  } else if (b.shortNights >= 2) {
    obs = `${pl(b.shortNights, 'nuit', 'nuits')} sous 6 h ${when} : ton corps le sent, sois douce avec toi.`;
  } else if (n.slips >= 2 && n.topTriggers[0]) {
    obs = `Tes craquages arrivent surtout avec ${TRIGGER_WORD[n.topTriggers[0].trigger]} : c’est un signal, pas un échec.`;
  } else if (n.daysLogged >= 1) {
    obs = `Assiette dans le budget ${pl(n.daysWithinBudget, 'jour', 'jours')} sur ${n.daysLogged} ${n.daysLogged > 1 ? 'notés' : 'noté'} : ${n.daysWithinBudget * 2 >= n.daysLogged ? 'c’est solide' : 'on ajuste doucement, sans serrer'}.`;
  } else if (!pregnant && w.delta !== null && w.delta > 0.2) {
    obs = 'La moyenne remonte un peu : l’eau, le sel et le cycle jouent beaucoup, regarde la tendance sur plusieurs semaines.';
  } else if (wins.length > 1) {
    obs = wins[1];
  } else if (b.sleepAvg !== null) {
    obs = `Sommeil moyen ${fmtKg(b.sleepAvg).replace(/,0$/, '')} h ${when}.`;
  } else {
    obs = 'Chaque jour noté rend ce bilan plus juste.';
  }

  // 3. One focus.
  let focus: string;
  const sw = sleepWeightInsight(state.days, spans.cur.to);
  if (b.sleepAvg !== null && b.sleepAvg < 7 && sw && sw.goodSlope < sw.shortSlope && !pregnant) {
    focus = 'Ton focus : dormir 7 h, tes semaines bien dormies sont tes meilleures.';
  } else if (b.sleepAvg !== null && b.sleepAvg < 6.8) {
    focus = 'Ton focus : viser 7 h de sommeil, trois soirs pour commencer.';
  } else if (n.avgProtein !== null && n.proteinTarget !== null && n.avgProtein < n.proteinTarget * 0.85) {
    focus = 'Ton focus : des protéines à chaque repas, pour tenir la faim.';
  } else if (sp.planned >= 2 && sp.plannedDone < sp.planned / 2) {
    focus = 'Ton focus : caler tes séances dans ton agenda, la version mini suffit.';
  } else if (!pregnant && w.weighIns < 2) {
    focus = 'Ton focus : une pesée le matin, deux ou trois fois par semaine.';
  } else if (n.daysLogged < Math.min(3, n.days)) {
    focus = 'Ton focus : noter tes repas, même en vrac, trois jours par semaine.';
  } else {
    focus = 'Ton focus : garder ce rythme, il te va bien.';
  }

  // "1er oct." at the end of a sentence: one period only.
  return [wins[0], obs ?? '', focus].filter((x) => x !== '').map((x) => x.replace(/\.\.$/, '.'));
}

export function coachProgressCard(ps: PeriodStats, state: AppState): HTMLElement {
  const lines = coachLines(ps, state);
  return h('section', { class: 'card ux solo coach-card pg-coach' },
    h('div', { class: 'coach-head' },
      iconCircle(ICON.spark, 'coach-ic'),
      h('div', { class: 'coach-title' }, lines[0]),
    ),
    lines.slice(1).map((l, i) => h('p', { class: i === lines.length - 2 ? 'pg-focus' : 'coach-body' }, l)),
  );
}
