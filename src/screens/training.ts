// "Sport" screen, in sections: TA SEMAINE (sessions bubble, one info row per session, "Noter une
// séance" prominent) · TA RÉGULARITÉ (details folded) · TA SAISON (timeline folded).

import type { Screen } from './types';
import type { PlannedSession, Sport, Workout } from '../types';
import { store, uid } from '../store';
import {
  h, screenTitle, openSheet, toast, field, bar, parseNum, fmtInt, SPORT_LABEL, SPORT_GLYPH,
  sectionTitle, infoRow, disclosure, keyBubble, ICON,
} from '../lib/ui';
import type { Sheet } from '../lib/ui';
import { addDays, fmtDayMonth, fmtShort, mondayOf, range, today } from '../lib/dates';
import { PHASE_SHORT, adaptSession, blockOn, planDay, season, sessionCapOn, weekOf, weekSummary } from '../data/plan';
import { phaseLabel } from '../lib/cycle';

// ---------- transient UI state ----------
let weekOffset = 0;

// ---------- helpers ----------

const SPORTS: Sport[] = ['basket', 'swim', 'bike', 'run', 'strength', 'walk', 'mobility', 'other'];
const SHORT_LABEL: Record<Sport, string> = {
  basket: 'Basket', swim: 'Natation', bike: 'Vélo', run: 'Course', strength: 'Renfo', walk: 'Marche', mobility: 'Mobilité', other: 'Autre',
};
const WITH_DISTANCE: Sport[] = ['swim', 'bike', 'run', 'walk'];

interface LoggedWorkout { date: string; w: Workout }

/** Session adapted to the cycle cap of its day, with the note if lowered. */
function adapted(s: PlannedSession): { session: PlannedSession; note?: string } {
  const { cap, reason } = sessionCapOn(s.date, store.profile, store.state.days);
  return adaptSession(s, cap, reason);
}

function workoutsBetween(from: string, to: string): LoggedWorkout[] {
  const out: LoggedWorkout[] = [];
  for (const [date, d] of Object.entries(store.state.days)) {
    if (date < from || date > to) continue;
    for (const w of d.workouts ?? []) out.push({ date, w });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const fmtMin = (m: number) => {
  if (m < 60) return `${fmtInt(m)} min`;
  const hh = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return `${hh} h${mm ? String(mm).padStart(2, '0') : ''}`;
};
const fmtKm = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

function intensityChip(s: PlannedSession): HTMLElement {
  const tone = s.intensity === 'soutenu' ? ' warn' : s.intensity === 'modéré' ? ' accent' : '';
  return h('span', { class: 'chip' + tone }, s.intensity);
}

function workoutSub(w: Workout): string {
  const parts = [fmtMin(w.minutes)];
  if (w.distanceKm) parts.push(`${fmtKm(w.distanceKm)} km`);
  if (w.steps) parts.push(`${w.steps.toLocaleString('fr-FR')} pas`);
  if (w.rpe) parts.push(`effort ${w.rpe}/10`);
  if (w.avgHr) parts.push(`FC ${w.avgHr}`);
  if (w.garminId) parts.push('Garmin');
  return parts.join(' · ');
}

// ---------- screen ----------

export const renderTraining: Screen = (root) => {
  const t = today();
  const viewMonday = addDays(mondayOf(t), 7 * weekOffset);

  root.append(
    header(t),
    sectionTitle('Ta semaine'),
    weekCard(viewMonday, t),
    sectionTitle('Ta régularité'),
    consistencyCard(t),
    sectionTitle('Ta saison'),
    seasonCard(t),
  );
};

function header(t: string): HTMLElement {
  const p = store.profile;
  let eyebrow: string;
  if (t < p.startDate) eyebrow = `Départ le ${fmtDayMonth(p.startDate)}`;
  else if (t > p.raceDate) eyebrow = 'Après la course';
  else {
    const w = weekOf(t, p, store.state.days);
    const b = blockOn(t, p);
    eyebrow = [w ? `Semaine ${w.index}` : null, b?.name].filter(Boolean).join(' · ');
  }
  return h('header', { class: 'screen-head' },
    h('div', { class: 'stack', style: 'gap:6px' }, screenTitle('Sport'), eyebrow ? h('p', { class: 'subtitle' }, eyebrow) : null),
  );
}

// ---------- week ----------

function weekCard(mon: string, t: string): HTMLElement {
  const p = store.profile;
  const sun = addDays(mon, 6);
  const days = store.state.days;
  const week = weekOf(mon, p, days);
  const block = blockOn(mon < p.startDate ? p.startDate : mon, p) ?? blockOn(sun, p);
  const planned = week?.sessions ?? [];
  const logged = workoutsBetween(mon, sun);
  const byPlan = new Map<string, LoggedWorkout>();
  for (const l of logged) if (l.w.plannedId && !byPlan.has(l.w.plannedId)) byPlan.set(l.w.plannedId, l);

  const required = planned.filter((s) => !s.optional);
  const plannedMin = required.reduce((a, s) => a + s.minutes, 0);
  const doneMin = logged.reduce((a, l) => a + l.w.minutes, 0);
  const doneReq = required.filter((s) => byPlan.has(s.id)).length;

  const label = weekOffset === 0 ? 'Cette semaine' : weekOffset === -1 ? 'Semaine dernière' : weekOffset === 1 ? 'Semaine prochaine' : week ? `Semaine ${week.index}` : 'Semaine';
  const nav = h('div', { class: 'day-nav' },
    h('button', { class: 'btn-icon', 'aria-label': 'Semaine précédente', onclick: () => { weekOffset--; redraw(); } }, '‹'),
    h('div', { class: 'label' },
      h('div', null, label),
      h('div', { class: 'small muted', style: 'font-weight:400' },
        `${fmtDayMonth(mon)} – ${fmtDayMonth(sun)}${block && weekOffset !== 0 ? ` · ${block.name}` : ''}`),
    ),
    h('button', { class: 'btn-icon', 'aria-label': 'Semaine suivante', onclick: () => { weekOffset++; redraw(); } }, '›'),
  );

  const card = h('section', { class: 'card ux solo' }, nav);
  // Week browsing is local UI state: swap this card in place (no store write, no scroll jump).
  function redraw() { card.replaceWith(weekCard(addDays(mondayOf(t), 7 * weekOffset), t)); }
  if (week?.focus) card.append(h('p', { class: 'quote', style: 'font-size:1rem' }, week.focus));

  if (plannedMin > 0 || doneMin > 0) {
    const ratio = plannedMin ? doneMin / plannedMin : 1;
    card.append(
      h('div', { class: 'td-energy' },
        required.length
          ? keyBubble(`${doneReq}/${required.length}`, undefined, 'séances')
          : keyBubble(String(logged.length), undefined, logged.length > 1 ? 'séances' : 'séance'),
        h('div', { class: 'td-energy-side' },
          h('div', { class: 'td-mini' },
            h('div', { class: 'td-mini-top' },
              h('span', { style: 'font-weight:700' }, 'Minutes'),
              h('span', { class: 'num muted' }, plannedMin ? `${fmtInt(doneMin)} / ${fmtInt(plannedMin)}` : fmtInt(doneMin)),
            ),
            bar(ratio, ratio >= 1 ? 'good' : 'accent'),
          ),
          h('p', { class: 'small muted' }, doneReq >= required.length && required.length ? 'Semaine bouclée. Bravo.' : 'La version mini compte aussi.'),
        ),
      ),
    );
  }
  card.append(h('button', { class: 'btn primary block sp-big', type: 'button', onclick: () => openLogSheet({ date: t }) }, 'Noter une séance'));

  const represented = new Set<LoggedWorkout>();
  for (const s of planned) { const l = byPlan.get(s.id); if (l) represented.add(l); }
  if (week && planned.length) {
    const cycleKnown = range(mon, sun).some((d) => planDay(d, p, days).phase);
    card.append(h('p', { class: 'small sp-summary' },
      `${label} : ${weekSummary(week, p, days)}`,
      cycleKnown ? h('span', { class: 'muted' }, ' · phases estimées') : null));
  }
  const list = h('div', { class: 'sp-days' });
  for (const date of range(mon, sun)) {
    const items: HTMLElement[] = [];
    for (const s of planned.filter((x) => x.date === date)) items.push(plannedRow(s, byPlan.get(s.id)));
    for (const l of logged) if (l.date === date && !represented.has(l)) items.push(workoutRow(l));
    const isToday = date === t;
    const dayLabel = h('div', { class: 'sp-day' + (isToday ? ' today' : '') }, h('span', null, isToday ? `Aujourd’hui · ${fmtShort(date)}` : fmtShort(date)));
    const pd = planDay(date, p, days);
    if (pd.phase) {
      dayLabel.append(h('span', { class: 'sp-phase sp-ph-' + pd.phase, title: phaseLabel(pd.phase), 'aria-label': phaseLabel(pd.phase) }, PHASE_SHORT[pd.phase]));
    }
    if (pd.noSwim) dayLabel.append(h('span', { class: 'sp-noswim', title: 'Pas de piscine autour des règles' }, 'piscine off'));
    if (pd.basket || !items.length) dayLabel.append(h('span', { class: 'sp-rest' }, pd.basket ? 'basket' : 'repos'));
    if (!items.length) {
      list.append(dayLabel);
    } else {
      list.append(dayLabel, ...items);
    }
  }
  if (!planned.length && !logged.length) {
    card.append(h('p', { class: 'empty' }, mon > p.raceDate ? 'Après la course : repos bien mérité.' : 'Rien de prévu cette semaine.'));
  }
  card.append(list);
  return card;
}

function plannedRow(orig: PlannedSession, done: LoggedWorkout | undefined): HTMLElement {
  const { session: s, note } = adapted(orig);
  const sub = done
    ? done.w.mini ? `Version mini faite · ${fmtMin(done.w.minutes)}` : `Faite · ${fmtMin(done.w.minutes)}`
    : `${fmtMin(s.minutes)} · ${s.intensity}${s.key ? ' · séance clé' : ''}${s.optional ? ' · optionnelle' : ''}`;
  return infoRow({
    icon: SPORT_GLYPH[s.sport] ?? '··',
    title: s.title,
    detail: note && !done ? [sub, h('span', { class: 'sp-note', style: 'display:block' }, note)] : sub,
    onClick: () => openSessionSheet(s),
    cls: done ? 'td-done' : '',
  });
}

function workoutRow(l: LoggedWorkout): HTMLElement {
  return infoRow({
    icon: SPORT_GLYPH[l.w.sport] ?? '··',
    title: SPORT_LABEL[l.w.sport] ?? 'Séance',
    detail: workoutSub(l.w) + (l.w.mini ? ' · mini' : ''),
    onClick: () => openWorkoutSheet(l),
    cls: 'td-done',
  });
}

// ---------- sheets ----------

function findLogged(plannedId: string, around: string): LoggedWorkout | undefined {
  const mon = mondayOf(around);
  return workoutsBetween(mon, addDays(mon, 6)).find((l) => l.w.plannedId === plannedId);
}

function openSessionSheet(orig: PlannedSession) {
  const { session: s, note } = adapted(orig);
  const t = today();
  const done = findLogged(s.id, s.date);
  const logDate = s.date > t ? t : s.date;
  let sheet: Sheet | null = null;

  const body = h('div', { class: 'stack' },
    h('div', { class: 'row wrap', style: 'gap:6px' },
      h('span', { class: 'chip num' }, fmtMin(s.minutes)),
      intensityChip(s),
      s.key ? h('span', { class: 'chip accent' }, 'séance clé') : null,
      s.optional ? h('span', { class: 'chip' }, 'optionnelle') : null,
      h('span', { class: 'small muted' }, `${SPORT_LABEL[s.sport] ?? ''} · ${fmtShort(s.date)}`),
    ),
    s.why ? h('p', { class: 'small sp-why' }, s.why) : null,
    h('p', null, s.details),
    note ? h('p', { class: 'small sp-note' }, note) : null,
    s.mini
      ? h('div', { class: 'card flat', style: 'padding:12px;gap:6px;background:var(--surface-2);border-color:transparent' },
          h('div', { class: 'eyebrow' }, 'Version mini · 15 min'),
          h('p', { class: 'small' }, s.mini),
          h('p', { class: 'small muted' }, 'Faire la mini, ça compte comme fait.'),
        )
      : null,
  );

  if (done) {
    body.append(
      h('div', { class: 'row' },
        h('span', { class: 'glyph done' }, SPORT_GLYPH[s.sport] ?? '··'),
        h('div', { class: 'grow' },
          h('div', { style: 'font-weight:700' }, done.w.mini ? 'Mini faite. Ça compte.' : 'C’est fait. Bravo.'),
          h('div', { class: 'small muted' }, `${fmtShort(done.date)} · ${workoutSub(done.w)}`),
        ),
      ),
      deleteButton(done, () => sheet?.close()),
    );
  } else {
    const go = (prefill: LogPrefill) => { sheet?.close(); setTimeout(() => openLogSheet(prefill), 240); };
    body.append(
      h('div', { class: 'stack', style: 'gap:8px' },
        h('button', { class: 'btn primary block', onclick: () => go({ date: logDate, sport: s.sport, minutes: s.minutes, plannedId: s.id }) }, 'C’est fait'),
        s.mini ? h('button', { class: 'btn block', onclick: () => go({ date: logDate, sport: s.sport, minutes: 15, plannedId: s.id, mini: true }) }, 'Mini faite') : null,
        h('button', { class: 'btn ghost block', onclick: () => go({ date: logDate }) }, 'Autre chose'),
      ),
    );
  }
  sheet = openSheet(s.title, body);
}

function openWorkoutSheet(l: LoggedWorkout) {
  let sheet: Sheet | null = null;
  const w = l.w;
  const body = h('div', { class: 'stack' },
    h('div', { class: 'row' },
      h('span', { class: 'glyph done' }, SPORT_GLYPH[w.sport] ?? '··'),
      h('div', { class: 'grow' },
        h('div', { style: 'font-weight:700' }, fmtShort(l.date)),
        h('div', { class: 'small muted' }, workoutSub(w)),
      ),
      w.mini ? h('span', { class: 'chip accent' }, 'mini') : null,
    ),
    w.note ? h('p', null, w.note) : null,
    deleteButton(l, () => sheet?.close()),
  );
  sheet = openSheet(SPORT_LABEL[w.sport] ?? 'Séance', body);
}

/** Two-tap delete: first tap arms, second tap deletes. */
function deleteButton(l: LoggedWorkout, onDone: () => void): HTMLElement {
  let armed = false;
  let timer: number | undefined;
  const btn = h('button', { class: 'btn danger block', type: 'button' }, 'Supprimer');
  btn.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      btn.textContent = 'Confirmer la suppression';
      btn.classList.add('primary');
      timer = window.setTimeout(() => { armed = false; btn.textContent = 'Supprimer'; btn.classList.remove('primary'); }, 4000);
      return;
    }
    clearTimeout(timer);
    onDone();
    void store.updateDay(l.date, (d) => { d.workouts = d.workouts.filter((x) => x.id !== l.w.id); });
    toast('Séance supprimée');
  });
  return btn;
}

const WITH_STEPS: Sport[] = ['walk', 'run', 'other'];
/** km/h used to estimate a duration from a distance. */
const SPEED: Partial<Record<Sport, number>> = { walk: 5, run: 8, bike: 18, swim: 2 };

/** Minutes estimated from steps (≈100 pas/min en marche, 160 en course) or distance. */
function estimateMinutes(sport: Sport, km?: number, steps?: number): number {
  if (steps) return Math.round(steps / (sport === 'run' ? 160 : 100));
  const v = SPEED[sport];
  if (km && km > 0 && v) return Math.round((km / v) * 60);
  return 0;
}

export interface LogPrefill {
  date?: string;
  sport?: Sport;
  minutes?: number;
  plannedId?: string;
  mini?: boolean;
}

/** Log form in a sheet. Exported so other screens can open it prefilled. */
export function openLogSheet(pre: LogPrefill = {}) {
  const t = today();
  let sport: Sport = pre.sport ?? 'basket';
  let rpe: number | undefined;
  const plannedDate = pre.date;

  const dateIn = h('input', { type: 'date', value: pre.date ?? t, max: t });
  const minIn = h('input', { type: 'text', inputMode: 'numeric', value: pre.minutes ? String(pre.minutes) : sport === 'basket' ? '90' : '', placeholder: '30', autocomplete: 'off' });
  const kmIn = h('input', { type: 'text', inputMode: 'decimal', value: '', placeholder: 'ex. 5', autocomplete: 'off' });
  const stepsIn = h('input', { type: 'text', inputMode: 'numeric', value: '', placeholder: 'ex. 8000', autocomplete: 'off' });
  const noteIn = h('textarea', { placeholder: 'Comment tu t’es senti·e ? (optionnel)' });
  const err = h('p', { class: 'small tone-bad', role: 'alert' });

  const sportWrap = h('div', { class: 'row wrap', style: 'gap:6px' });
  const rpeWrap = h('div', { class: 'row wrap', style: 'gap:6px' });
  const kmField = field('Distance (km)', kmIn);
  const stepsField = field('Pas', stepsIn);
  minIn.placeholder = 'ex. 30';

  const drawSports = () => {
    sportWrap.replaceChildren(...SPORTS.map((sp) =>
      h('button', {
        type: 'button',
        class: 'btn sm' + (sp === sport ? ' primary' : ''),
        'aria-pressed': sp === sport ? 'true' : 'false',
        onclick: () => {
          const wasBasket = sport === 'basket';
          sport = sp;
          if (wasBasket && minIn.value === '90' && !pre.minutes) minIn.value = '';
          if (sp === 'basket' && !minIn.value) minIn.value = '90';
          drawSports();
        },
      }, SHORT_LABEL[sp]),
    ));
    kmField.style.display = WITH_DISTANCE.includes(sport) ? '' : 'none';
    stepsField.style.display = WITH_STEPS.includes(sport) ? '' : 'none';
  };
  const drawRpe = () => {
    rpeWrap.replaceChildren(...Array.from({ length: 10 }, (_, i) => i + 1).map((n) =>
      h('button', {
        type: 'button',
        class: 'btn sm num' + (n === rpe ? ' primary' : ''),
        style: 'min-width:38px;padding:0 8px',
        'aria-pressed': n === rpe ? 'true' : 'false',
        onclick: () => { rpe = rpe === n ? undefined : n; drawRpe(); },
      }, String(n)),
    ));
  };
  drawSports();
  drawRpe();

  const save = () => {
    const typed = Math.round(parseNum(minIn.value) ?? 0);
    const km = WITH_DISTANCE.includes(sport) ? parseNum(kmIn.value) : undefined;
    const stepsRaw = WITH_STEPS.includes(sport) ? parseNum(stepsIn.value.replace(/\s/g, '')) : undefined;
    const steps = stepsRaw && stepsRaw > 0 ? Math.round(stepsRaw) : undefined;
    // Any one of duration, distance or steps is enough; missing minutes are estimated.
    const minutes = typed > 0 ? typed : estimateMinutes(sport, km, steps);
    if (!(minutes > 0)) { err.textContent = WITH_DISTANCE.includes(sport) || WITH_STEPS.includes(sport) ? 'Indique au moins une durée, une distance ou un nombre de pas.' : 'Indique la durée en minutes.'; return; }
    if (minutes > 720) { err.textContent = 'Plus de 12 h ? Vérifie la durée.'; return; }
    const date = dateIn.value || t;
    const w: Workout = { id: uid(), sport, minutes };
    if (!(typed > 0)) w.estimated = true;
    if (steps) w.steps = steps;
    if (rpe) w.rpe = rpe;
    const note = noteIn.value.trim();
    if (note) w.note = note;
    if (km && km > 0) w.distanceKm = Math.round(km * 100) / 100;
    if (pre.plannedId && (date === plannedDate || mondayOf(date) === mondayOf(plannedDate ?? date))) {
      w.plannedId = pre.plannedId;
      if (pre.mini) w.mini = true;
    } else if (pre.mini) {
      w.mini = true;
    }
    sheet.close();
    void store.updateDay(date, (d) => { d.workouts.push(w); });
    toast(w.mini ? 'Mini faite. Ça compte.' : 'Séance notée. Bravo.');
  };

  const body = h('div', { class: 'stack' },
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Sport'), sportWrap),
    field('Date', dateIn),
    h('p', { class: 'small muted' }, 'Remplis ce que tu as : durée, distance ou pas.'),
    h('div', { class: 'log-metrics' }, field('Durée (min)', minIn), kmField, stepsField),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Effort ressenti (1 = très facile, 10 = à fond)'), rpeWrap),
    field('Note', noteIn),
    err,
    h('button', { class: 'btn primary block', type: 'button', onclick: save }, 'Enregistrer'),
  );
  const sheet = openSheet(pre.mini ? 'Mini faite' : 'Noter une séance', body);
}

// ---------- consistency ----------

function consistencyCard(t: string): HTMLElement {
  const p = store.profile;
  const curMon = mondayOf(t);
  const countWeek = (mon: string) => workoutsBetween(mon, addDays(mon, 6)).length;

  // The current week counts only once it qualifies; an unfinished week never breaks the streak.
  let streak = countWeek(curMon) >= 2 ? 1 : 0;
  let mon = addDays(curMon, -7);
  const floor = addDays(mondayOf(p.startDate), -7 * 104);
  while (mon >= floor && countWeek(mon) >= 2) { streak++; mon = addDays(mon, -7); }

  const since = workoutsBetween(p.startDate, t);
  const totalMin = since.reduce((a, l) => a + l.w.minutes, 0);

  const last4 = workoutsBetween(addDays(curMon, -21), t);
  const perSport = new Map<Sport, number>();
  for (const l of last4) perSport.set(l.w.sport, (perSport.get(l.w.sport) ?? 0) + l.w.minutes);
  const rows = [...perSport.entries()].sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 1;

  return h('section', { class: 'card ux solo' },
    h('div', { class: 'td-energy' },
      keyBubble(String(streak), streak === 1 ? 'semaine' : 'semaines', 'd’affilée', 'ink'),
      h('div', { class: 'td-energy-side', style: 'gap:4px' },
        h('div', { style: 'font-weight:700' }, streak === 1 ? 'Semaine active' : 'Semaines actives'),
        h('div', { class: 'small muted' }, streak ? '2 séances ou plus par semaine. On continue comme ça.' : 'Deux séances cette semaine et le compteur démarre.'),
      ),
    ),
    disclosure('Voir le détail', () => [
      h('div', { class: 'grid-2' },
        h('div', { class: 'stat' }, h('div', { class: 'value' }, fmtInt(since.length)), h('div', { class: 'label' }, since.length > 1 ? 'séances depuis le départ' : 'séance depuis le départ')),
        h('div', { class: 'stat' }, h('div', { class: 'value' }, fmtMin(totalMin)), h('div', { class: 'label' }, 'au total')),
      ),
      rows.length
        ? [
            h('div', { class: 'eyebrow' }, '4 dernières semaines'),
            h('div', { class: 'stack', style: 'gap:8px' },
              rows.map(([sp, m]) =>
                h('div', { class: 'sp-bar-row' },
                  h('span', { class: 'small' }, SHORT_LABEL[sp]),
                  bar(m / max),
                  h('span', { class: 'small num muted', style: 'text-align:right' }, fmtMin(m)),
                ),
              ),
            ),
          ]
        : null,
    ], 'sp-consistency'),
  );
}

// ---------- season ----------

function seasonCard(t: string): HTMLElement {
  const p = store.profile;
  const blocks = season(p);
  const tl = h('ol', { class: 'sp-tl' });
  for (const b of blocks) {
    const cur = t >= b.start && t <= b.end;
    const past = t > b.end;
    tl.append(
      h('li', { class: 'sp-tl-item' + (cur ? ' on' : past ? ' past' : '') },
        h('div', { class: 'row between', style: 'gap:8px' },
          h('span', { style: cur ? 'font-weight:700' : '' }, b.name),
          h('span', { class: 'small num muted' }, b.start === b.end ? fmtDayMonth(b.start) : `${fmtDayMonth(b.start)} – ${fmtDayMonth(b.end)}`),
        ),
        cur ? h('div', { class: 'small muted' }, b.goal) : null,
      ),
    );
  }
  const cur = blocks.find((b) => t >= b.start && t <= b.end);
  return h('section', { class: 'card ux solo' },
    cur
      ? infoRow({ icon: ICON.flag, title: cur.name, detail: cur.goal })
      : infoRow({ icon: ICON.flag, title: t < p.startDate ? `Départ le ${fmtDayMonth(p.startDate)}` : 'Saison terminée', detail: t < p.startDate ? 'On commence doucement.' : 'Bravo pour tout ce chemin.' }),
    infoRow({ icon: ICON.spark, title: p.raceName || 'Half Ironman', detail: `1,9 km · 90 km · 21,1 km · ${fmtDayMonth(p.raceDate)}` }),
    disclosure('Voir toute la saison', () => tl, 'sp-season'),
  );
}
