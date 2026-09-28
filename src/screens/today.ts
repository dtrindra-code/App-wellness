// "Aujourd'hui": the only screen opened every day. Most important first:
// countdown, quote, weight, energy budget, today's session, the week.

import type { Screen, ScreenCtx } from './types';
import type { PlannedSession, Sport, Workout } from '../types';
import { store, uid } from '../store';
import { h, gearIcon, bar, toast, fmtKg, fmtInt, fmtDelta, parseNum, SPORT_GLYPH, SPORT_LABEL } from '../lib/ui';
import { today, addDays, daysBetween, fmtLong, mondayOf, weekday } from '../lib/dates';
import { phaseOn, targets, totals, movingAverage, plannedWeight } from '../lib/nutrition';
import { adaptedSessionsOn } from '../data/plan';
import { adviceFor, cycleOn, cycleSettings, phaseLabel } from '../lib/cycle';
import { recoveryFlag } from '../lib/habits';
import { quoteFor } from '../data/quotes';
import { openOnboarding } from './onboarding';

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
  const cyc = cycleLine(date, ctx);
  if (cyc) root.append(cyc);

  if (store.state.loaded && !p.onboarded) root.append(onboardingCard());

  root.append(quoteCard(date), weightCard(date, ctx), energyCard(date, ctx), sessionCard(date, ctx), weekCard(date));
};

// ---------- 1. header ----------


/** Extra kcal the cycle phase allows today (0 when unknown, off or pregnant). */
function cycleAdjustOn(date: string): number {
  const p = store.profile;
  const cs = cycleSettings(p);
  if (!cs.tracking || cs.pregnant) return 0;
  const info = cycleOn(date, p, store.state.days);
  return info ? adviceFor(info, p, date).kcalAdjust : 0;
}

function cycleLine(date: string, ctx: ScreenCtx): HTMLElement | null {
  const p = store.profile;
  const cs = cycleSettings(p);
  let text: string;
  if (cs.pregnant) {
    text = 'Mode grossesse · on mange à l’équilibre, sport doux';
  } else {
    if (!cs.tracking) return null;
    const info = cycleOn(date, p, store.state.days);
    if (!info) return null;
    text = `J${info.day} · ${phaseLabel(info.phase)} — ${adviceFor(info, p, date).headline}`;
  }
  return h('button', { class: 'td-cycle', type: 'button', onclick: () => ctx.go('balance') },
    h('span', { class: 'td-cycle-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'grow' }, text),
    h('span', { class: 'muted', 'aria-hidden': 'true' }, '›'),
  );
}

function header(date: string, ctx: ScreenCtx): HTMLElement {
  const p = store.profile;
  const phase = phaseOn(date, p);
  let title: string;
  if (date < p.vacationStart) {
    const n = daysBetween(date, p.vacationStart);
    title = `J−${n} avant les Maldives`;
  } else if (date < p.raceDate) {
    const n = daysBetween(date, p.raceDate);
    title = `J−${n} avant le half`;
  } else if (date === p.raceDate) {
    title = 'Jour J';
  } else {
    title = 'Half bouclé';
  }
  const dateLabel = fmtLong(date);
  return h('header', { class: 'screen-head' },
    h('div', { class: 'stack', style: 'gap:4px' },
      h('div', { class: 'eyebrow' }, `${phase.label} · ${dateLabel}`),
      h('h1', null, title),
    ),
    h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Réglages', onclick: () => ctx.go('settings') }, gearIcon()),
  );
}

function onboardingCard(): HTMLElement {
  return h('section', { class: 'card accent' },
    h('h2', null, 'Configure ton profil'),
    h('p', { class: 'small' }, 'Deux minutes pour caler tes objectifs et ton budget du jour.'),
    h('button', { class: 'btn primary block', onclick: () => openOnboarding() }, 'C’est parti'),
  );
}

// ---------- 2. quote ----------

function quoteCard(date: string): HTMLElement {
  const q = quoteFor(date);
  return h('section', { class: 'card flat' },
    h('p', { class: 'quote' }, q.text),
    q.author ? h('p', { class: 'quote-author' }, q.author) : null,
  );
}

// ---------- 3. weight ----------

function weightCard(date: string, ctx: ScreenCtx): HTMLElement {
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
    return h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', null, 'Pesée du jour'),
        editWeight ? h('button', { class: 'btn ghost sm', onclick: () => { editWeight = false; rerender(ctx); } }, 'Annuler') : null,
      ),
      h('div', { class: 'row' },
        input,
        h('span', { class: 'muted' }, 'kg'),
        h('button', { class: 'btn primary', onclick: save }, 'Enregistrer'),
      ),
      h('p', { class: 'small muted' }, 'Le matin, à jeun, après le passage aux toilettes. C’est la tendance qui compte.'),
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

  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', null, 'Poids'),
      h('span', { class: `chip ${status.tone}` }, status.text),
    ),
    h('div', { class: 'row between' },
      h('div', { class: 'stat' },
        h('div', { class: 'big-number' }, fmtKg(w), h('small', { class: 'muted small', style: 'font-size:0.9rem;margin-left:4px' }, 'kg')),
        h('div', { class: 'label' }, 'ce matin'),
      ),
    ),
    h('div', { class: 'grid-3' },
      stat(fmtKg(avg), 'kg', 'moyenne 7 j'),
      stat(fmtDelta(delta), 'kg', 'depuis le départ'),
      pregnant ? stat(fmtKg(pts.length ? pts[0].weight : w), 'kg', '1re pesée') : stat(fmtKg(planned), 'kg', 'prévu aujourd’hui'),
    ),
    h('div', { class: 'row between' },
      h('button', { class: 'btn ghost sm', onclick: () => { editWeight = true; rerender(ctx); } }, 'Corriger'),
      h('button', { class: 'btn sm', onclick: () => ctx.go('weight') }, 'Voir la courbe'),
    ),
  );
}

function stat(value: string, unit: string, label: string): HTMLElement {
  return h('div', { class: 'stat' },
    h('div', { class: 'value', style: 'font-size:1.15rem' }, value, h('small', null, unit)),
    h('div', { class: 'label' }, label),
  );
}

// ---------- 4. energy ----------

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
  const ratio = t.budget ? eaten.kcal / t.budget : 0;
  const over = left < 0;

  const water = day.water ?? 0;
  const setWater = (v: number) => {
    const next = Math.max(0, Math.round(v * 4) / 4);
    void store.updateDay(date, (d) => { d.water = next; });
  };

  const macro = (label: string, value: number, target: number, unit: string, ceiling = false) => {
    const r = target ? value / target : 0;
    const tone = ceiling ? (r > 1 ? 'warn' : 'accent') : r >= 1 ? 'good' : 'accent';
    return h('div', { class: 'stack', style: 'gap:6px' },
      h('div', { class: 'row between small' },
        h('span', null, label),
        h('span', { class: 'num muted' }, `${fmtInt(value)} / ${fmtInt(target)} ${unit}${ceiling ? ' max' : ''}`),
      ),
      bar(r, tone),
    );
  };

  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', null, 'Énergie'),
      h('span', { class: 'small muted num' }, `${fmtInt(eaten.kcal)} kcal mangées`),
    ),
    h('div', { class: 'stack', style: 'gap:6px' },
      h('div', { class: 'row', style: 'align-items:baseline;gap:8px' },
        h('span', { class: 'muted' }, over ? 'dépassé de' : 'reste'),
        h('span', { class: 'big-number' }, fmtInt(Math.abs(left))),
        h('span', { class: 'muted' }, 'kcal'),
      ),
      bar(ratio, over ? 'warn' : 'accent'),
      h('p', { class: 'small muted num' },
        (t.sportBonus ? `objectif ${fmtInt(t.kcal)} + ${fmtInt(t.sportBonus)} sport` : `objectif ${fmtInt(t.kcal)} kcal`) +
        (cycleExtra > 0 ? ` · dont +${fmtInt(cycleExtra)} kcal (cycle)` : '')),
      over ? h('p', { class: 'small muted' }, 'Pas grave, c’est une journée parmi d’autres. Demain on reprend.') : null,
    ),
    macro('Protéines', eaten.protein, t.protein, 'g'),
    t.carbsMax !== undefined ? macro('Glucides', eaten.carbs, t.carbsMax, 'g', true) : null,
    h('div', { class: 'row between' },
      h('div', { class: 'stack', style: 'gap:2px' },
        h('span', { class: 'small' }, 'Eau'),
        h('span', { class: 'num' }, `${fmtKg(water)} / ${fmtKg(t.waterL)} L`),
      ),
      h('div', { class: 'row', style: 'gap:8px' },
        h('button', { class: 'btn-icon', 'aria-label': 'Retirer 0,25 L', disabled: water <= 0, onclick: () => setWater(water - 0.25) }, '−'),
        h('button', { class: 'btn-icon', 'aria-label': 'Ajouter 0,25 L', onclick: () => setWater(water + 0.25) }, '+'),
      ),
    ),
    h('button', { class: 'btn block', onclick: () => ctx.go('food') }, 'Ajouter un repas'),
  );
}

// ---------- 5. today's session ----------

function logWorkout(date: string, w: Omit<Workout, 'id'>, msg: string) {
  void store.updateDay(date, (d) => { d.workouts.push({ id: uid(), ...w }); });
  toast(msg);
}

function sessionCard(date: string, ctx: ScreenCtx): HTMLElement {
  const p = store.profile;
  const day = store.getDay(date);
  const sessions = adaptedSessionsOn(date, p, store.state.days);
  const recovery = recoveryFlag(date, store.state.days);
  const card = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Ta séance')));
  const pending = sessions.some(({ session }) => !day.workouts.some((w) => w.plannedId === session.id));
  if (recovery.low && pending) {
    card.append(h('div', { class: 'td-recovery', role: 'note' },
      `Récup d’abord : ${recovery.reason.replace(/^(Stress|Sommeil)/, (m) => m.toLowerCase())}. Fais la version mini ou une marche.`));
  }

  if (!sessions.length) {
    const moved = day.workouts.length > 0;
    card.append(
      h('p', null, moved ? 'Tu as bougé aujourd’hui. Bien joué.' : 'Jour off. Une marche de 20 min compte aussi.'),
      h('button', { class: 'btn block', onclick: () => ctx.go('training') }, 'J’ai bougé'),
    );
  } else {
    const list = h('div', { class: 'list' });
    for (const a of sessions) list.append(sessionRow(date, a.session, day.workouts, a.note, recovery.low));
    card.append(list);
  }

  if (p.basketDays.includes(weekday(date))) {
    const basketDone = day.workouts.some((w) => w.sport === 'basket');
    card.append(
      basketDone
        ? h('div', { class: 'row' }, h('span', { class: 'glyph done' }, SPORT_GLYPH.basket), h('span', null, 'Basket noté. Bravo.'))
        : h('div', { class: 'row between wrap' },
            h('span', { class: 'small' }, 'Basket ce soir ? Pense à le noter.'),
            h('button', {
              class: 'btn sm',
              onclick: () => logWorkout(date, { sport: 'basket' as Sport, minutes: 90 }, 'Basket noté'),
            }, 'Basket fait (90 min)'),
          ),
    );
  }
  return card;
}

function sessionRow(date: string, s: PlannedSession, workouts: Workout[], note?: string, lowRecovery = false): HTMLElement {
  const done = workouts.find((w) => w.plannedId === s.id);
  const glyph = h('span', { class: 'glyph' + (done ? ' done' : '') }, SPORT_GLYPH[s.sport] ?? '··');
  const intensityTone = s.intensity === 'soutenu' ? 'warn' : s.intensity === 'modéré' ? 'accent' : '';

  if (done) {
    return h('div', { class: 'list-row' },
      glyph,
      h('div', { class: 'main' },
        h('div', { class: 'title' }, s.title),
        h('div', { class: 'sub' }, done.mini ? `Version mini faite · ${done.minutes} min` : `Faite · ${done.minutes} min`),
      ),
      h('span', { class: 'chip good' }, 'Bravo'),
    );
  }

  const open = miniOpen.has(s.id);
  const rerenderRow = () => {
    const next = sessionRow(date, s, store.getDay(date).workouts, note, lowRecovery);
    row.replaceWith(next);
  };
  const row = h('div', { class: 'list-row', style: 'align-items:flex-start' },
    glyph,
    h('div', { class: 'main stack', style: 'gap:8px' },
      h('div', null,
        h('div', { class: 'title' }, s.title),
        h('div', { class: 'row wrap', style: 'gap:6px;margin-top:4px' },
          h('span', { class: 'chip num' }, `${s.minutes} min`),
          h('span', { class: 'chip ' + intensityTone }, s.intensity),
          s.optional ? h('span', { class: 'chip' }, 'optionnelle') : null,
          h('span', { class: 'small muted' }, SPORT_LABEL[s.sport] ?? ''),
        ),
      ),
      h('p', { class: 'small' }, s.details),
      note ? h('p', { class: 'small td-note' }, note) : null,
      open && s.mini
        ? h('div', { class: 'card flat', style: 'padding:12px;gap:8px;background:var(--surface-2);border-color:transparent' },
            h('div', { class: 'eyebrow' }, 'Version mini · 15 min'),
            h('p', { class: 'small' }, s.mini),
            h('button', {
              class: 'btn primary sm',
              onclick: () => {
                miniOpen.delete(s.id);
                logWorkout(date, { sport: s.sport, minutes: 15, plannedId: s.id, mini: true }, 'Mini faite. Ça compte.');
              },
            }, 'Mini faite'),
          )
        : null,
      h('div', { class: 'row wrap', style: 'gap:8px' },
        h('button', {
          class: 'btn sm' + (lowRecovery && s.mini ? '' : ' primary'),
          onclick: () => {
            miniOpen.delete(s.id);
            logWorkout(date, { sport: s.sport, minutes: s.minutes, plannedId: s.id, mini: false }, 'Séance faite. Bravo.');
          },
        }, 'C’est fait'),
        s.mini
          ? h('button', {
              class: 'btn sm' + (lowRecovery ? (open ? '' : ' primary') : ' ghost'),
              onclick: () => {
                if (open) miniOpen.delete(s.id); else miniOpen.add(s.id);
                rerenderRow();
              },
            }, open ? 'Masquer la mini' : 'Version mini')
          : null,
      ),
    ),
  );
  return row;
}

// ---------- 6. week strip ----------

function weekCard(date: string): HTMLElement {
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
  return h('section', { class: 'card flat' },
    h('div', { class: 'week-strip', role: 'img', 'aria-label': label }, dots),
    h('p', { class: 'small muted', style: 'text-align:center' }, label),
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
