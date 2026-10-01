// "Aujourd'hui": a coach that walks the day with her. Built like a theme-park app home,
// following the clock instead of a pile of cards:
//   header (date · J−N Maldives) → TON CYCLE hero (where she is, what it means, recovery)
//   → ONE coach card (message + inline check-in) → CE MATIN · TA JOURNÉE · CE SOIR.
// Only the current moment is unfolded (the morning also shows the day's plate and session);
// past moments fold into a one-line summary, the evening is a one-line preview until 18 h.
// Open/closed state is kept per moment and per day (`td-m-${moment}-${date}`).

import type { Screen, ScreenCtx } from './types';
import type { PlannedSession, Sport, Workout } from '../types';
import { store, uid } from '../store';
import {
  h, gearIcon, screenTitle, clipSticker, toast, fmtKg, fmtInt, parseNum,
  SPORT_GLYPH, SPORT_LABEL, sectionTitle, actionLink, infoRow, iconCircle, disclosure, ICON,
} from '../lib/ui';
import { today, addDays, daysBetween, fmtLong, mondayOf, weekday } from '../lib/dates';
import { movingAverage, plannedWeight } from '../lib/nutrition';
import { adaptedSessionsOn } from '../data/plan';
import { cycleOn, cycleSettings, phaseLabel } from '../lib/cycle';
import { recoveryFlag, habitScore } from '../lib/habits';
import { MOOD_LABELS } from '../lib/coach';
import { momentAt } from '../lib/cycle-guide';
import { quoteFor } from '../data/quotes';
import { openOnboarding } from './onboarding';
import { coachDayCard, weeklyBilanCard } from './coach';
import { backupReminderDue } from '../lib/sync';
import { budgetOn, cycleHero, guideSafe, plateCard, recoveryRow, regulateCard } from './today-guide';
import type { Moment } from './today-guide';
import {
  journeyInviteCard, journeyMorningCard, journeyMorningSummary, journeyPromptCard, journeyRecapCard, journeyRulesCard,
} from './journey';
import { sundayResetCard } from './sunday-reset';
import { journeyDay, resetDue, dayScore } from '../lib/journey';

// ---------- transient UI state ----------
/** Planned session ids whose "version mini" is unfolded. */
const miniOpen = new Set<string>();
/** True while re-entering today's weight. */
let editWeight = false;
/** Moments opened / folded by hand, by `td-m-${moment}-${date}` (the default changes every day). */
const momentOpen = new Map<string, boolean>();

const MOMENTS: Moment[] = ['matin', 'journee', 'soir'];
const MOMENT_TITLE: Record<Moment, string> = { matin: 'Ce matin', journee: 'Ta journée', soir: 'Ce soir' };
const NUDGE_KEY = 'cap-maldives:backup-nudge';

const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };

export const renderToday: Screen = (root, ctx) => {
  const date = today();
  const p = store.profile;
  const moment = momentAt(nowHour());
  const guide = guideSafe(date, { moment });

  root.append(header(date, ctx));
  root.append(quoteBand(date));
  if (store.state.loaded && !p.onboarded) root.append(onboardingCard());

  const hero = cycleHero(date, moment, ctx, guide);
  if (hero) root.append(hero);
  const bilan = moment === 'soir' && p.onboarded ? weeklyBilanCard(date) : null;
  if (p.onboarded) {
    root.append(coachDayCard(date, {
      moment,
      // No cycle hero (tracking off): the recovery line moves into the coach card.
      extra: hero ? null : recoveryRow(date),
      bilanShown: !!bilan,
      rerender: () => rerender(ctx),
    }));
  }

  if (p.onboarded) {
    const invite = journeyInviteCard(date);
    if (invite) root.append(invite);
  }

  for (const m of MOMENTS) root.append(...momentBlock(m, moment, date, ctx, bilan));
  root.append(...footer(date, moment, ctx));
};

// ---------- header ----------

function countdown(date: string): string | null {
  const p = store.profile;
  if (date < p.vacationStart) return `J−${daysBetween(date, p.vacationStart)} Maldives`;
  if (date < p.raceDate) return `J−${daysBetween(date, p.raceDate)} ${p.raceName || 'half'}`;
  if (date === p.raceDate) return 'Jour J';
  return null;
}

function header(date: string, ctx: ScreenCtx): HTMLElement {
  const cd = countdown(date);
  return h('header', { class: 'screen-head' },
    h('div', { class: 'stack', style: 'gap:6px' },
      screenTitle('Aujourd’hui'),
      h('p', { class: 'subtitle' }, fmtLong(date), cd ? h('span', { class: 'dc-cd' }, ` · ${cd}`) : null),
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

// ---------- moments ----------

function isOpen(m: Moment, current: Moment, date: string): { open: boolean; byDefault: boolean } {
  const byDefault = m === current || (current === 'matin' && m === 'journee');
  return { open: momentOpen.get(`td-m-${m}-${date}`) ?? byDefault, byDefault };
}

function setOpen(m: Moment, date: string, open: boolean, ctx: ScreenCtx) {
  momentOpen.set(`td-m-${m}-${date}`, open);
  rerender(ctx);
}

function momentBlock(m: Moment, current: Moment, date: string, ctx: ScreenCtx, bilan: HTMLElement | null): HTMLElement[] {
  const { open, byDefault } = isOpen(m, current, date);
  const title = sectionTitle(MOMENT_TITLE[m]);
  title.classList.add('dc-sec', `dc-sec-${m}`);
  if (!open) {
    return [title, h('button', {
      class: 'card ux dc-sum', type: 'button', 'aria-expanded': 'false',
      onclick: () => setOpen(m, date, true, ctx),
    },
      iconCircle(m === 'matin' ? ICON.sun : m === 'journee' ? ICON.fork : ICON.moon),
      h('span', { class: 'dc-sum-text' }, summary(m, current, date)),
      h('span', { class: 'dc-sum-chev', 'aria-hidden': 'true' }, '⌄'))];
  }
  const body = momentContent(m, current, date, ctx, bilan);
  const fold = byDefault ? null : h('button', { class: 'dc-fold', type: 'button', 'aria-expanded': 'true', onclick: () => setOpen(m, date, false, ctx) }, 'Replier');
  return [title, ...body, ...(fold ? [fold] : [])];
}

function momentContent(m: Moment, current: Moment, date: string, ctx: ScreenCtx, bilan: HTMLElement | null): HTMLElement[] {
  const out: (HTMLElement | null)[] = [];
  const re = () => rerender(ctx);
  const hour = nowHour();
  if (m === 'matin') {
    // Monday morning: last week's reset if not done yet.
    if (weekday(date) === 0 && resetDue(date, hour)) out.push(sundayResetCard(date, true));
    out.push(journeyMorningCard(date, re));
    out.push(regulateCard(date, 'matin', guideSafe(date, { moment: 'matin' })), weighCard(date, ctx));
  } else if (m === 'journee') {
    // In the evening the plate lives in CE SOIR (the dinner): no second copy here.
    if (current !== 'soir') out.push(plateCard(date, current, ctx, guideSafe(date, { moment: current, ideas: current === 'matin' ? 2 : 3 })));
    out.push(sessionCard(date, ctx, current === 'soir'));
    // The engagements live here until the evening, then move to CE SOIR.
    if (current !== 'soir') out.push(journeyRulesCard(date));
    if (current === 'journee') out.push(regulateCard(date, 'journee', guideSafe(date, { moment: 'journee' })));
  } else {
    if (current === 'soir') {
      if (weekday(date) === 6 && resetDue(date, hour)) out.push(sundayResetCard(date));
      out.push(bilan, journeyRulesCard(date));
    }
    out.push(journeyPromptCard(date, re), journeyRecapCard(date));
    if (current === 'soir') out.push(plateCard(date, 'soir', ctx, guideSafe(date, { moment: 'soir', ideas: 2 })));
    out.push(regulateCard(date, 'soir', guideSafe(date, { moment: 'soir' })), tomorrowCard(date, ctx));
  }
  return out.filter((x): x is HTMLElement => !!x);
}

/** One-line summary of a folded moment: what was done, the main result. */
function summary(m: Moment, current: Moment, date: string): string {
  const day = store.getDay(date);
  if (m === 'matin') {
    const parts: string[] = [];
    const mood = day.checkin?.morningMood;
    const jr = journeyMorningSummary(date);
    if (jr) parts.push(jr);
    else if (mood !== undefined) parts.push(`humeur ${MOOD_LABELS[mood - 1] ?? ''}`.trim());
    if (typeof day.weight === 'number') parts.push(`pesée ${fmtKg(day.weight)}`);
    const pillars = habitScore(day);
    if (pillars) parts.push(`${pillars} pilier${pillars > 1 ? 's' : ''} ✓`);
    return parts.length ? `Ce matin · ${parts.join(' · ')}` : 'Ce matin · rien de noté, ce n’est pas grave';
  }
  if (m === 'journee') {
    const { t, eaten } = budgetOn(date);
    const plate = store.profile.cycle?.pregnant
      ? `Protéines ${fmtInt(eaten.protein)}/${fmtInt(t.protein)} g`
      : `Assiette ${fmtInt(eaten.kcal)}/${fmtInt(t.budget)} kcal`;
    const parts = [plate, sessionSummary(date)];
    if (journeyDay(date) !== null) { const sc = dayScore(date); parts.push(`engagements ${sc.done}/${sc.total}${sc.success ? ' ✓' : ''}`); }
    return parts.join(' · ');
  }
  // Evening preview.
  const tip = guideSafe(date, { moment: 'soir' })?.regulate?.[0];
  const first = tip ? tip.title.charAt(0).toLowerCase() + tip.title.slice(1) : 'écrans off 30 min avant le coucher';
  const page = journeyDay(date) !== null && !day.journey?.answer ? 'ta page du jour · ' : '';
  return current === 'soir' ? `Ce soir · ${page}${first}` : `Ce soir : ${page}${first} · ton bilan à partir de 18 h`;
}

function sessionSummary(date: string): string {
  const p = store.profile;
  const day = store.getDay(date);
  const sessions = adaptedSessionsOn(date, p, store.state.days).filter((a) => !a.session.optional);
  if (!sessions.length) return day.workouts.length ? 'tu as bougé ✓' : 'jour off';
  const done = sessions.map((a) => day.workouts.find((w) => w.plannedId === a.session.id));
  if (done.every(Boolean)) return done.some((w) => w?.mini) ? 'séance mini faite ✓' : 'séance faite ✓';
  const next = nextSession(date);
  return next ? `pas faite aujourd’hui : demain, ${next.title} ${next.minutes} min` : 'pas faite aujourd’hui';
}

function nextSession(date: string): PlannedSession | null {
  const d1 = addDays(date, 1);
  const list = adaptedSessionsOn(d1, store.profile, store.state.days);
  return (list.find((a) => !a.session.optional) ?? list[0])?.session ?? null;
}

// ---------- weigh-in ----------

/** Weigh-in: a quick inline form until logged, then one line (trend in the morning summary). */
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
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    return h('section', { class: 'card ux solo dc-weigh' },
      h('div', { class: 'row between' },
        h('span', { class: 'info-title' }, 'Pesée du jour'),
        editWeight
          ? h('button', { class: 'dc-link', type: 'button', onclick: () => { editWeight = false; rerender(ctx); } }, 'Annuler')
          : h('span', { class: 'small muted' }, 'à jeun'),
      ),
      h('div', { class: 'row' },
        iconCircle(ICON.scale),
        input,
        h('span', { class: 'muted' }, 'kg'),
        h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Enregistrer'),
      ),
    );
  }

  const w = day.weight as number;
  const pts = store.weights().filter((pt) => pt.date <= date);
  const ma = movingAverage(pts);
  const avg = ma.length ? ma[ma.length - 1].avg : w;
  const gap = avg - plannedWeight(date, p);
  // Pregnancy, late period: no "ahead/behind" judgement.
  const cs = cycleSettings(p);
  const info = cs.tracking && !cs.pregnant ? cycleOn(date, p, store.state.days) : null;
  const neutral = cs.pregnant || info?.phase === 'retard';
  let status: { text: string; tone: string };
  if (neutral) status = { text: 'pour info', tone: 'accent' };
  else if (gap <= -0.3) status = { text: 'en avance', tone: 'good' };
  else if (gap <= 0.3) status = { text: 'sur la courbe', tone: 'accent' };
  else status = { text: 'un peu au-dessus', tone: 'warn' };

  return h('section', { class: 'card ux solo dc-weigh' },
    infoRow({
      icon: ICON.scale,
      title: h('span', { class: 'num' }, `${fmtKg(w)} kg ce matin`),
      detail: `moyenne 7 j : ${fmtKg(avg)} kg`,
      trail: h('span', { class: `chip ${status.tone}` }, status.text),
    }),
    h('div', { class: 'row between' },
      h('button', { class: 'dc-link', type: 'button', onclick: () => { editWeight = true; rerender(ctx); } }, 'Corriger'),
      h('button', { class: 'dc-link', type: 'button', onclick: () => ctx.go('weight') }, 'Voir ma courbe ›'),
    ),
  );
}

// ---------- the session ----------

function logWorkout(date: string, w: Omit<Workout, 'id'>, msg?: string) {
  void store.updateDay(date, (d) => { d.workouts.push({ id: uid(), ...w }); });
  if (msg) toast(msg);
}

/** TA SÉANCE. In the evening (`late`), a session not done yet stays discreet: "Je l'ai faite". */
function sessionCard(date: string, ctx: ScreenCtx, late = false): HTMLElement {
  const p = store.profile;
  const day = store.getDay(date);
  const sessions = adaptedSessionsOn(date, p, store.state.days);
  const recovery = recoveryFlag(date, store.state.days);
  const card = h('section', { class: 'card ux dc-session' });

  if (!sessions.length) {
    const moved = day.workouts.length > 0;
    card.append(
      infoRow({
        icon: moved ? ICON.spark : ICON.leaf,
        title: moved ? 'Tu as bougé aujourd’hui' : 'Jour off',
        detail: moved ? 'Bien joué.' : 'Une marche de 20 min compte aussi.',
      }),
    );
    if (!moved) card.append(h('button', { class: 'btn block', type: 'button', style: 'min-height:50px', onclick: () => ctx.go('training') }, 'J’ai bougé'));
  } else {
    for (const a of sessions) card.append(sessionBlock(date, a.session, day.workouts, ctx, a.note, recovery.low, late));
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
              class: 'btn sm', type: 'button',
              onclick: () => logWorkout(date, { sport: 'basket' as Sport, minutes: 90 }),
            }, 'Fait (90 min)'),
          }),
    );
  }

  card.append(
    h('p', { class: 'small muted', style: 'text-align:center' }, weekLine(date)),
    actionLink('Voir mon programme', () => ctx.go('training')),
  );
  return card;
}

function sessionBlock(date: string, s: PlannedSession, workouts: Workout[], ctx: ScreenCtx, note?: string, lowRecovery = false, late = false): HTMLElement {
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

  const markDoneFull = () => { miniOpen.delete(s.id); logWorkout(date, { sport: s.sport, minutes: s.minutes, plannedId: s.id, mini: false }); };
  const markMini = () => { miniOpen.delete(s.id); logWorkout(date, { sport: s.sport, minutes: 15, plannedId: s.id, mini: true }); };

  if (late) {
    // Evening: no big "C'est fait" any more; tomorrow is announced in the summary / Demain card.
    return h('div', { class: 'td-sess' },
      infoRow({ icon: SPORT_GLYPH[s.sport] ?? '··', title: s.title, detail: `${s.minutes} min · pas faite aujourd’hui, ce n’est pas grave` }),
      h('div', { class: 'row between' },
        h('button', { class: 'dc-link', type: 'button', onclick: markDoneFull }, 'Je l’ai faite'),
        s.mini ? h('button', { class: 'dc-link', type: 'button', onclick: markMini }, 'J’ai fait la mini') : null,
      ),
    );
  }

  const open = miniOpen.has(s.id);
  // Low recovery: the mini comes first (the recovery itself is shown once, in the cycle hero).
  const miniFirst = lowRecovery && !!s.mini;
  const doneBtn = h('button', { class: 'btn block' + (miniFirst ? '' : ' primary'), type: 'button', onclick: markDoneFull }, 'C’est fait');
  const miniBtn = s.mini
    ? h('button', {
        class: 'btn block' + (miniFirst && !open ? ' primary' : ''), type: 'button',
        onclick: () => {
          if (open) miniOpen.delete(s.id); else miniOpen.add(s.id);
          rerender(ctx);
        },
      }, open ? 'Replier la mini' : 'Version mini')
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
    s.why ? h('p', { class: 'small muted' }, s.why) : null,
    note ? h('p', { class: 'small td-note' }, note) : null,
    open && s.mini
      ? h('div', { class: 'td-mini-box' },
          h('div', { class: 'eyebrow' }, 'Version mini · 15 min'),
          h('p', { class: 'small' }, s.mini),
          h('button', { class: 'btn primary block', type: 'button', onclick: markMini }, 'Mini faite'),
        )
      : null,
    h('div', { class: 'td-actions' + (miniBtn && !open ? ' dc-two' : '') }, miniFirst && miniBtn ? [miniBtn, doneBtn] : [doneBtn, miniBtn]),
    disclosure('Détail de la séance', () => [
      h('p', { class: 'small muted' }, SPORT_LABEL[s.sport] ?? ''),
      h('p', { class: 'small' }, s.details),
    ], `td-sess-${s.id}`, 'Replier'),
  );
}

/** Activities (anything moved) and the plan's sessions done this week: one honest definition. */
function weekCounts(date: string) {
  const p = store.profile;
  const mon = mondayOf(date);
  let activities = 0, planned = 0, planDone = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    const ws = store.getDay(d).workouts;
    activities += ws.length;
    for (const a of adaptedSessionsOn(d, p, store.state.days)) {
      if (a.session.optional) continue;
      planned++;
      if (ws.some((w) => w.plannedId === a.session.id)) planDone++;
    }
  }
  return { activities, planned, planDone };
}

function weekLine(date: string): string {
  const { activities, planned, planDone } = weekCounts(date);
  const act = activities === 0 ? 'Aucune activité encore' : `${activities} activité${activities > 1 ? 's' : ''}`;
  return planned ? `Ta semaine : ${act.toLowerCase()} · ${planDone}/${planned} séances du plan` : `Ta semaine : ${act.toLowerCase()}`;
}

// ---------- tomorrow ----------

function tomorrowCard(date: string, ctx: ScreenCtx): HTMLElement {
  const p = store.profile;
  const d1 = addDays(date, 1);
  const cs = cycleSettings(p);
  const info = cs.tracking && !cs.pregnant ? cycleOn(d1, p, store.state.days) : null;
  const g = info ? guideSafe(d1, { moment: 'matin' }) : null;
  const sessions = adaptedSessionsOn(d1, p, store.state.days);
  const main = sessions.find((a) => !a.session.optional)?.session ?? sessions[0]?.session;
  const basket = p.basketDays.includes(weekday(d1));
  return h('section', { class: 'card ux dc-tomorrow' },
    h('span', { class: 'eyebrow' }, 'Demain'),
    info
      ? infoRow({
          icon: ICON.cycle,
          title: info.phase === 'retard' ? phaseLabel(info.phase) : `J${info.day} · ${phaseLabel(info.phase)}`,
          detail: g?.meaning ?? undefined,
        })
      : null,
    main
      ? infoRow({ icon: SPORT_GLYPH[main.sport] ?? '··', title: main.title, detail: `${main.minutes} min · ${main.intensity}${main.mini ? ' · version mini possible' : ''}`, onClick: () => ctx.go('training') })
      : infoRow({ icon: ICON.leaf, title: 'Jour off', detail: 'Une marche de 20 min compte aussi.' }),
    basket ? infoRow({ icon: SPORT_GLYPH.basket, title: 'Basket', detail: 'Pense à prendre tes affaires.' }) : null,
  );
}

// ---------- footer ----------

function quoteBand(date: string): HTMLElement {
  const q = quoteFor(date);
  return h('section', { class: 'td-quote-band paper', 'aria-label': 'Citation du jour' },
    clipSticker('td-clip'),
    h('p', { class: 'quote' }, q.text),
    q.author ? h('p', { class: 'quote-author' }, q.author) : null,
  );
}

/** Backup nudge at most once a week (and all that day once shown), as a quiet line. */
function nudgeDue(date: string): boolean {
  if (!backupReminderDue()) return false;
  let last: string | null = null;
  try { last = localStorage.getItem(NUDGE_KEY); } catch { /* ignore */ }
  if (last === date) return true;
  if (last && daysBetween(last, date) < 7) return false;
  try { localStorage.setItem(NUDGE_KEY, date); } catch { /* ignore */ }
  return true;
}

function footer(date: string, moment: Moment, ctx: ScreenCtx): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (nudgeDue(date)) {
    out.push(h('button', { class: 'dc-foot-link', type: 'button', onclick: () => ctx.go('settings') },
      'Pense à activer la sauvegarde automatique ›'));
  }
  return out;
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
