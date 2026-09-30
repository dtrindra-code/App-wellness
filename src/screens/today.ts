// "Aujourd'hui": the only screen opened every day. Built like a theme-park app home:
// clear sections, one topic and one action per card, details folded away.
// TA JOURNÉE (coach word + check-ins + "J'ai craqué" + Sunday bilan, countdown, cycle, weigh-in) · quote band · TON ÉNERGIE · TA SÉANCE ·
// CONSEILS DU JOUR (tips carousel) · TES PILIERS.

import type { Screen, ScreenCtx } from './types';
import type { PlannedSession, Sport, Workout } from '../types';
import { store, uid } from '../store';
import {
  h, gearIcon, screenTitle, starSticker, clipSticker, bar, toast, fmtKg, fmtInt, fmtDelta, parseNum, openSheet,
  SPORT_GLYPH, SPORT_LABEL, sectionTitle, actionLink, infoRow, iconCircle, carousel, tipCard, disclosure, keyBubble, ICON,
} from '../lib/ui';
import type { TipOpts } from '../lib/ui';
import { today, addDays, daysBetween, fmtLong, fmtDayMonth, mondayOf, weekday } from '../lib/dates';
import { phaseOn, targets, totals, movingAverage, plannedWeight } from '../lib/nutrition';
import { adaptedSessionsOn } from '../data/plan';
import { adviceFor, cycleOn, cycleSettings, phaseLabel, TTC_TIPS, PREGNANCY_NOTE } from '../lib/cycle';
import { recoveryFlag, HABITS, habitScore, weekHabitStats } from '../lib/habits';
import { quoteFor } from '../data/quotes';
import { openOnboarding } from './onboarding';
import { coachBlocks } from './coach';

// ---------- transient UI state ----------
/** Planned session ids whose "version mini" is unfolded. */
const miniOpen = new Set<string>();
/** True while re-entering today's weight. */
let editWeight = false;

const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const renderToday: Screen = (root, ctx) => {
  const date = today();
  const p = store.profile;

  root.append(header(date, ctx));
  if (store.state.loaded && !p.onboarded) root.append(onboardingCard());

  root.append(
    sectionTitle('Ta journée'),
    ...(p.onboarded ? coachBlocks(date) : []),
    countdownCard(date, ctx),
    weighCard(date, ctx),
    quoteBand(date),
    sectionTitle('Ton énergie'),
    energyCard(date, ctx),
    sectionTitle('Ta séance'),
    sessionCard(date, ctx),
    sectionTitle('Conseils du jour'),
    tipsCarousel(date, ctx),
    sectionTitle('Tes piliers'),
    pillarsCard(date, ctx),
  );
};

// ---------- header ----------

function header(date: string, ctx: ScreenCtx): HTMLElement {
  return h('header', { class: 'screen-head' },
    h('div', { class: 'stack', style: 'gap:6px' },
      screenTitle('Aujourd’hui'),
      h('p', { class: 'subtitle' }, fmtLong(date)),
    ),
    h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Réglages', onclick: () => ctx.go('settings') }, gearIcon()),
  );
}

function onboardingCard(): HTMLElement {
  return h('section', { class: 'card accent ux solo' },
    h('h2', null, 'Configure ton profil'),
    h('p', { class: 'small' }, 'Deux minutes pour caler tes objectifs et ton budget du jour.'),
    h('button', { class: 'btn primary block', onclick: () => openOnboarding() }, 'C’est parti'),
  );
}

// ---------- TA JOURNÉE ----------

/** Extra kcal the cycle phase allows today (0 when unknown, off or pregnant). */
function cycleAdjustOn(date: string): number {
  const p = store.profile;
  const cs = cycleSettings(p);
  if (!cs.tracking || cs.pregnant) return 0;
  const info = cycleOn(date, p, store.state.days);
  return info ? adviceFor(info, p, date).kcalAdjust : 0;
}

function cycleRow(date: string, ctx: ScreenCtx): HTMLElement | null {
  const p = store.profile;
  const cs = cycleSettings(p);
  if (cs.pregnant) {
    return infoRow({ icon: ICON.heart, title: 'Mode grossesse', detail: 'On mange à l’équilibre, sport doux', onClick: () => ctx.go('balance'), cls: 'td-cyc' });
  }
  if (!cs.tracking) return null;
  const info = cycleOn(date, p, store.state.days);
  if (!info) return null;
  return infoRow({
    icon: ICON.cycle,
    title: `J${info.day} · ${phaseLabel(info.phase)}`,
    detail: adviceFor(info, p, date).headline,
    onClick: () => ctx.go('balance'),
    cls: 'td-cyc',
  });
}

/** Countdown hero on crumpled paper: J−N bubble with its star, "avant les Maldives", the cycle row. */
function countdownCard(date: string, ctx: ScreenCtx): HTMLElement {
  const p = store.profile;
  const phase = phaseOn(date, p);
  let big: string;
  let rest: string | null = null;
  let aside: string | null = null;
  if (date < p.vacationStart) {
    big = `J−${daysBetween(date, p.vacationStart)}`;
    rest = 'avant les Maldives';
    aside = `départ le ${fmtDayMonth(p.vacationStart)}`;
  } else if (date < p.raceDate) {
    big = `J−${daysBetween(date, p.raceDate)}`;
    rest = 'avant le half';
    aside = `course le ${fmtDayMonth(p.raceDate)}`;
  } else if (date === p.raceDate) {
    big = 'Jour J';
    rest = 'c’est aujourd’hui';
  } else {
    big = 'Bravo';
    rest = 'half bouclé';
  }
  const bubble = keyBubble(big, undefined, undefined, 'pink');
  bubble.append(starSticker('td-star'));
  return h('section', { class: 'card ux td-hero paper' },
    h('div', { class: 'td-hero-main' },
      bubble,
      h('div', { class: 'td-hero-text' },
        h('span', { class: 'chip accent', style: 'align-self:flex-start' }, phase.label),
        rest ? h('p', { class: 'italic' }, rest) : null,
        aside ? h('p', { class: 'small muted' }, aside) : null,
      ),
    ),
    cycleRow(date, ctx),
  );
}

/** Weigh-in: a quick inline form until logged, then one row + folded details. */
function weighCard(date: string, ctx: ScreenCtx): HTMLElement {
  const p = store.profile;
  const day = store.getDay(date);
  const logged = typeof day.weight === 'number';

  if (!logged || editWeight) {
    const last = store.weightOn(addDays(date, -1));
    const input = h('input', {
      class: 'input num grow',
      type: 'text',
      inputMode: 'decimal',
      placeholder: fmtKg(logged ? day.weight : last),
      'aria-label': 'Poids du jour en kg',
      autocomplete: 'off',
    });
    const save = () => {
      const v = parseNum(input.value);
      if (v === undefined || v < 30 || v > 250) {
        toast('Entre un poids en kg, par ex. 70,4');
        return;
      }
      editWeight = false;
      input.blur();
      void store.updateDay(date, (d) => { d.weight = Math.round(v * 10) / 10; });
      toast('Pesée enregistrée');
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    return h('section', { class: 'card ux solo' },
      h('div', { class: 'row' },
        iconCircle(ICON.scale),
        h('div', { class: 'grow' },
          h('div', { class: 'info-title' }, 'Pesée du jour'),
          h('div', { class: 'info-detail' }, 'Le matin, à jeun. C’est la tendance qui compte.'),
        ),
        editWeight ? h('button', { class: 'btn ghost sm', onclick: () => { editWeight = false; rerender(ctx); } }, 'Annuler') : null,
      ),
      h('div', { class: 'row' },
        input,
        h('span', { class: 'muted' }, 'kg'),
        h('button', { class: 'btn primary', onclick: save }, 'Enregistrer'),
      ),
    );
  }

  const w = day.weight as number;
  const pts = store.weights().filter((pt) => pt.date <= date);
  const ma = movingAverage(pts);
  const avg = ma.length ? ma[ma.length - 1].avg : w;
  const delta = avg - p.startWeight;
  const planned = plannedWeight(date, p);
  const gap = avg - planned;
  // Pregnancy mode: no loss plan, so no "ahead/behind" judgement.
  const pregnant = cycleSettings(p).pregnant;
  let status: { text: string; tone: string };
  if (pregnant) status = { text: 'pour info', tone: 'accent' };
  else if (gap <= -0.3) status = { text: 'en avance', tone: 'good' };
  else if (gap <= 0.3) status = { text: 'sur la courbe', tone: 'accent' };
  else status = { text: 'un peu au-dessus', tone: 'warn' };

  return h('section', { class: 'card ux' },
    infoRow({
      icon: ICON.scale,
      title: h('span', { class: 'num' }, `${fmtKg(w)} kg ce matin`),
      detail: `moyenne 7 j : ${fmtKg(avg)} kg`,
      trail: h('span', { class: `chip ${status.tone}` }, status.text),
    }),
    disclosure('Voir le détail', () => [
      h('div', { class: 'grid-3' },
        stat(fmtKg(avg), 'kg', 'moyenne 7 j'),
        stat(fmtDelta(delta), 'kg', 'depuis le départ'),
        pregnant ? stat(fmtKg(pts.length ? pts[0].weight : w), 'kg', '1re pesée') : stat(fmtKg(planned), 'kg', 'prévu aujourd’hui'),
      ),
      h('button', { class: 'btn ghost sm', style: 'align-self:flex-start', onclick: () => { editWeight = true; rerender(ctx); } }, 'Corriger la pesée'),
    ], 'td-weight'),
    actionLink('Voir ma courbe', () => ctx.go('weight')),
  );
}

function stat(value: string, unit: string, label: string): HTMLElement {
  return h('div', { class: 'stat' },
    h('div', { class: 'value', style: 'font-size:1.15rem' }, value, h('small', null, unit)),
    h('div', { class: 'label' }, label),
  );
}

// ---------- quote band ----------

function quoteBand(date: string): HTMLElement {
  const q = quoteFor(date);
  return h('section', { class: 'td-quote-band paper', 'aria-label': 'Citation du jour' },
    clipSticker('td-clip'),
    h('p', { class: 'quote' }, q.text),
    q.author ? h('p', { class: 'quote-author' }, q.author) : null,
  );
}

// ---------- TON ÉNERGIE ----------

function energyCard(date: string, ctx: ScreenCtx): HTMLElement {
  const p = store.profile;
  const day = store.getDay(date);
  const weight = store.weightOn(date);
  const adjust = cycleAdjustOn(date);
  const t = targets(date, p, weight, day, adjust);
  // What the cycle really added once the floor is applied.
  const cycleExtra = adjust > 0 ? t.kcal - targets(date, p, weight, day).kcal : 0;
  const eaten = totals(day);
  const left = t.budget - eaten.kcal;
  const over = left < 0;

  const water = day.water ?? 0;
  const setWater = (v: number) => {
    const next = Math.max(0, Math.round(v * 4) / 4);
    void store.updateDay(date, (d) => { d.water = next; });
  };

  const macro = (label: string, value: number, target: number, unit: string, ceiling = false) => {
    const r = target ? value / target : 0;
    const tone = ceiling ? (r > 1 ? 'warn' : 'accent') : r >= 1 ? 'good' : 'accent';
    return h('div', { class: 'td-mini' },
      h('div', { class: 'td-mini-top' },
        h('span', { style: 'font-weight:700' }, label),
        h('span', { class: 'num muted' }, `${fmtInt(value)} / ${fmtInt(target)} ${unit}${ceiling ? ' max' : ''}`),
      ),
      bar(r, tone),
    );
  };

  return h('section', { class: 'card ux' },
    h('div', { class: 'td-energy' },
      keyBubble(fmtInt(Math.abs(left)), 'kcal', over ? 'en plus' : 'restantes', over ? 'warn' : 'pink'),
      h('div', { class: 'td-energy-side' },
        macro('Calories', eaten.kcal, t.budget, 'kcal'),
        macro('Protéines', eaten.protein, t.protein, 'g'),
        h('div', { class: 'td-water' },
          h('div', { class: 'td-mini' },
            h('span', { class: 'small', style: 'font-weight:700' }, 'Eau'),
            h('span', { class: 'num small muted' }, `${fmtKg(water)} / ${fmtKg(t.waterL)} L`),
          ),
          h('div', { class: 'row', style: 'gap:6px' },
            h('button', { class: 'btn-icon', 'aria-label': 'Retirer 0,25 L', disabled: water <= 0, onclick: () => setWater(water - 0.25) }, '−'),
            h('button', { class: 'btn-icon', 'aria-label': 'Ajouter 0,25 L', onclick: () => setWater(water + 0.25) }, '+'),
          ),
        ),
      ),
    ),
    over ? h('p', { class: 'small muted', style: 'text-align:center' }, 'Pas grave, c’est une journée parmi d’autres. Demain on reprend.') : null,
    h('p', { class: 'small muted num', style: 'text-align:center' }, `${fmtInt(eaten.kcal)} kcal mangées sur ${fmtInt(t.budget)}`),
    disclosure('Voir le détail', () => [
      h('p', { class: 'small muted num' },
        (t.sportBonus ? `objectif ${fmtInt(t.kcal)} + ${fmtInt(t.sportBonus)} sport` : `objectif ${fmtInt(t.kcal)} kcal`) +
        (cycleExtra > 0 ? ` · dont +${fmtInt(cycleExtra)} kcal (cycle)` : '')),
      t.carbsMax !== undefined ? macro('Glucides', eaten.carbs, t.carbsMax, 'g', true) : null,
    ], 'td-energy'),
    actionLink('Voir mes repas', () => ctx.go('food')),
  );
}

// ---------- TA SÉANCE ----------

function logWorkout(date: string, w: Omit<Workout, 'id'>, msg: string) {
  void store.updateDay(date, (d) => { d.workouts.push({ id: uid(), ...w }); });
  toast(msg);
}

function sessionCard(date: string, ctx: ScreenCtx): HTMLElement {
  const p = store.profile;
  const day = store.getDay(date);
  const sessions = adaptedSessionsOn(date, p, store.state.days);
  const recovery = recoveryFlag(date, store.state.days);
  const card = h('section', { class: 'card ux' });
  const pending = sessions.some(({ session }) => !day.workouts.some((w) => w.plannedId === session.id));
  if (recovery.low && pending) {
    card.append(h('div', { class: 'td-recovery', role: 'note' },
      `Récup d’abord : ${recovery.reason.replace(/^(Stress|Sommeil)/, (m) => m.toLowerCase())}. Fais la version mini ou une marche.`));
  }

  if (!sessions.length) {
    const moved = day.workouts.length > 0;
    card.append(
      infoRow({
        icon: moved ? ICON.spark : ICON.leaf,
        title: moved ? 'Tu as bougé aujourd’hui' : 'Jour off',
        detail: moved ? 'Bien joué.' : 'Une marche de 20 min compte aussi.',
      }),
      h('button', { class: 'btn block', style: 'min-height:50px', onclick: () => ctx.go('training') }, 'J’ai bougé'),
    );
  } else {
    for (const a of sessions) card.append(sessionBlock(date, a.session, day.workouts, ctx, a.note, recovery.low));
  }

  if (p.basketDays.includes(weekday(date))) {
    const basketDone = day.workouts.some((w) => w.sport === 'basket');
    card.append(
      basketDone
        ? infoRow({ icon: SPORT_GLYPH.basket, title: 'Basket noté', detail: 'Bravo.', cls: 'td-done' })
        : infoRow({
            icon: SPORT_GLYPH.basket,
            title: 'Basket ce soir ?',
            detail: 'Pense à le noter.',
            trail: h('button', {
              class: 'btn sm',
              onclick: () => logWorkout(date, { sport: 'basket' as Sport, minutes: 90 }, 'Basket noté'),
            }, 'Fait (90 min)'),
          }),
    );
  }

  card.append(weekStrip(date), actionLink('Voir mon programme', () => ctx.go('training')));
  return card;
}

function sessionBlock(date: string, s: PlannedSession, workouts: Workout[], ctx: ScreenCtx, note?: string, lowRecovery = false): HTMLElement {
  const done = workouts.find((w) => w.plannedId === s.id);
  const intensityTone = s.intensity === 'soutenu' ? 'warn' : s.intensity === 'modéré' ? 'accent' : '';

  if (done) {
    return h('div', { class: 'td-sess' },
      infoRow({
        icon: SPORT_GLYPH[s.sport] ?? '··',
        title: s.title,
        detail: done.mini ? `Version mini faite · ${done.minutes} min` : `Faite · ${done.minutes} min`,
        trail: h('span', { class: 'chip good' }, 'Bravo'),
        cls: 'td-done',
      }),
    );
  }

  const open = miniOpen.has(s.id);
  const miniFirst = lowRecovery && !!s.mini;
  const doneBtn = h('button', {
    class: 'btn block' + (miniFirst ? '' : ' primary'),
    onclick: () => {
      miniOpen.delete(s.id);
      logWorkout(date, { sport: s.sport, minutes: s.minutes, plannedId: s.id, mini: false }, 'Séance faite. Bravo.');
    },
  }, 'C’est fait');
  const miniBtn = s.mini
    ? h('button', {
        class: 'btn block' + (miniFirst && !open ? ' primary' : ''),
        onclick: () => {
          if (open) miniOpen.delete(s.id); else miniOpen.add(s.id);
          rerender(ctx);
        },
      }, open ? 'Masquer la mini' : 'Version mini')
    : null;

  return h('div', { class: 'td-sess' },
    h('div', { class: 'td-sess-head' },
      iconCircle(SPORT_GLYPH[s.sport] ?? '··'),
      h('div', { class: 'grow stack', style: 'gap:6px' },
        h('div', { class: 'td-sess-title' }, s.title),
        h('div', { class: 'row wrap', style: 'gap:6px' },
          h('span', { class: 'chip num' }, `${s.minutes} min`),
          h('span', { class: 'chip ' + intensityTone }, s.intensity),
          s.optional ? h('span', { class: 'chip' }, 'optionnelle') : null,
        ),
      ),
    ),
    note ? h('p', { class: 'small td-note' }, note) : null,
    open && s.mini
      ? h('div', { class: 'td-mini-box' },
          h('div', { class: 'eyebrow' }, 'Version mini · 15 min'),
          h('p', { class: 'small' }, s.mini),
          h('button', {
            class: 'btn primary block',
            onclick: () => {
              miniOpen.delete(s.id);
              logWorkout(date, { sport: s.sport, minutes: 15, plannedId: s.id, mini: true }, 'Mini faite. Ça compte.');
            },
          }, 'Mini faite'),
        )
      : null,
    h('div', { class: 'td-actions' }, miniFirst && miniBtn ? [miniBtn, doneBtn] : [doneBtn, miniBtn]),
    disclosure('Voir le détail', () => [
      h('p', { class: 'small muted' }, SPORT_LABEL[s.sport] ?? ''),
      h('p', { class: 'small' }, s.details),
    ], `td-sess-${s.id}`),
  );
}

function weekStrip(date: string): HTMLElement {
  const mon = mondayOf(date);
  let sessions = 0;
  const dots = WEEK_LETTERS.map((letter, i) => {
    const d = addDays(mon, i);
    const n = store.getDay(d).workouts.length;
    sessions += n;
    const cls = 'week-dot' + (n > 0 ? ' on' : '') + (d === date ? ' today' : '');
    return h('div', { class: 'week-day' },
      h('span', { class: cls, 'aria-hidden': 'true' }),
      h('span', { class: 'week-letter' }, letter),
    );
  });
  const label = sessions === 0
    ? 'Aucune séance encore cette semaine'
    : `${sessions} séance${sessions > 1 ? 's' : ''} cette semaine`;
  return h('div', { class: 'stack', style: 'gap:8px;padding-top:4px' },
    h('div', { class: 'week-strip', role: 'img', 'aria-label': label }, dots),
    h('p', { class: 'small muted', style: 'text-align:center' }, label),
  );
}

// ---------- CONSEILS DU JOUR ----------

function tipSheet(title: string, paras: string[], action?: { label: string; run: () => void }) {
  const body = h('div', { class: 'stack' },
    paras.map((t) => h('p', null, t)),
    action ? h('button', { class: 'btn primary block', onclick: () => { sheet.close(); action.run(); } }, action.label) : null,
  );
  const sheet = openSheet(title, body);
}

function tipsCarousel(date: string, ctx: ScreenCtx): HTMLElement {
  const p = store.profile;
  const cs = cycleSettings(p);
  const phase = phaseOn(date, p);
  const recovery = recoveryFlag(date, store.state.days);
  const n = Math.abs(daysBetween('2026-01-01', date));
  const tips: TipOpts[] = [];

  if (recovery.low) {
    tips.push({
      icon: ICON.battery,
      title: 'Récup d’abord',
      text: `${recovery.reason} : aujourd’hui, la version mini ou une marche suffit.`,
      more: () => tipSheet('Récup d’abord', [
        `${recovery.reason}. Quand le corps récupère mal, une séance dure fatigue plus qu’elle ne fait progresser.`,
        'La version mini (15 min) ou une marche compte comme une séance faite. Le plan reprend demain.',
      ], { label: 'Voir mon équilibre', run: () => ctx.go('balance') }),
    });
  }

  if (cs.pregnant) {
    tips.push({ icon: ICON.heart, title: 'Mode grossesse', text: 'Plus de déficit : on mange à l’équilibre, sport doux.', more: () => tipSheet('Mode grossesse', [PREGNANCY_NOTE]) });
  } else if (cs.tracking) {
    const info = cycleOn(date, p, store.state.days);
    if (info) {
      const adv = adviceFor(info, p, date);
      const more = (title: string, main: string) => () => tipSheet(title, [main, `${adv.label} : ${adv.headline}`], { label: 'Voir mon cycle', run: () => ctx.go('balance') });
      tips.push(
        { icon: ICON.wave, title: 'Côté sport', text: adv.sport, more: more('Côté sport', adv.sport) },
        { icon: ICON.fork, title: 'Dans l’assiette', text: adv.food, more: more('Dans l’assiette', adv.food) },
        { icon: ICON.scale, title: 'Et la balance ?', text: adv.weight, more: more('Et la balance ?', adv.weight) },
      );
    }
    if (cs.ttc) {
      const t = TTC_TIPS[n % TTC_TIPS.length];
      tips.push({ icon: ICON.spark, title: 'Projet bébé', text: t, more: () => tipSheet('Projet bébé', TTC_TIPS) });
    }
  }

  tips.push({
    icon: ICON.plane,
    title: phase.label,
    text: phase.hint,
    more: () => tipSheet(phase.label, [phase.hint], { label: 'Voir mes repas', run: () => ctx.go('food') }),
  });

  const habit = HABITS[n % HABITS.length];
  tips.push({
    icon: ICON.sun,
    title: habit.label,
    text: habit.why,
    more: () => tipSheet(habit.label, [habit.why], { label: 'Voir mes piliers', run: () => ctx.go('balance') }),
  });

  return carousel(tips.map(tipCard), 'td-tips');
}

// ---------- TES PILIERS ----------

function pillarsCard(date: string, ctx: ScreenCtx): HTMLElement {
  const score = habitScore(store.getDay(date));
  const week = weekHabitStats(store.state.days, mondayOf(date));
  const max = HABITS.length;
  const dots = week.days.map((d, i) => {
    const cls = 'week-dot' + (d.done >= max / 2 ? ' on' : d.done > 0 ? ' half' : '') + (d.date === date ? ' today' : '');
    return h('div', { class: 'week-day' },
      h('span', { class: cls, 'aria-hidden': 'true' }),
      h('span', { class: 'week-letter' }, WEEK_LETTERS[i]),
    );
  });
  const line = score === 0
    ? 'Un seul pilier coché, c’est déjà une bonne journée.'
    : score >= max ? 'Tous les piliers : journée au top.' : 'Chaque pilier coché compte.';
  return h('section', { class: 'card ux' },
    h('div', { class: 'td-score' },
      h('span', { class: 'big-number' }, String(score)),
      h('span', { class: 'muted num' }, `/ ${max} aujourd’hui`),
    ),
    h('p', { class: 'small muted', style: 'text-align:center' }, line),
    h('div', { class: 'week-strip', role: 'img', 'aria-label': `${week.total} piliers cochés cette semaine` }, dots),
    actionLink('Voir tout', () => ctx.go('balance')),
  );
}

// ---------- helpers ----------

/** Local re-render for transient-state changes (no store change happens). */
function rerender(ctx: ScreenCtx) {
  const root = document.getElementById('screen');
  if (!root) return;
  const y = window.scrollY;
  root.replaceChildren();
  renderToday(root, ctx);
  window.scrollTo(0, y);
}
