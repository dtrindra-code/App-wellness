// Coach on the Today screen: ONE card (the coach's word of the moment with the morning /
// evening check-in inline, the reply replacing the message), the weekly bilan and the
// gentle "J'ai craqué" entry point.
// Pure render functions: they read the store, never subscribe to it. Transient UI
// state (a reply just shown, a bilan dismissed) lives in module variables.

import type { Checkin } from '../types';
import { store } from '../store';
import { h, s, disclosure, openSheet } from '../lib/ui';
import { today, weekday, fmtDayMonth } from '../lib/dates';
import {
  coachNow, coachMessages, slotAt, morningReply, eveningReply, weeklyReview, MOOD_LABELS,
} from '../lib/coach';
import type { CoachSlot, EveningAnswer } from '../lib/coach';
import { openSlipSheet } from './slip';
import { openBreathing } from './breathing';
import { journeyNeedsInline } from './journey';

// ---------- transient UI state ----------
/** Date whose morning / evening answer was just given (keeps the reply visible). */
let morningAnswered: string | null = null;
let eveningAnswered: string | null = null;
/** Draft of the evening note (kept across re-renders). */
let eveningDraft = '';
/** Dates whose coach message is shown in full ("Lire la suite"). */
const bodyOpen = new Set<string>();
const BILAN_KEY = 'cap-maldives:bilan-seen';

const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };

const SLOT_EYEBROW: Record<CoachSlot, string> = {
  matin: 'Ton coach · ce matin',
  midi: 'Ton coach · ce midi',
  aprem: 'Ton coach · cet après-midi',
  soir: 'Ton coach · ce soir',
  bilan: 'Ton coach · bilan',
};

/** Round face drawn in SVG: mood 1 (frown) … 5 (big smile). */
export function moodFace(mood: number, size = 34): SVGElement {
  const k = Math.max(-2, Math.min(2, mood - 3));
  const mouthY = 25.5 - k * 0.4;
  return s('svg', { class: 'coach-face', viewBox: '0 0 40 40', width: size, height: size, 'aria-hidden': 'true' },
    s('circle', { class: 'coach-face-bg', cx: 20, cy: 20, r: 17 }),
    s('circle', { class: 'coach-face-ink', cx: 14.5, cy: 16.5, r: 1.9 }),
    s('circle', { class: 'coach-face-ink', cx: 25.5, cy: 16.5, r: 1.9 }),
    s('path', { class: 'coach-face-line', d: `M13 ${mouthY} Q20 ${mouthY + k * 3.6} 27 ${mouthY}`, fill: 'none', 'stroke-width': 2.2, 'stroke-linecap': 'round' }),
  );
}

// ---------- the one coach card ----------

function setCheckin(date: string, patch: Partial<Checkin>) {
  void store.updateDay(date, (d) => { d.checkin = { ...(d.checkin ?? {}), ...patch }; });
}

const EVENING: { value: EveningAnswer; label: string; mood: number }[] = [
  { value: 'bien', label: 'Bien', mood: 5 },
  { value: 'moyen', label: 'Moyen', mood: 3 },
  { value: 'dur', label: 'Dur', mood: 1 },
];

export type CoachMoment = 'matin' | 'journee' | 'soir';

export interface CoachCardOpts {
  /** Moment of the Today screen (decides the inline check-in). */
  moment: CoachMoment;
  /** Extra line under the message (e.g. recovery when the cycle hero is hidden). */
  extra?: Node | null;
  /** The weekly bilan is shown inside this card: don't repeat the bilan message. */
  bilanShown?: boolean;
  /** Sunday evening / Monday: the 2-line weekly bilan, shown inside the card. */
  bilan?: HTMLElement | null;
  /** Local re-render for transient-state changes. */
  rerender?: () => void;
}

/**
 * The coach's single voice on Today: the message of the moment with the check-in
 * inline (morning mood, evening "how was your day"). The answer replaces the
 * message in place; one signature; the gentle "J'ai craqué" entry at the bottom.
 */
export function coachDayCard(date: string = today(), o: CoachCardOpts = { moment: 'matin' }): HTMLElement {
  const isToday = date === today();
  const hour = isToday ? hourNow() : 8;
  const day = store.getDay(date);
  const ci = day.checkin;
  const slot = isToday ? slotAt(date, hour) : 'matin';
  const eyebrow = h('div', { class: 'eyebrow' }, SLOT_EYEBROW[slot === 'bilan' ? 'soir' : slot]);

  let title: string;
  let body: string;
  let face: SVGElement | null = null;
  let inline: HTMLElement | null = null;
  let after: HTMLElement | null = null;

  const mood = ci?.morningMood;
  const ans = ci?.evening;

  if (o.moment === 'soir' && isToday && hour >= 18 && !ans) {
    // Evening question, answered in one tap in the same card.
    title = 'Comment s’est passée ta journée ?';
    body = 'Toutes les réponses sont bonnes.';
    inline = h('div', { class: 'coach-moods three dc-moods', role: 'group', 'aria-label': 'Ta journée' },
      EVENING.map((x) => h('button', {
        class: 'coach-mood', type: 'button', 'aria-label': x.label,
        onclick: () => { eveningAnswered = date; eveningDraft = ''; setCheckin(date, { evening: x.value }); },
      }, h('span', { class: 'coach-mood-face' }, moodFace(x.mood, 30)), h('span', { class: 'coach-mood-label' }, x.label))));
  } else if (o.moment === 'soir' && ans && eveningAnswered === date) {
    const r = eveningReply(ans, date, store.state);
    title = r.title;
    body = r.body;
    face = moodFace(EVENING.find((x) => x.value === ans)?.mood ?? 3, 40);
    after = eveningAfter(date, ans, o.rerender);
  } else if (o.moment === 'matin' && mood !== undefined && morningAnswered === date) {
    const r = morningReply(mood, date, store.state);
    title = r.title;
    body = r.body;
    face = moodFace(mood, 40);
    after = h('div', { class: 'stack coach-needs' },
      journeyNeedsInline(date, o.rerender ?? (() => {})),
      h('button', { class: 'dc-link', style: 'align-self:flex-start', type: 'button', onclick: () => { morningAnswered = null; setCheckin(date, { morningMood: undefined }); } }, 'Changer ma réponse'));
  } else {
    const m = o.bilanShown && slot === 'bilan' ? coachMessages(date, store.state).soir : coachNow(date, store.state);
    title = m.title;
    body = m.body;
    if (o.moment === 'matin' && isToday && hour < 12 && mood === undefined) {
      inline = h('div', { class: 'stack', style: 'gap:8px' },
        h('p', { class: 'dc-q' }, 'Comment tu te sens ce matin ?'),
        h('div', { class: 'coach-moods dc-moods', role: 'group', 'aria-label': 'Ton humeur ce matin' },
          MOOD_LABELS.map((label, i) => h('button', {
            class: 'coach-mood', type: 'button', 'aria-label': label,
            onclick: () => { morningAnswered = date; setCheckin(date, { morningMood: i + 1 }); },
          }, h('span', { class: 'coach-mood-face' }, moodFace(i + 1, 30)), h('span', { class: 'coach-mood-label' }, label)))),
      );
    } else if (o.moment === 'matin' && mood !== undefined) {
      after = h('button', { class: 'dc-link', type: 'button', onclick: () => { morningAnswered = null; setCheckin(date, { morningMood: undefined }); } },
        `Ton humeur : ${MOOD_LABELS[mood - 1] ?? ''} · changer`);
    } else if (o.moment === 'soir' && ans) {
      after = h('button', { class: 'dc-link', type: 'button', onclick: () => { eveningAnswered = null; setCheckin(date, { evening: undefined }); } },
        `Ta journée : ${EVENING.find((x) => x.value === ans)?.label ?? ''} · changer`);
    }
  }

  const slips = day.slips ?? [];
  const last = slips[slips.length - 1];
  // Long messages: 3 lines, then "Lire la suite".
  const long = body.length > 150 && !bodyOpen.has(date);
  return h('section', { class: 'card ux coach-card dc-coach', 'aria-label': 'Le mot de ton coach' },
    eyebrow,
    h('div', { class: 'coach-head' },
      face,
      h('h3', { class: 'coach-title' }, title),
    ),
    h('p', { class: 'coach-body' + (long ? ' clamp' : '') }, body),
    long ? h('button', { class: 'dc-link coach-more', type: 'button', onclick: () => { bodyOpen.add(date); o.rerender?.(); } }, 'Lire la suite') : null,
    o.extra ?? null,
    o.bilan ?? null,
    inline,
    after,
    // After a "Dur" answer the reply already offers "J'ai craqué": no second button.
    o.moment === 'soir' && ans === 'dur' && eveningAnswered === date ? null : h('div', { class: 'coach-foot' },
      h('span', { class: 'small muted' }, last ? `Noté à ${last.time.replace(':', ' h ')}. On continue.` : 'Un moment difficile ?'),
      h('button', { class: 'coach-slip-btn', type: 'button', onclick: () => openSlipSheet(date) }, 'J’ai craqué'),
    ),
  );
}

/** Under the evening reply: "Dur" offers breathing / slip; the note is optional and folded. */
function eveningAfter(date: string, ans: EveningAnswer, rerender?: () => void): HTMLElement {
  const ci = store.getDay(date).checkin;
  const noteKey = `coach-note-${date}`;
  const note = () => {
    const ta = h('textarea', {
      class: 'input coach-note', rows: 2, placeholder: 'Un mot sur ta journée ?', 'aria-label': 'Un mot sur ta journée',
      value: ci?.eveningNote ?? eveningDraft,
      oninput: (e: Event) => { eveningDraft = (e.target as HTMLTextAreaElement).value; },
    });
    return [
      ta,
      h('button', {
        class: 'btn sm', style: 'align-self:flex-end', type: 'button',
        onclick: () => {
          const v = eveningDraft.trim() || (ci?.eveningNote ?? '');
          eveningDraft = '';
          eveningAnswered = null;
          setCheckin(date, { eveningNote: v || undefined });
        },
      }, 'Enregistrer'),
    ];
  };
  return h('div', { class: 'stack', style: 'gap:8px' },
    ans === 'dur'
      ? h('div', { class: 'dc-row2' },
          h('button', { class: 'btn', type: 'button', onclick: () => openBreathing(date) }, 'Respirer 5 min'),
          h('button', { class: 'btn', type: 'button', onclick: () => openSlipSheet(date) }, 'J’ai craqué'),
        )
      : null,
    disclosure(ci?.eveningNote ? 'Ton mot du soir' : 'Ajouter un mot (facultatif)', note, noteKey, 'Replier'),
    h('div', { class: 'row between' },
      h('button', { class: 'dc-link', type: 'button', onclick: () => { eveningAnswered = null; setCheckin(date, { evening: undefined }); } }, 'Changer ma réponse'),
      h('button', { class: 'dc-link', type: 'button', onclick: () => { eveningAnswered = null; eveningDraft = ''; rerender?.(); } }, 'Terminer'),
    ),
  );
}

// ---------- weekly bilan ----------

function bilanSeen(): string | null {
  try { return localStorage.getItem(BILAN_KEY); } catch { return null; }
}
function markBilanSeen(weekStart: string) {
  try { localStorage.setItem(BILAN_KEY, weekStart); } catch { /* ignore */ }
}
let bilanHidden: string | null = null;

/** Should the weekly bilan show at `hour` on `date`? (Sunday evening or Monday.) */
export function bilanTime(date: string, hour: number = hourNow()): boolean {
  const wd = weekday(date);
  return (wd === 6 && hour >= 17) || wd === 0;
}

/** Weekly recap data for `date`, or null when it should not show (time, seen, nothing logged). */
function bilanData(date: string) {
  if (date !== today() || !bilanTime(date)) return null;
  const r = weeklyReview(date, store.state);
  if (bilanHidden === r.start || bilanSeen() === r.start) return null;
  // Nothing at all logged that week (e.g. before the start): no bilan.
  const anything = r.sessionsDone + r.minutesMoved + r.daysWithMeals + r.habitsTotal + r.weighIns + r.slips +
    r.checkins.bien + r.checkins.moyen + r.checkins.dur > 0;
  return anything ? r : null;
}

/** The weekly bilan in 2 lines + "Voir mon bilan", placed inside the coach card (Sunday evening, Monday). */
export function weeklyBilanLines(date: string = today()): HTMLElement | null {
  const r = bilanData(date);
  if (!r) return null;
  return h('div', { class: 'coach-bilan-inline' },
    h('div', { class: 'eyebrow' }, `Ta semaine · ${fmtDayMonth(r.start)} → ${fmtDayMonth(r.end)}`),
    h('p', null, h('strong', null, r.headline), ` ${r.wins[0] ? r.wins[0] + '.' : ''}`),
    h('button', { class: 'dc-link', style: 'align-self:flex-start', type: 'button', onclick: () => openBilanSheet(date) }, 'Voir mon bilan'),
  );
}

/** The full weekly bilan in a sheet: wins first, 3 figures, one focus for next week. */
export function openBilanSheet(date: string = today()) {
  const r = weeklyReview(date, store.state);
  const stat = (value: string, label: string) => h('div', { class: 'coach-stat' },
    h('span', { class: 'coach-stat-v num' }, value), h('span', { class: 'coach-stat-l' }, label));
  const sheet = openSheet('Ta semaine', h('div', { class: 'stack coach-bilan' },
    h('p', { class: 'italic muted' }, `${fmtDayMonth(r.start)} → ${fmtDayMonth(r.end)}`),
    h('h3', { class: 'coach-title' }, r.headline),
    h('ul', { class: 'coach-wins' },
      r.wins.slice(0, 4).map((w) => h('li', null,
        s('svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, s('path', { d: 'M5 12.5l4.5 4.5L19 7.5' })),
        h('span', null, w)))),
    h('div', { class: 'coach-stats' },
      stat(r.sessionsPlanned ? `${r.sessionsDone}/${r.sessionsPlanned}` : String(r.sessionsDone), 'séances'),
      stat(`${r.waterDays}/7`, 'jours d’eau'),
      stat(String(r.habitsTotal), 'piliers'),
    ),
    h('div', { class: 'coach-focus' },
      h('div', { class: 'eyebrow' }, 'Ton focus de la semaine'),
      h('p', { class: 'coach-focus-text' }, r.focus.charAt(0).toUpperCase() + r.focus.slice(1) + '.'),
      r.nextPhase ? h('p', { class: 'small' }, `Et la semaine prochaine, on passe en « ${r.nextPhase} ». Je t’explique tout lundi.`) : null,
    ),
    h('button', { class: 'btn primary block', type: 'button', onclick: () => {
      bilanHidden = r.start;
      markBilanSeen(r.start);
      sheet.close();
      document.querySelector('.coach-bilan-inline')?.remove();
    } }, 'Merci, c’est noté'),
  ));
}
