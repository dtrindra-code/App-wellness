// "Aujourd'hui" (direction B "Évoluer"): a coach that walks the day with her.
// Above the fold, in this order: header (beads signature · Bonjour · date · J−N) → quote band
// → TON CYCLE as one row → the coach card (the one pink block, mood in one tap) → the ink
// "Revenir à moi" entry card. Below: the current moment first as hairline rows
// (CE MATIN · 3 petites choses / TA JOURNÉE / CE SOIR), the next moment as a one-line
// preview, past moments folded under "Plus tôt aujourd'hui".
// Open/closed state is kept per moment and per day (`td-m-${moment}-${date}`).

import type { Screen, ScreenCtx } from './types';
import type { PlannedSession, Sport, Workout } from '../types';
import { store, uid } from '../store';
import {
  h, gearIcon, beads, toast, fmtKg, fmtInt, parseNum,
  sectionTitle, infoRow, iconCircle, checkRow, rowList, haptic, ICON, SPORT_LABEL,
} from '../lib/ui';
import { today, addDays, daysBetween, fmtLong, weekday } from '../lib/dates';
import { bmr, movingAverage, plannedWeight, workoutKcal } from '../lib/nutrition';
import { adaptedSessionsOn } from '../data/plan';
import { cycleOn, cycleSettings, phaseLabel } from '../lib/cycle';
import { recoveryFlag, habitScore, HABITS } from '../lib/habits';
import { MOOD_LABELS } from '../lib/coach';
import { momentAt } from '../lib/cycle-guide';
import { quoteFor } from '../data/quotes';
import { openOnboarding } from './onboarding';
import { coachDayCard, weeklyBilanLines } from './coach';
import { backupReminderDue } from '../lib/sync';
import { budgetOn, breathingRow, cycleHero, guideSafe, plateRow, recoveryRow, regulateRows } from './today-guide';
import type { Moment } from './today-guide';
import { journeyEntryCard, journeyMorningSummary, journeyRulesRows } from './journey';
import { journeyDay, dayScore } from '../lib/journey';

// ---------- transient UI state ----------
/** Planned session ids whose "version mini" is unfolded. */
const miniOpen = new Set<string>();
/** True while re-entering today's weight. */
let editWeight = false;
/** Moments opened / folded by hand, by `td-m-${moment}-${date}` (the default changes every day). */
const momentOpen = new Map<string, boolean>();

const MOMENTS: Moment[] = ['matin', 'journee', 'soir'];
const MOMENT_TITLE: Record<Moment, string> = { matin: 'Ce matin · 3 petites choses', journee: 'Ta journée', soir: 'Ce soir' };
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
  if (p.onboarded) {
    const bilan = moment === 'soir' ? weeklyBilanLines(date) : null;
    root.append(coachDayCard(date, {
      moment,
      // No cycle row (tracking off): the recovery line moves into the coach card.
      extra: hero ? null : recoveryRow(date),
      bilan,
      bilanShown: !!bilan,
      rerender: () => rerender(ctx),
    }));
    const entry = journeyEntryCard(date);
    if (entry) root.append(entry);
  }

  // The current moment first, then what comes next; past moments fold under "Plus tôt".
  const idx = MOMENTS.indexOf(moment);
  for (const m of MOMENTS.slice(idx)) {
    root.append(...momentBlock(m, moment, date, ctx));
    // Sport stays in view all day (it used to fold away with "Ta journée" in the evening).
    if (m === moment && p.onboarded) root.append(...sportBlock(date, ctx));
  }
  const past = MOMENTS.slice(0, idx);
  if (past.length) {
    root.append(sectionTitle('Plus tôt aujourd’hui'));
    for (const m of past) root.append(...momentBlock(m, moment, date, ctx, true));
  }
  root.append(...footer(date, ctx));
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
  return h('header', { class: 'screen-head td-head' },
    h('div', { class: 'stack', style: 'gap:0' },
      beads('Aujourd’hui', [0]),
      h('h1', { class: 'screen-title td-hello' }, h('span', { class: 'sr-only' }, 'Aujourd’hui · '), nowHour() < 18 ? 'Bonjour' : 'Bonsoir'),
      h('p', { class: 'subtitle italic' }, fmtLong(date), cd ? h('span', { class: 'dc-cd' }, ` · ${cd}`) : null),
    ),
    h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Réglages', style: 'background:none', onclick: () => ctx.go('settings') }, gearIcon()),
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

function momentBlock(m: Moment, current: Moment, date: string, ctx: ScreenCtx, past = false): HTMLElement[] {
  const { open, byDefault } = isOpen(m, current, date);
  const title = past ? null : sectionTitle(m === current || m !== 'soir' ? MOMENT_TITLE[m] : 'Ce soir');
  title?.classList.add('dc-sec', `dc-sec-${m}`);
  if (!open) {
    const row = h('button', {
      class: 'card ux dc-sum', type: 'button', 'aria-expanded': 'false',
      onclick: () => setOpen(m, date, true, ctx),
    },
      iconCircle(m === 'matin' ? ICON.sun : m === 'journee' ? ICON.fork : ICON.moon),
      h('span', { class: 'dc-sum-text' }, summary(m, current, date)),
      h('span', { class: 'dc-sum-chev', 'aria-hidden': 'true' }, '⌄'));
    return title ? [title, row] : [row];
  }
  const body = momentContent(m, current, date, ctx);
  const fold = byDefault ? null : h('button', { class: 'dc-fold', type: 'button', 'aria-expanded': 'true', onclick: () => setOpen(m, date, false, ctx) }, 'Replier');
  const head = past ? sectionTitle(MOMENT_TITLE[m]) : title;
  head?.classList.add('dc-sec', `dc-sec-${m}`);
  return [...(head ? [head] : []), ...body, ...(fold ? [fold] : [])];
}

function momentContent(m: Moment, current: Moment, date: string, ctx: ScreenCtx): HTMLElement[] {
  const rows: (HTMLElement | null)[] = [];
  // The journal engagements get their own block: one block, one job.
  let rules: HTMLElement | null = null;
  if (m === 'matin') {
    rows.push(weighRow(date, ctx));
    rows.push(...regulateRows(date, 'matin', guideSafe(date, { moment: 'matin' }), 2));
    rows.push(breathingRow(date));
  } else if (m === 'journee') {
    // In the evening the plate lives in CE SOIR (the dinner): no second copy here.
    if (current !== 'soir') rows.push(plateRow(date, 'journee', ctx));
    // The engagements live here until the evening, then move to CE SOIR.
    if (current !== 'soir') rules = journeyRulesRows(date);
    if (current === 'journee') {
      rows.push(...regulateRows(date, 'journee', guideSafe(date, { moment: 'journee' }), 2));
      rows.push(breathingRow(date));
    }
  } else {
    rules = journeyRulesRows(date);
    rows.push(plateRow(date, 'soir', ctx));
    rows.push(...regulateRows(date, 'soir', guideSafe(date, { moment: 'soir' }), 3));
    rows.push(breathingRow(date));
    rows.push(tomorrowRow(date, ctx));
  }
  const block = h('section', { class: 'card ux dc-moment' }, rowList(...rows));
  if (!rules) return [block];
  const rulesBlock = h('section', { class: 'card ux dc-moment dc-rules' }, rules);
  return m === 'soir' ? [rulesBlock, block] : [block, rulesBlock];
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

function weightStatus(date: string, avg: number): { text: string; tone: string } {
  const p = store.profile;
  const gap = avg - plannedWeight(date, p);
  // Pregnancy, late period: no "ahead/behind" judgement.
  const cs = cycleSettings(p);
  const info = cs.tracking && !cs.pregnant ? cycleOn(date, p, store.state.days) : null;
  if (cs.pregnant || info?.phase === 'retard') return { text: 'pour info', tone: 'wash' };
  if (gap <= -0.3) return { text: 'en avance', tone: 'sage' };
  if (gap <= 0.3) return { text: 'sur la courbe', tone: 'wash' };
  return { text: 'un peu au-dessus', tone: 'wash' };
}

function avgOn(date: string): number | undefined {
  const pts = store.weights().filter((pt) => pt.date <= date);
  const ma = movingAverage(pts);
  return ma.length ? ma[ma.length - 1].avg : undefined;
}

/** Weigh-in: an inline field + "OK" until logged, then one line (with "Corriger"). */
function weighRow(date: string, ctx: ScreenCtx): HTMLElement {
  const day = store.getDay(date);
  const logged = typeof day.weight === 'number';

  if (!logged || editWeight) {
    const before = day.weight;
    const last = store.weightOn(addDays(date, -1));
    const input = h('input', {
      class: 'input num',
      type: 'text',
      inputMode: 'decimal',
      enterKeyHint: 'done',
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
      const kg = Math.round(v * 10) / 10;
      editWeight = false;
      input.blur();
      void store.updateDay(date, (d) => { d.weight = kg; }).then(() => {
        const avg = avgOn(date);
        toast(`${fmtKg(kg)} kg noté${avg !== undefined ? ` · moyenne 7 j ${fmtKg(avg)}` : ''}`, {
          action: { label: 'Annuler', run: () => { void store.updateDay(date, (d) => { if (before === undefined) delete d.weight; else d.weight = before; }); } },
        });
      });
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    return h('div', { class: 'dc-weigh-row dc-weigh' },
      iconCircle(ICON.scale),
      h('span', { class: 'info-main' },
        h('span', { class: 'info-title' }, 'Pesée'),
        h('span', { class: 'info-detail' }, editWeight ? h('button', { class: 'dc-link', style: 'min-height:0;padding:0', type: 'button', onclick: () => { editWeight = false; rerender(ctx); } }, 'Annuler') : 'à jeun')),
      input,
      h('span', { class: 'muted small' }, 'kg'),
      h('button', { class: 'btn sm primary', type: 'button', onclick: save }, 'OK'),
    );
  }

  const w = day.weight as number;
  const avg = avgOn(date) ?? w;
  const status = weightStatus(date, avg);
  return h('div', { class: 'dc-weigh-row dc-weigh' },
    iconCircle(ICON.scale),
    h('button', { class: 'info-main', type: 'button', style: 'background:none;border:0;padding:0;font:inherit;color:inherit;text-align:left;cursor:pointer', onclick: () => ctx.go('weight') },
      h('span', { class: 'info-title num' }, `${fmtKg(w)} kg ce matin`),
      h('span', { class: 'info-detail' }, h('span', { class: `chip ${status.tone}` }, status.text), ` moyenne 7 j ${fmtKg(avg)}`)),
    h('button', { class: 'dc-link', type: 'button', onclick: () => { editWeight = true; rerender(ctx); } }, 'Corriger'),
  );
}

// ---------- the session ----------

function logWorkout(date: string, w: Omit<Workout, 'id'>, msg?: string) {
  const id = uid();
  void store.updateDay(date, (d) => { d.workouts.push({ id, ...w }); });
  if (msg) {
    toast(msg, { action: { label: 'Annuler', run: () => { void store.updateDay(date, (d) => { d.workouts = d.workouts.filter((x) => x.id !== id); }); } } });
  }
}

function unlog(date: string, pred: (w: Workout) => boolean) {
  void store.updateDay(date, (d) => { d.workouts = d.workouts.filter((w) => !pred(w)); });
}

/** The day's sessions as check rows: one tap on the circle = done (toast with "Annuler"). */
function sessionRows(date: string, ctx: ScreenCtx): HTMLElement[] {
  const p = store.profile;
  const day = store.getDay(date);
  const sessions = adaptedSessionsOn(date, p, store.state.days);
  const recovery = recoveryFlag(date, store.state.days);
  const out: HTMLElement[] = [];

  if (!sessions.length) {
    // Whatever she did is listed below it (sportBlock): "Jour off" only on an empty day.
    if (!day.workouts.length && !p.basketDays.includes(weekday(date))) {
      out.push(infoRow({ icon: ICON.leaf, title: 'Jour off', detail: 'Une marche de 20 min compte aussi.', onClick: () => ctx.go('training') }));
    }
  } else {
    for (const a of sessions) out.push(sessionRow(date, a.session, day.workouts, ctx, a.note, recovery.low));
  }

  if (p.basketDays.includes(weekday(date))) {
    const bw = day.workouts.find((w) => w.sport === 'basket');
    const done = !!bw;
    const weight = store.weightOn(date);
    const detail = bw
      ? workoutLine(bw, weight)
      : `90 min · pense à le noter · environ +${fmtInt(bonusOf({ id: '', sport: 'basket', minutes: 90 }, weight))} kcal à ton budget`;
    out.push(checkRow({
      title: 'Basket', detail, on: done, label: 'Basket fait',
      onToggle: () => done ? unlog(date, (w) => w.sport === 'basket') : logWorkout(date, { sport: 'basket' as Sport, minutes: 90 }, 'Basket noté'),
    }));
  }
  return out;
}

function sessionRow(date: string, s: PlannedSession, workouts: Workout[], ctx: ScreenCtx, note?: string, lowRecovery = false): HTMLElement {
  const done = workouts.find((w) => w.plannedId === s.id);
  const markFull = () => { miniOpen.delete(s.id); logWorkout(date, { sport: s.sport, minutes: s.minutes, plannedId: s.id, mini: false }, 'Séance notée'); };
  const markMini = () => { miniOpen.delete(s.id); logWorkout(date, { sport: s.sport, minutes: 15, plannedId: s.id, mini: true }, 'Version mini notée'); };
  const detail = done
    ? (done.mini ? `Version mini faite · ${workoutLine(done, store.weightOn(date))}` : `Faite · ${workoutLine(done, store.weightOn(date))}`)
    : [`${s.minutes} min · ${s.intensity}`, s.optional ? 'optionnelle' : null, lowRecovery && s.mini ? 'récup basse : la mini suffit' : note ?? null].filter(Boolean).join(' · ');
  const row = checkRow({
    title: s.title, detail, on: !!done, label: `${s.title} faite`, cls: 'dc-sess-row',
    onToggle: () => done ? unlog(date, (w) => w.plannedId === s.id) : markFull(),
    onOpen: () => ctx.go('training'),
  });
  if (done || !s.mini) return row;
  const open = miniOpen.has(s.id);
  return h('div', { class: 'dc-sess' },
    row,
    open
      ? h('div', { class: 'dc-mini-note' },
          h('p', { class: 'small' }, s.mini),
          h('div', { class: 'row', style: 'gap:16px' },
            h('button', { class: 'dc-link', type: 'button', onclick: markMini }, 'Mini faite'),
            h('button', { class: 'dc-link', type: 'button', onclick: () => { miniOpen.delete(s.id); rerender(ctx); } }, 'Replier')))
      : h('div', { class: 'dc-sess-links' },
          h('button', { class: 'dc-link', type: 'button', onclick: (e: Event) => { haptic(e.currentTarget as Element); miniOpen.add(s.id); rerender(ctx); } }, 'Version mini · 15 min')),
  );
}

// ---------- sport block ----------

/** Half of the burn goes back to the plate (lib/nutrition targets). */
function bonusOf(w: Workout, weight: number): number {
  return Math.round((workoutKcal(w, weight, bmr(store.profile, weight)) * 0.5) / 10) * 10;
}

/** "92 min · 610 kcal · FC 142 · Garmin" */
function workoutLine(w: Workout, weight: number): string {
  const kcal = w.calories && w.calories > 0 ? w.calories : workoutKcal(w, weight);
  return [
    w.time ? `à ${w.time.replace(':', ' h ')}` : null,
    `${fmtInt(w.minutes)} min`,
    w.distanceKm ? `${String(w.distanceKm).replace('.', ',')} km` : null,
    `${fmtInt(kcal)} kcal${w.calories ? '' : ' (estimé)'}`,
    w.avgHr ? `FC ${w.avgHr}` : null,
    w.source === 'garmin' || w.garminId ? 'Garmin' : null,
  ].filter(Boolean).join(' · ');
}

/** TON SPORT: the planned sessions, basket, and everything else she did (Garmin or by hand). */
function sportBlock(date: string, ctx: ScreenCtx): HTMLElement[] {
  const day = store.getDay(date);
  const weight = store.weightOn(date);
  const planned = new Set(adaptedSessionsOn(date, store.profile, store.state.days).map((a) => a.session.id));
  const basketDay = store.profile.basketDays.includes(weekday(date));
  const rows: HTMLElement[] = sessionRows(date, ctx);
  // Done but not shown above: unplanned workouts (a walk, a ride…), a second basket.
  let basketShown = false;
  for (const w of day.workouts) {
    if (w.plannedId && planned.has(w.plannedId)) continue;
    if (w.sport === 'basket' && basketDay && !basketShown) { basketShown = true; continue; }
    rows.push(infoRow({
      icon: ICON.spark, title: SPORT_LABEL[w.sport] ?? 'Activité', detail: workoutLine(w, weight),
      onClick: () => ctx.go('training'),
    }));
  }
  const { t } = budgetOn(date);
  const foot = t.sportBonus > 0
    ? h('p', { class: 'dc-sport-foot small' }, `Ton sport ajoute `, h('strong', { class: 'num' }, `+${fmtInt(t.sportBonus)} kcal`), ` à ton budget repas.`)
    : null;
  return [
    sectionTitle('Ton sport'),
    h('section', { class: 'card ux dc-moment dc-sport' }, rowList(...rows), foot),
  ];
}

// ---------- tomorrow ----------

/** "Demain" as one line: cycle day and the main session. */
function tomorrowRow(date: string, ctx: ScreenCtx): HTMLElement {
  const p = store.profile;
  const d1 = addDays(date, 1);
  const cs = cycleSettings(p);
  const info = cs.tracking && !cs.pregnant ? cycleOn(d1, p, store.state.days) : null;
  const sessions = adaptedSessionsOn(d1, p, store.state.days);
  const main = sessions.find((a) => !a.session.optional)?.session ?? sessions[0]?.session;
  const basket = p.basketDays.includes(weekday(d1));
  const parts = [
    info ? (info.phase === 'retard' ? phaseLabel(info.phase) : `J${info.day} · ${phaseLabel(info.phase).replace(/^Phase /, '')}`) : null,
    main ? `${main.title} ${main.minutes} min` : 'jour off',
    basket ? 'basket' : null,
  ].filter(Boolean);
  return infoRow({ icon: ICON.flag, title: 'Demain', detail: parts.join(' · '), onClick: () => ctx.go('training') });
}

// ---------- footer ----------

function quoteBand(date: string): HTMLElement {
  const q = quoteFor(date);
  return h('section', { class: 'td-quote-band', 'aria-label': 'Citation du jour' },
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

function footer(date: string, ctx: ScreenCtx): HTMLElement[] {
  const hb = store.getDay(date).habits ?? {};
  const done = HABITS.filter((x) => hb[x.key]).length;
  const out: HTMLElement[] = [
    h('button', { class: 'card ux dc-pillars-link', type: 'button', onclick: () => ctx.go('balance') },
      h('span', null, 'Tous mes piliers'),
      h('span', { class: 'num' }, `${done}/${HABITS.length} ›`)),
  ];
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
