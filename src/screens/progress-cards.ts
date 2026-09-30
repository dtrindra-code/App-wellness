// Progrès tab: TON ASSIETTE · TON SPORT · TON ÉQUILIBRE · TON CYCLE.
// Each card: one key bubble, 2–3 info rows, comparison chips vs the previous period
// (week / month only), details folded in a disclosure. Friendly empty states.

import type { AppState } from '../types';
import type { PeriodStats, Period, NutritionDay } from '../lib/stats';
import { diff, weeklySessions } from '../lib/stats';
import { h, fmtInt, fmtDelta, infoRow, disclosure, keyBubble, ICON, SPORT_LABEL, SPORT_GLYPH } from '../lib/ui';
import { addDays, dayShort, fmtDayMonth, fmtShort, parseISO } from '../lib/dates';
import { cycleOn, cycleSettings, phaseLabel } from '../lib/cycle';
import { barChart } from './progress-charts';
import { TRIGGER_WORD } from './progress-coach';

const pl = (n: number, one: string, many: string) => `${fmtInt(n)} ${Math.abs(n) > 1 ? many : one}`;
const dec = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

const vsLabel = (p: Period) => (p === 'semaine' ? 'vs sem. dernière' : 'vs mois dernier');

/**
 * "+2 séances vs sem. dernière". Good tone only when it is better; otherwise a plain chip
 * (never red: a quieter week is not a failure). `unit(n)` gets the absolute value.
 */
function cmpChip(delta: number | null, unit: (abs: number) => string, better: 'up' | 'down', period: Period, eps = 0.05): HTMLElement | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  if (Math.abs(delta) < eps) return h('span', { class: 'chip' }, `comme ${period === 'semaine' ? 'la sem. dernière' : 'le mois dernier'}`);
  const good = better === 'up' ? delta > 0 : delta < 0;
  return h('span', { class: 'chip num' + (good ? ' good' : '') }, `${delta > 0 ? '+' : '−'}${unit(Math.abs(delta))} ${vsLabel(period)}`);
}

function chips(list: (HTMLElement | null)[]): HTMLElement | null {
  const kept = list.filter((x): x is HTMLElement => !!x);
  return kept.length ? h('div', { class: 'pg-chips' }, kept) : null;
}

function head(bubble: HTMLElement, title: string, line?: string | null, chip?: HTMLElement | null): HTMLElement {
  return h('div', { class: 'td-energy pg-head' },
    bubble,
    h('div', { class: 'td-energy-side pg-side' },
      h('p', { class: 'pg-lead' }, title),
      line ? h('p', { class: 'small muted' }, line) : null,
      chip ? h('div', null, chip) : null,
    ));
}

function emptyCard(icon: string, title: string, detail: string): HTMLElement {
  return h('section', { class: 'card ux solo pg-card' }, infoRow({ icon, title, detail, cls: 'pg-empty' }));
}

function dayTicks(perDay: { date: string }[], period: Period): string[] {
  if (period === 'semaine') return perDay.map((d) => dayShort(d.date).charAt(0).toUpperCase());
  return perDay.map((d, i) => {
    const n = parseISO(d.date).getDate();
    return i === 0 || n % 7 === 1 ? String(n) : '';
  });
}

/** Up to the last 31 days, so "depuis le début" stays readable. */
const lastDays = <T,>(xs: T[]) => xs.slice(-31);

// ---------- TON ASSIETTE ----------

export function plateCard(ps: PeriodStats): HTMLElement {
  const { cur, prev, spans } = ps;
  const n = cur.nutrition;
  const period = spans.period;
  if (!n.daysLogged) {
    return emptyCard(ICON.fork, 'Pas encore de repas notés',
      n.slips
        ? `${pl(n.slips, 'moment difficile noté', 'moments difficiles notés')}, sans jugement. Note tes repas : tes moyennes apparaîtront ici.`
        : 'Note tes repas : ici apparaîtront tes calories moyennes, tes protéines et tes jours dans le budget.');
  }
  const inBudget = n.avgKcal !== null && n.avgBudget !== null && n.avgKcal <= n.avgBudget;
  const card = h('section', { class: 'card ux solo pg-card' },
    head(
      keyBubble(fmtInt(n.avgKcal ?? 0), 'kcal', 'par jour'),
      n.avgBudget !== null ? `Budget moyen ${fmtInt(n.avgBudget)} kcal` : 'Ta moyenne',
      `sur ${pl(n.daysLogged, 'jour noté', 'jours notés')}`,
      h('span', { class: 'chip' + (inBudget ? ' good' : '') }, inBudget ? 'dans le budget' : 'un peu au-dessus, ça arrive'),
    ),
    prev && prev.nutrition.daysLogged ? chips([
      cmpChip(diff(n.daysLogged, prev.nutrition.daysLogged), (a) => pl(a, 'jour noté', 'jours notés'), 'up', period),
      cmpChip(diff(n.avgProtein, prev.nutrition.avgProtein), (a) => `${fmtInt(a)} g de protéines`, 'up', period, 1),
    ]) : null,
    n.avgProtein !== null && n.proteinTarget !== null
      ? infoRow({ icon: ICON.leaf, title: h('span', { class: 'num' }, `Protéines : ${fmtInt(n.avgProtein)} g par jour`), detail: `Objectif ${fmtInt(n.proteinTarget)} g · au top ${pl(n.proteinDays, 'jour', 'jours')}` })
      : infoRow({ icon: ICON.leaf, title: 'Protéines', detail: 'Elles s’afficheront avec les repas qui les indiquent (recherche d’aliments, HelloFresh).' }),
    infoRow({ icon: ICON.flag, title: h('span', { class: 'num' }, `Dans le budget : ${pl(n.daysWithinBudget, 'jour', 'jours')} sur ${n.daysLogged}`), detail: 'Budget = objectif du jour + bonus sport, cycle compris.' }),
    infoRow({
      icon: ICON.heart,
      title: n.slips ? pl(n.slips, 'moment difficile noté', 'moments difficiles notés') : 'Aucun moment difficile noté',
      detail: n.slips
        ? n.topTriggers.length ? `Surtout avec ${n.topTriggers.map((t) => TRIGGER_WORD[t.trigger]).join(' et ')}. Les noter, c’est déjà avancer.` : 'Les noter, c’est déjà avancer.'
        : 'Si ça arrive, « J’ai craqué » t’aide sans te juger.',
    }),
    disclosure('Voir jour par jour', () => kcalChart(lastDays(n.perDay), period), `pg-plate-${period}`),
  );
  return card;
}

/** Week view: pad to Sunday with empty slots, so the bars keep their weekly place. */
function padWeek<T extends { date: string }>(xs: T[], period: Period, blank: (date: string) => T): T[] {
  if (period !== 'semaine' || !xs.length) return xs;
  const out = [...xs];
  while (out.length < 7) out.push(blank(addDays(out[out.length - 1].date, 1)));
  return out;
}

function kcalChart(raw: NutritionDay[], period: Period): HTMLElement {
  const days = padWeek<NutritionDay & { future?: boolean }>(raw, period, (date) => ({ date, kcal: null, budget: 0, future: true }));
  const ticks = dayTicks(days, period);
  return barChart(days.map((d, i) => ({
    tick: ticks[i],
    value: d.kcal,
    mark: d.future ? null : d.budget,
    readout: d.future ? `${fmtShort(d.date)} · à venir` : `${fmtShort(d.date)} · ${d.kcal === null ? 'pas de repas noté' : `${fmtInt(d.kcal)} kcal`} · budget ${fmtInt(d.budget)}`,
  })), {
    ariaLabel: 'Calories mangées par jour, comparées au budget du jour',
    hint: 'Touche une barre pour lire le jour.',
    fmtAxis: (v) => (v >= 1000 ? `${dec(v / 1000)}k` : String(v)),
    legend: [{ kind: 'bar', label: 'mangé' }, { kind: 'tick', label: 'budget du jour' }],
  });
}

// ---------- TON SPORT ----------

export function sportCard(ps: PeriodStats, state: AppState): HTMLElement {
  const { cur, prev, spans } = ps;
  const sp = cur.sport;
  const period = spans.period;
  if (!sp.sessions) {
    return h('section', { class: 'card ux solo pg-card' },
      infoRow({
        icon: ICON.wave, cls: 'pg-empty',
        title: 'Pas encore de séance ici',
        detail: sp.planned
          ? `${pl(sp.planned, 'séance prévue', 'séances prévues')} sur la période. Même la version mini compte : elle apparaîtra ici.`
          : 'Ta première séance, même mini, apparaîtra ici avec tes minutes et tes sports.',
      }),
      disclosure('Voir tes 8 dernières semaines', () => weeksChart(state, spans.cur.to), 'pg-weeks-empty'),
    );
  }
  const topSports = sp.perSport.slice(0, 3).map((x) => `${SPORT_LABEL[x.sport] ?? x.sport} ${fmtInt(x.minutes)} min`).join(' · ');
  const run = sp.run;
  return h('section', { class: 'card ux solo pg-card' },
    head(
      keyBubble(String(sp.sessions), sp.sessions > 1 ? 'séances' : 'séance', sp.minis ? `dont ${sp.minis} ${sp.minis > 1 ? 'minis' : 'mini'}` : undefined),
      sp.planned ? `${sp.plannedDone} sur ${sp.planned} prévues` : `${pl(sp.activeDays, 'jour actif', 'jours actifs')}`,
      `${fmtInt(sp.minutes)} min au total`,
      sp.planned && sp.plannedDone >= sp.planned ? h('span', { class: 'chip good' }, 'plan tenu') : null,
    ),
    prev && prev.sport.sessions ? chips([
      cmpChip(diff(sp.sessions, prev.sport.sessions), (a) => pl(a, 'séance', 'séances'), 'up', period, 0.5),
      cmpChip(diff(sp.minutes, prev.sport.minutes), (a) => `${fmtInt(a)} min`, 'up', period, 1),
    ]) : null,
    infoRow({ icon: ICON.spark, title: 'Tes sports', detail: topSports }),
    sp.basket ? infoRow({ icon: SPORT_GLYPH.basket, title: `Basket : ${pl(sp.basket, 'fois', 'fois')}`, detail: 'Le plaisir compte, et il fait bouger.' }) : null,
    run ? infoRow({
      icon: SPORT_GLYPH.run,
      title: run.longestKm !== null ? `Plus longue sortie : ${dec(run.longestKm)} km` : `Plus longue sortie : ${fmtInt(run.longestMin ?? 0)} min`,
      detail: [pl(run.count, 'sortie', 'sorties'), run.km !== null ? `${dec(run.km)} km` : null, `${fmtInt(run.minutes)} min`].filter(Boolean).join(' · '),
    }) : null,
    disclosure('Voir tes 8 dernières semaines', () => [
      weeksChart(state, spans.cur.to),
      h('div', { class: 'list' }, sp.perSport.map((x) => h('div', { class: 'list-row' },
        h('span', { class: 'glyph' }, SPORT_GLYPH[x.sport] ?? '··'),
        h('div', { class: 'main' }, h('div', { class: 'title' }, SPORT_LABEL[x.sport] ?? x.sport), h('div', { class: 'sub num' }, `${pl(x.count, 'séance', 'séances')} · ${fmtInt(x.minutes)} min`)),
      ))),
    ], 'pg-weeks'),
  );
}

function weeksChart(state: AppState, date: string): HTMLElement {
  const weeks = weeklySessions(state, date, 8);
  return barChart(weeks.map((w, i) => ({
    tick: i === 0 || i === weeks.length - 1 || i === 4 ? fmtDayMonth(w.monday) : '',
    value: w.count,
    readout: `Semaine du ${fmtDayMonth(w.monday)} · ${pl(w.count, 'séance', 'séances')} · ${fmtInt(w.minutes)} min`,
  })), {
    ariaLabel: 'Séances par semaine, 8 dernières semaines',
    hint: `Cette semaine : ${pl(weeks[weeks.length - 1].count, 'séance', 'séances')}. Touche une barre.`,
    highlight: weeks.length - 1,
    integer: true,
  });
}

// ---------- TON ÉQUILIBRE ----------

export function balanceCard(ps: PeriodStats): HTMLElement {
  const { cur, prev, spans } = ps;
  const b = cur.balance;
  const period = spans.period;
  if (!b.pillarDays && !b.sleepNights && b.stressAvg === null && b.bodyBatteryAvg === null && !b.breathing) {
    return emptyCard(ICON.moon, 'Pas encore de données d’équilibre',
      'Coche tes piliers et note ton sommeil dans Équilibre : ici apparaîtront tes nuits, ton stress et ton Body Battery.');
  }
  const bubble = b.pillarsAvg !== null
    ? keyBubble(dec(b.pillarsAvg), `sur ${b.pillarsMax}`, 'piliers / jour')
    : keyBubble(b.sleepAvg !== null ? dec(b.sleepAvg) : '—', 'h', 'de sommeil');
  const rows: (HTMLElement | null)[] = [];
  if (b.sleepAvg !== null) {
    rows.push(infoRow({
      icon: ICON.moon, title: h('span', { class: 'num' }, `Sommeil : ${dec(b.sleepAvg)} h en moyenne`),
      detail: b.shortNights ? `${pl(b.shortNights, 'nuit', 'nuits')} sous 6 h sur ${b.sleepNights}` : `Aucune nuit sous 6 h sur ${pl(b.sleepNights, 'nuit notée', 'nuits notées')}`,
    }));
  }
  if (b.stressAvg !== null || b.bodyBatteryAvg !== null) {
    rows.push(infoRow({
      icon: ICON.battery,
      title: h('span', { class: 'num' }, [b.stressAvg !== null ? `Stress ${b.stressAvg}` : null, b.bodyBatteryAvg !== null ? `Body Battery ${b.bodyBatteryAvg}` : null].filter(Boolean).join(' · ')),
      detail: 'Moyennes Garmin notées à la main.',
    }));
  }
  rows.push(infoRow({
    icon: ICON.wave,
    title: b.breathing ? `Cohérence cardiaque : ${pl(b.breathing, 'séance', 'séances')}` : 'Pas encore de respiration notée',
    detail: b.breathing ? 'Chaque séance calme ton système nerveux.' : '3 × 5 min par jour aident beaucoup contre le stress.',
  }));
  return h('section', { class: 'card ux solo pg-card' },
    head(bubble,
      b.pillarDays ? `${pl(b.pillarDays, 'jour coché', 'jours cochés')}` : 'Tes nuits',
      b.sleepAvg !== null && b.pillarsAvg !== null ? `sommeil moyen ${dec(b.sleepAvg)} h` : null,
      b.sleepAvg !== null && b.sleepAvg >= 7 ? h('span', { class: 'chip good' }, 'bien reposée') : null,
    ),
    prev && (prev.balance.sleepNights || prev.balance.pillarDays) ? chips([
      cmpChip(diff(b.sleepAvg, prev.balance.sleepAvg), (a) => `${dec(Math.round(a * 10) / 10)} h de sommeil`, 'up', period, 0.1),
      cmpChip(diff(b.pillarsAvg, prev.balance.pillarsAvg), (a) => `${dec(Math.round(a * 10) / 10)} pilier${a >= 2 ? 's' : ''}/j`, 'up', period, 0.1),
    ]) : null,
    rows,
    b.sleepNights ? disclosure('Voir tes nuits', () => sleepChart(lastDays(b.perNight), period), `pg-sleep-${period}`) : null,
  );
}

function sleepChart(raw: { date: string; sleepH: number | null }[], period: Period): HTMLElement {
  const nights = padWeek<{ date: string; sleepH: number | null; future?: boolean }>(raw, period, (date) => ({ date, sleepH: null, future: true }));
  const ticks = dayTicks(nights, period);
  return barChart(nights.map((d, i) => ({
    tick: ticks[i],
    value: d.sleepH,
    readout: `${fmtShort(d.date)} · ${d.future ? 'à venir' : d.sleepH === null ? 'pas noté' : `${dec(d.sleepH)} h`}`,
  })), {
    ariaLabel: 'Heures de sommeil par nuit, repère à 7 heures',
    hint: 'Touche une barre pour lire la nuit.',
    refValue: 7,
    refLabel: '7 h',
    fmtAxis: (v) => `${v} h`,
  });
}

// ---------- TON CYCLE ----------

export function cycleCard(ps: PeriodStats, state: AppState): HTMLElement | null {
  const p = state.profile;
  const cs = cycleSettings(p);
  if (!cs.tracking) return null;
  if (cs.pregnant) {
    return emptyCard(ICON.heart, 'Mode grossesse', 'Le suivi par phase du cycle est en pause. Prends soin de toi.');
  }
  const c = ps.cur.cycle;
  const info = cycleOn(ps.spans.cur.to, p, state.days);
  if (!c.phases.length || !info) {
    return emptyCard(ICON.cycle, 'Ton cycle apparaîtra ici',
      'Note le 1er jour de tes règles : on verra ton poids, ton énergie, tes séances et tes craquages selon la phase.');
  }
  const withW = c.phases.filter((x) => x.weightDelta !== null);
  const maxW = withW.sort((a, b) => (b.weightDelta ?? 0) - (a.weightDelta ?? 0))[0];
  const withE = c.phases.filter((x) => x.energyAvg !== null);
  const bestE = [...withE].sort((a, b) => (b.energyAvg ?? 0) - (a.energyAvg ?? 0))[0];
  const totalSlips = c.phases.reduce((a, x) => a + x.slips, 0);
  const topSlip = [...c.phases].sort((a, b) => b.slips - a.slips)[0];
  const rows: HTMLElement[] = [];
  if (maxW && (maxW.weightDelta ?? 0) > 0.1) {
    rows.push(infoRow({ icon: ICON.drop, title: h('span', { class: 'num' }, `${maxW.label} : ${fmtDelta(maxW.weightDelta!)} kg`), detail: 'Par rapport à ta moyenne du cycle. Souvent de l’eau, ça repart.' }));
  } else if (withW.length) {
    rows.push(infoRow({ icon: ICON.drop, title: 'Poids stable selon la phase', detail: 'Peu d’écart avec ta moyenne du cycle.' }));
  }
  if (bestE && withE.length >= 2) rows.push(infoRow({ icon: ICON.sun, title: `Énergie au top : ${bestE.label.toLowerCase()}`, detail: `${dec(bestE.energyAvg!)}/5 en moyenne ces jours-là` }));
  if (totalSlips >= 2 && topSlip && topSlip.slips) {
    rows.push(infoRow({ icon: ICON.heart, title: `Moments difficiles surtout : ${topSlip.label.toLowerCase()}`, detail: `${topSlip.slips} sur ${totalSlips}. Ton corps demande plus : c’est normal.` }));
  }
  if (!rows.length) rows.push(infoRow({ icon: ICON.cycle, title: 'Encore un peu de recul', detail: 'Pèse-toi et note ton énergie : les écarts par phase se dessineront.' }));
  return h('section', { class: 'card ux solo pg-card' },
    head(keyBubble(`J${info.day}`, undefined, phaseLabel(info.phase).replace(/^Phase /, '')),
      c.starts ? `${pl(c.starts, 'début de règles', 'débuts de règles')} sur la période` : 'Ton cycle en cours',
      `cycle moyen ${info.length} jours`),
    rows.slice(0, 3),
    disclosure('Voir par phase', () => h('div', { class: 'list' }, c.phases.map((x) => h('div', { class: 'list-row' },
      h('span', { class: `pg-ph ph-${x.phase}`, 'aria-hidden': 'true' }),
      h('div', { class: 'main' },
        h('div', { class: 'title' }, x.label, h('span', { class: 'small muted' }, ` · ${pl(x.days, 'jour', 'jours')}`)),
        h('div', { class: 'sub num' }, [
          x.weightDelta !== null ? `poids ${fmtDelta(x.weightDelta)} kg` : 'poids —',
          x.energyAvg !== null ? `énergie ${dec(x.energyAvg)}/5` : null,
          pl(x.sessions, 'séance', 'séances'),
          x.slips ? pl(x.slips, 'moment difficile', 'moments difficiles') : null,
        ].filter(Boolean).join(' · ')),
      ),
    )))
    , `pg-cycle-${ps.spans.period}`),
  );
}

