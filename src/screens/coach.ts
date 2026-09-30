// Coach blocks for the Today screen: the coach's word of the moment, the morning and
// evening check-ins, the weekly bilan and the gentle "J'ai craqué" entry point.
// Pure render functions: they read the store, never subscribe to it. Transient UI
// state (a reply just shown, a bilan dismissed) lives in module variables.

import type { Checkin } from '../types';
import { store } from '../store';
import { h, s, iconCircle, ICON, toast } from '../lib/ui';
import { today, weekday, fmtDayMonth } from '../lib/dates';
import {
  coachNow, slotAt, morningReply, eveningReply, weeklyReview, MOOD_LABELS,
} from '../lib/coach';
import type { CoachSlot, EveningAnswer } from '../lib/coach';
import { openSlipSheet } from './slip';
import { openBreathing } from './breathing';

// ---------- transient UI state ----------
/** Date whose morning / evening answer was just given (keeps the reply visible). */
let morningAnswered: string | null = null;
let eveningAnswered: string | null = null;
/** Draft of the evening note (kept across re-renders). */
let eveningDraft = '';
const BILAN_KEY = 'cap-maldives:bilan-seen';

const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };

const SLOT_ICON: Record<CoachSlot, string> = {
  matin: ICON.sun,
  midi: ICON.fork,
  aprem: ICON.leaf,
  soir: ICON.moon,
  bilan: ICON.flag,
};

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

// ---------- coach card ----------

/** The coach's message of the moment, with its voice and the gentle "J'ai craqué" entry. */
export function coachCard(date: string = today()): HTMLElement {
  const m = coachNow(date, store.state);
  const slot = date === today() ? slotAt(date, hourNow()) : 'matin';
  const slips = store.getDay(date).slips ?? [];
  const last = slips[slips.length - 1];
  return h('section', { class: 'card ux coach-card', 'aria-label': 'Le mot de ton coach' },
    h('div', { class: 'eyebrow' }, SLOT_EYEBROW[slot]),
    h('div', { class: 'coach-head' },
      iconCircle(SLOT_ICON[slot], 'coach-ic'),
      h('h3', { class: 'coach-title' }, m.title),
    ),
    h('p', { class: 'coach-body' }, m.body),
    h('p', { class: 'coach-sign' }, '— ton coach'),
    h('div', { class: 'coach-foot' },
      last ? h('span', { class: 'small muted' }, `Noté à ${last.time.replace(':', ' h ')}. On continue.`) : h('span', { class: 'small muted' }, 'Un moment difficile ?'),
      h('button', { class: 'coach-slip-btn', type: 'button', onclick: () => openSlipSheet(date) }, 'J’ai craqué'),
    ),
  );
}

// ---------- morning check-in ----------

function setCheckin(date: string, patch: Partial<Checkin>) {
  void store.updateDay(date, (d) => { d.checkin = { ...(d.checkin ?? {}), ...patch }; });
}

/** 1-tap morning mood (before noon, until answered). Null when not relevant. */
export function checkinMorning(date: string = today()): HTMLElement | null {
  const mood = store.getDay(date).checkin?.morningMood;
  const isToday = date === today();
  if (mood !== undefined && morningAnswered === date) {
    const r = morningReply(mood, date, store.state);
    return h('section', { class: 'card ux solo coach-check' },
      h('div', { class: 'coach-head' }, moodFace(mood, 40), h('h3', { class: 'coach-title' }, r.title)),
      h('p', { class: 'coach-body' }, r.body),
      h('button', { class: 'btn ghost sm', style: 'align-self:flex-start', type: 'button', onclick: () => { morningAnswered = null; setCheckin(date, { morningMood: undefined }); } }, 'Changer ma réponse'),
    );
  }
  if (mood !== undefined || !isToday || hourNow() >= 12) return null;
  return h('section', { class: 'card ux solo coach-check' },
    h('h3', { class: 'coach-q' }, 'Comment tu te sens ce matin ?'),
    h('div', { class: 'coach-moods', role: 'group', 'aria-label': 'Ton humeur ce matin' },
      MOOD_LABELS.map((label, i) => h('button', {
        class: 'coach-mood', type: 'button', 'aria-label': label,
        onclick: () => { morningAnswered = date; setCheckin(date, { morningMood: i + 1 }); },
      }, moodFace(i + 1), h('span', { class: 'coach-mood-label' }, label))),
    ),
  );
}

// ---------- evening check-in ----------

const EVENING: { value: EveningAnswer; label: string; mood: number }[] = [
  { value: 'bien', label: 'Bien', mood: 5 },
  { value: 'moyen', label: 'Moyen', mood: 3 },
  { value: 'dur', label: 'Dur', mood: 1 },
];

/** Evening check-in (after 18 h, until answered). Null when not relevant. */
export function checkinEvening(date: string = today()): HTMLElement | null {
  const ci = store.getDay(date).checkin;
  const ans = ci?.evening;
  if (ans && eveningAnswered === date) {
    const r = eveningReply(ans, date, store.state);
    const note = h('textarea', {
      class: 'input coach-note', rows: 2, placeholder: 'Un mot sur ta journée ? (facultatif)', 'aria-label': 'Un mot sur ta journée',
      value: ci?.eveningNote ?? eveningDraft,
      oninput: (e: Event) => { eveningDraft = (e.target as HTMLTextAreaElement).value; },
    });
    return h('section', { class: 'card ux solo coach-check' },
      h('div', { class: 'coach-head' }, moodFace(EVENING.find((x) => x.value === ans)?.mood ?? 3, 40), h('h3', { class: 'coach-title' }, r.title)),
      h('p', { class: 'coach-body' }, r.body),
      h('p', { class: 'coach-sign' }, '— ton coach'),
      ans === 'dur'
        ? h('div', { class: 'stack', style: 'gap:8px' },
            h('p', { class: 'small' }, 'Si tu as craqué, tu peux le noter : je t’aiderai à repartir, sans jugement.'),
            h('div', { class: 'td-actions' },
              h('button', { class: 'btn', type: 'button', onclick: () => openSlipSheet(date) }, 'J’ai craqué'),
              h('button', { class: 'btn', type: 'button', onclick: () => openBreathing(date) }, 'Respirer 5 min'),
            ),
          )
        : null,
      note,
      h('div', { class: 'row between' },
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { eveningAnswered = null; setCheckin(date, { evening: undefined }); } }, 'Changer'),
        h('button', {
          class: 'btn sm', type: 'button',
          onclick: () => {
            const v = eveningDraft.trim() || (ci?.eveningNote ?? '');
            eveningDraft = '';
            eveningAnswered = null;
            setCheckin(date, { eveningNote: v || undefined });
            toast('Bonne soirée. À demain.');
          },
        }, 'Terminer'),
      ),
    );
  }
  if (ans || date !== today() || hourNow() < 18) return null;
  return h('section', { class: 'card ux solo coach-check' },
    h('h3', { class: 'coach-q' }, 'Comment s’est passée ta journée ?'),
    h('div', { class: 'coach-moods three', role: 'group', 'aria-label': 'Ta journée' },
      EVENING.map((o) => h('button', {
        class: 'coach-mood', type: 'button', 'aria-label': o.label,
        onclick: () => { eveningAnswered = date; eveningDraft = ''; setCheckin(date, { evening: o.value }); },
      }, moodFace(o.mood), h('span', { class: 'coach-mood-label' }, o.label))),
    ),
    h('p', { class: 'small muted', style: 'text-align:center' }, 'Toutes les réponses sont bonnes.'),
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

/** Weekly recap: wins first, one focus for next week. Sunday evening and Monday; null otherwise. */
export function weeklyBilanCard(date: string = today()): HTMLElement | null {
  if (date !== today() || !bilanTime(date)) return null;
  const r = weeklyReview(date, store.state);
  if (bilanHidden === r.start || bilanSeen() === r.start) return null;
  // Nothing at all logged that week (e.g. before the start): no bilan.
  const anything = r.sessionsDone + r.minutesMoved + r.daysWithMeals + r.habitsTotal + r.weighIns + r.slips +
    r.checkins.bien + r.checkins.moyen + r.checkins.dur > 0;
  if (!anything) return null;

  const stat = (value: string, label: string) => h('div', { class: 'coach-stat' },
    h('span', { class: 'coach-stat-v num' }, value), h('span', { class: 'coach-stat-l' }, label));

  return h('section', { class: 'card ux solo coach-bilan paper', 'aria-label': 'Bilan de la semaine' },
    h('div', { class: 'eyebrow' }, `Ta semaine · ${fmtDayMonth(r.start)} → ${fmtDayMonth(r.end)}`),
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
    h('p', { class: 'coach-sign' }, '— ton coach'),
    h('button', { class: 'btn sm', style: 'align-self:center;margin-bottom:14px', type: 'button', onclick: () => {
      bilanHidden = r.start;
      markBilanSeen(r.start);
      toast('Belle semaine à toi.');
      const root = document.getElementById('screen');
      root?.querySelector('.coach-bilan')?.remove();
    } }, 'Merci, c’est noté'),
  );
}

/** Coach block for the top of TA JOURNÉE, in order. */
export function coachBlocks(date: string = today()): HTMLElement[] {
  const hour = date === today() ? hourNow() : 8;
  const bilan = weeklyBilanCard(date);
  const out: (HTMLElement | null)[] = [
    bilan && slotAt(date, hour) === 'bilan' ? null : coachCard(date),
    checkinMorning(date),
    checkinEvening(date),
    bilan,
  ];
  return out.filter((x): x is HTMLElement => !!x);
}
