// "Revenir à moi" outside its pages: the ink entry card on Today (every state of the
// journey in one 88 px card), the engagements as hairline check rows, the optional
// needs inside the coach card, and the sheets shared with Équilibre: start flow, rules
// editor, chapter pages, "Mes pages" (journal page template).
// Pure render functions: they read the store, never subscribe to it.

import { store } from '../store';
import { h, openSheet, toast, bar, disclosure, checkRow, haptic } from '../lib/ui';
import { addDays, fmtDayMonth, fmtShort, today } from '../lib/dates';
import {
  JOURNEY_DAYS, CHAPTER_DAYS, JOKERS_PER_WEEK, MAX_NEEDS,
  journeyOf, journeyDay, chapterOf, chapterInfo, rulesOn, ruleDef, ruleDone, autoDone,
  dayScore, jokersLeft, setJoker, toggleRule, energyOf, toggleNeed, promptOn, entryState,
  startJourney, changeRules, stopJourney, chapterRecap, besoinDe, journeyStats,
} from '../lib/journey';
import type { ChapterRecap } from '../lib/journey';
import { CHAPTERS, DEFAULT_RULES, NEEDS, RULES } from '../data/journey';
import type { NeedKey } from '../data/journey';
import { openPageSheet } from './journal-page';
import { openCheckpoint, openJourneyRecap } from './journal-checkpoints';
import { openSundayReset } from './sunday-reset';
import { openJournalPage, chapterPath } from './journal-shell';

// ---------- transient UI state ----------
const INVITE_KEY = 'cap-maldives:journey-invite';
/** Dates whose needs chips stay open in the coach card while she picks (up to 3). */
const needsOpen = new Set<string>();

export const ENERGY_LABELS = ['À plat', 'Basse', 'Moyenne', 'Bonne', 'Pleine'] as const;

function inviteHiddenUntil(): string | null {
  try { return localStorage.getItem(INVITE_KEY); } catch { return null; }
}

const chevron = () => h('span', { class: 'jr-entry-chev', 'aria-hidden': 'true' }, '›');

// ---------- the ink entry card (Today) ----------

/**
 * Today: the "Revenir à moi" card, dark ink, one tap. Covers every state: invite,
 * upcoming, page of the day (before / after 18 h, kept, skipped), checkpoints 30 / 60,
 * the Sunday reset, the end. Day-0 baseline, reset and chapter end add a small link
 * under the card. Null when there is nothing to show.
 */
export function journeyEntryCard(date: string, hour: number = new Date().getHours() + new Date().getMinutes() / 60): HTMLElement | null {
  const es = entryState(date, hour);
  if (!es) return null;
  if (es.kind === 'invite') {
    const until = inviteHiddenUntil();
    if (until && date < until) return null;
  }
  const n = es.day;
  const pr = n !== null ? promptOn(date) : null;
  const ch = n !== null ? chapterInfo(chapterOf(n)) : null;

  let disc: [string, string] = [String(n ?? 0), `/${JOURNEY_DAYS}`];
  let line = '';
  let open: () => void = () => openPageSheet(date);
  let label = 'Revenir à moi';
  switch (es.kind) {
    case 'invite':
      disc = ['60', 'jours'];
      line = '60 jours pour cultiver ton jardin intérieur';
      open = () => openJourneyStart();
      break;
    case 'upcoming': {
      const j = journeyOf(store.profile)!;
      disc = ['J−' + String(es.daysToStart ?? 0), ''];
      line = es.daysToStart === 1 ? 'Ça commence demain' : `Ça commence le ${fmtDayMonth(j.startDate)}`;
      open = () => (es.baselineDue ? openCheckpoint('0') : openRulesSheet());
      break;
    }
    case 'page-soon':
      line = `Ce soir : ${pr?.title ?? 'ta page'} · 2 min`;
      break;
    case 'page':
      line = 'Ta page du jour · 2 min';
      break;
    case 'written':
      line = 'Page gardée ✓ · Relire';
      break;
    case 'skipped':
      line = 'Passée · Y répondre quand même';
      break;
    case 'checkpoint':
      line = n === 30 ? 'Jour 30 · Premier regard en arrière' : 'Jour 60 · Ce qui a fleuri';
      open = () => openCheckpoint(String(n) as '30' | '60');
      break;
    case 'checkpoint-done':
      line = 'Bilan gardé ✓ · Relire';
      open = () => (n === 60 ? openJourneyRecap() : openCheckpoint('30'));
      break;
    case 'reset': {
      const monday = new Date(`${date}T12:00:00`).getDay() === 1;
      line = monday ? 'Ton reset de la semaine · 5 min' : 'Ton reset du dimanche · 5 min';
      open = () => openSundayReset(date);
      if (n === null) disc = ['60', `/${JOURNEY_DAYS}`];
      break;
    }
    case 'done':
      disc = ['60', `/${JOURNEY_DAYS}`];
      line = 'Tu l’as fait, pour toi · Mon chemin';
      open = () => openJourneyRecap();
      label = 'Revenir à moi · parcours terminé';
      break;
  }

  const card = h('button', {
    class: 'jr-entry', type: 'button', 'data-kind': es.kind,
    'aria-label': `${label}${n !== null ? `, jour ${n} sur ${JOURNEY_DAYS}` : ''}. ${line}`,
    onclick: open,
  },
    h('span', { class: 'jr-entry-disc', 'aria-hidden': 'true' },
      h('span', { class: 'jr-entry-n num' }, disc[0]),
      disc[1] ? h('span', { class: 'jr-entry-of' }, disc[1]) : null),
    h('span', { class: 'jr-entry-main' },
      h('span', { class: 'jr-entry-title' }, label === 'Revenir à moi · parcours terminé' ? 'Revenir à moi' : label),
      h('span', { class: 'jr-entry-line' }, line)),
    chevron(),
  );

  // Second links under the card (never inside: the card is one button).
  const more: HTMLElement[] = [];
  if (es.baselineDue && es.kind !== 'upcoming') {
    more.push(h('button', { class: 'jr-entry-chip', type: 'button', onclick: () => openCheckpoint('0') }, 'Point de départ · 3 min'));
  }
  if (es.kind === 'reset' && n !== null) {
    const written = es.day !== null && !!store.getDay(date).journey?.answer;
    more.push(h('button', { class: 'jr-entry-link', type: 'button', onclick: () => openPageSheet(date) }, written ? 'Relire ma page du jour' : 'Ma page du jour'));
  }
  if (es.chapterEnd && n !== null && n !== 60 && hour >= 18 && ch) {
    more.push(h('button', { class: 'jr-entry-link', type: 'button', onclick: () => openChapterSheet(ch.index) }, `Fin du chapitre ${ch.index} · Relire mes pages`));
  }
  if (es.kind === 'invite') {
    more.push(h('button', {
      class: 'jr-entry-link', type: 'button',
      onclick: (e: Event) => {
        try { localStorage.setItem(INVITE_KEY, addDays(date, 7)); } catch { /* ignore */ }
        (e.currentTarget as HTMLElement).closest('.jr-entry-wrap')?.remove();
      },
    }, 'Plus tard'));
  }
  return h('div', { class: 'jr-entry-wrap' }, card, more.length ? h('div', { class: 'jr-entry-more' }, more) : null);
}

/** @deprecated Replaced by journeyEntryCard on Today. */
export function journeyInviteCard(_date: string): HTMLElement | null {
  return null;
}

// ---------- start flow ----------

/** The 5 engagements with a "Changer" action each; `onChange` gets the new list. */
export function rulesEditor(rules: string[], onChange: (next: string[]) => void): HTMLElement {
  const wrap = h('div', { class: 'stack jr-rules-edit', style: 'gap:8px' });
  let swapping: number | null = null;
  const paint = () => {
    const rows = rules.map((k, i) => {
      const r = ruleDef(k);
      const row = h('div', { class: 'jr-rule-row' + (swapping === i ? ' on' : '') },
        h('span', { class: 'jr-rule-main' },
          h('span', { class: 'jr-rule-label' }, r?.label ?? k),
          r?.detail ? h('span', { class: 'jr-rule-detail' }, r.detail) : null,
          r?.auto ? h('span', { class: 'jr-auto' }, r.auto === 'move' || r.auto === 'water' ? 'se coche tout seul' : 'relié à tes piliers') : null),
        h('button', { class: 'dc-link', type: 'button', onclick: () => { swapping = swapping === i ? null : i; paint(); } }, swapping === i ? 'Annuler' : 'Changer'),
      );
      if (swapping !== i) return row;
      const others = RULES.filter((x) => !rules.includes(x.key));
      return h('div', { class: 'stack', style: 'gap:6px' }, row,
        h('div', { class: 'jr-swap' },
          h('span', { class: 'eyebrow' }, 'Le remplacer par'),
          others.map((x) => h('button', {
            class: 'jr-swap-item', type: 'button',
            onclick: () => { rules = rules.map((y, j) => (j === i ? x.key : y)); swapping = null; onChange(rules); paint(); },
          }, h('span', { class: 'jr-rule-label' }, x.label), x.detail ? h('span', { class: 'jr-rule-detail' }, x.detail) : null))),
      );
    });
    wrap.replaceChildren(...rows);
  };
  paint();
  return wrap;
}

export function openJourneyStart() {
  let rules = DEFAULT_RULES.filter((k) => !!ruleDef(k));
  const tomorrow = addDays(today(), 1);
  const dateInput = h('input', { class: 'input', type: 'date', value: tomorrow, min: addDays(today(), -7), 'aria-label': 'Date du jour 1' });
  const body = h('div', { class: 'stack jr-start' },
    h('p', { class: 'italic jr-sub' }, 'Chaque jour une graine, chaque semaine une pousse : 60 jours pour cultiver ton jardin intérieur, 5 minutes par jour maximum.'),
    h('ul', { class: 'jr-lines' },
      h('li', null, 'Chaque matin : ton humeur d’un geste, et ton besoin du jour si tu veux.'),
      h('li', null, 'Dans la journée : 5 petits engagements doux. 4 sur 5, et la journée fleurit.'),
      h('li', null, 'Le soir : ta page du jour, 2 ou 3 questions courtes. Quelques mots suffisent, ou tu passes.'),
      h('li', null, 'Avant de commencer : ton point de départ (ta roue de vie, ce que tu espères, ce que tu veux cultiver). On le revoit au jour 30 et au jour 60.'),
    ),
    h('p', { class: 'small muted' }, `4 chapitres de ${CHAPTER_DAYS} jours. ${JOKERS_PER_WEEK} jokers par semaine, et un jour raté ne remet jamais rien à zéro.`),
    h('h3', null, 'Tes 5 engagements'),
    h('p', { class: 'small muted' }, 'Une proposition prête à l’emploi. Change ce qui ne te ressemble pas.'),
    rulesEditor(rules, (next) => { rules = next; }),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Je commence le'), dateInput),
    h('button', {
      class: 'btn primary block bal-big', type: 'button',
      onclick: () => {
        const d = /^\d{4}-\d{2}-\d{2}$/.test(dateInput.value) ? dateInput.value : tomorrow;
        startJourney(d, rules);
        sheet.close();
        toast(d === today() ? 'C’est parti, jour 1 aujourd’hui' : `Rendez-vous le ${fmtDayMonth(d)}`);
        // Day 0: the baseline (scales, life wheel, intention, values), right after.
        setTimeout(() => openCheckpoint('0'), 260);
      },
    }, 'Je commence'),
  );
  const sheet = openSheet('Revenir à moi', body);
}

/** Rules settings (Équilibre): swap engagements from today on; stop the journey. */
export function openRulesSheet() {
  const j = journeyOf(store.profile);
  if (!j) { openJourneyStart(); return; }
  let rules = [...j.rules];
  let confirmStop = false;
  const stopSlot = h('div', { class: 'row' });
  const paintStop = () => stopSlot.replaceChildren(...(confirmStop
    ? [
        h('button', { class: 'btn sm danger grow', type: 'button', onclick: () => { stopJourney(); sheet.close(); toast('Parcours arrêté. Tes pages restent gardées.'); } }, 'Oui, arrêter'),
        h('button', { class: 'btn sm grow', type: 'button', onclick: () => { confirmStop = false; paintStop(); } }, 'Annuler'),
      ]
    : [h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { confirmStop = true; paintStop(); } }, 'Arrêter le parcours')]));
  paintStop();
  const started = today() >= j.startDate;
  const body = h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, started
      ? 'Tu peux changer un engagement quand tu veux, idéalement entre deux chapitres. Les jours passés gardent leurs engagements.'
      : `Ton parcours commence le ${fmtDayMonth(j.startDate)}.`),
    rulesEditor(rules, (next) => { rules = next; }),
    h('button', {
      class: 'btn primary block', type: 'button',
      onclick: () => { changeRules(rules); sheet.close(); toast('Engagements mis à jour'); },
    }, 'Enregistrer'),
    stopSlot,
  );
  const sheet = openSheet('Mes engagements', body);
}

// ---------- morning: needs inside the coach card ----------

/** @deprecated The check-in is the coach card's mood faces; needs come with journeyNeedsInline. */
export function journeyMorningCard(_date: string, _rerender: () => void): HTMLElement | null {
  return null;
}

/**
 * Inside the coach card, once the mood is picked: "De quoi as-tu besoin ? · facultatif",
 * up to 3 chips. Null when the journey is off, or when needs are already set (and not
 * being picked right now).
 */
export function journeyNeedsInline(date: string, rerender: () => void): HTMLElement | null {
  if (journeyDay(date) === null) return null;
  const needs = store.getDay(date).journey?.needs ?? [];
  if (needs.length && !needsOpen.has(date)) return null;
  return h('div', { class: 'jr-needs' },
    h('p', { class: 'jr-needs-q' }, 'De quoi as-tu besoin ? ', h('span', { class: 'jr-needs-opt' }, '· facultatif')),
    h('div', { class: 'jr-needs-chips', role: 'group', 'aria-label': `Ton besoin du jour, ${MAX_NEEDS} au plus` },
      NEEDS.map((x) => {
        const on = needs.includes(x.key);
        return h('button', {
          class: 'jr-need' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
          onclick: (e: Event) => {
            needsOpen.add(date);
            haptic(e.currentTarget as Element);
            if (!toggleNeed(date, x.key as NeedKey)) { toast(`${MAX_NEEDS} besoins au plus : garde l’essentiel`); return; }
            rerender();
          },
        }, x.label);
      })),
  );
}

/** Folded CE MATIN summary bit: "énergie bonne · besoin de calme". */
export function journeyMorningSummary(date: string): string | null {
  if (journeyDay(date) === null) return null;
  const day = store.getDay(date);
  const e = energyOf(day);
  const parts: string[] = [];
  if (e !== undefined) parts.push(`énergie ${ENERGY_LABELS[e - 1].toLowerCase()}`);
  const n = day.journey?.needs?.[0];
  if (n) parts.push(besoinDe(n));
  return parts.length ? parts.join(' · ') : null;
}

// ---------- engagements ----------

/** TA JOURNÉE / CE SOIR: the engagements as hairline check rows (no card), counter, joker. */
export function journeyRulesRows(date: string): HTMLElement | null {
  const n = journeyDay(date);
  if (n === null) return null;
  const day = store.getDay(date);
  const rules = rulesOn(date);
  const sc = dayScore(date);
  const left = jokersLeft(date);
  const status = sc.joker
    ? 'Joker posé : la journée fleurit quand même.'
    : sc.success
      ? sc.done === sc.total ? 'Tout est coché. Ta journée fleurit.' : 'Ta journée fleurit.'
      : `Encore ${sc.need - sc.done} pour que ta journée fleurisse.`;
  const joker = sc.joker
    ? h('button', { class: 'jr-joker', type: 'button', onclick: () => setJoker(date, false) }, 'Rendre le joker')
    : !sc.success && left > 0
      ? h('button', { class: 'jr-joker', type: 'button', onclick: () => { if (setJoker(date, true)) toast('Joker posé. Prends soin de toi.'); } },
          `Utiliser un joker (${left} restant${left > 1 ? 's' : ''})`)
      : null;
  return h('section', { class: 'jr-rows' + (sc.success ? ' ok' : ''), 'aria-label': 'Tes engagements du jour' },
    h('div', { class: 'jr-rows-head' },
      h('span', { class: 'jr-rows-t' }, 'Tes engagements'),
      h('span', { class: 'jr-rows-n num' }, `${sc.done}/${sc.total}`)),
    bar(sc.total ? sc.done / sc.total : 0, sc.success ? 'good' : 'accent'),
    h('div', { class: 'row-list' },
      rules.map((k) => {
        const r = ruleDef(k);
        const on = ruleDone(k, day);
        const auto = autoDone(k, day) && (r?.auto === 'move' || r?.auto === 'water');
        return checkRow({
          title: r?.label ?? k,
          // Titles only on Today (the full wording lives in Équilibre › Mes engagements).
          detail: auto ? h('span', { class: 'jr-auto-d' }, 'auto, d’après ta journée') : undefined,
          on,
          label: r?.label ?? k,
          cls: 'jr-rule' + (auto ? ' auto' : ''),
          onToggle: () => { if (!toggleRule(date, k)) toast('Compté tout seul d’après ta journée'); },
        });
      })),
    h('div', { class: 'jr-rows-foot' }, h('span', { class: 'jr-status' }, status), joker),
  );
}

/** @deprecated Card version of the engagements: Today now uses journeyRulesRows. */
export function journeyRulesCard(date: string): HTMLElement | null {
  return journeyRulesRows(date);
}

// ---------- journal page ----------

/** @deprecated The page opens from journeyEntryCard. */
export function journeyPromptCard(_date: string, _rerender: () => void): HTMLElement | null {
  return null;
}

// ---------- chapter recap ----------

const TREND: Record<NonNullable<ChapterRecap['trend']>, string> = {
  up: 'Ton énergie a monté au fil du chapitre.',
  down: 'Ton énergie a baissé ces derniers jours : on y va en douceur.',
  flat: 'Ton énergie est restée assez stable.',
};

/** Energy as 15 small bars (empty when not noted). */
export function energyBars(values: (number | null)[], labels?: string[]): HTMLElement {
  return h('div', { class: 'jr-bars', 'aria-label': 'Ton énergie jour par jour' },
    values.map((v, i) => h('div', { class: 'jr-bar-col' },
      h('div', { class: 'jr-bar' }, h('span', { style: `height:${v ? Math.round((v / 5) * 100) : 0}%` })),
      labels ? h('span', { class: 'jr-bar-l' }, labels[i]) : null)));
}

export function recapBody(r: ChapterRecap): HTMLElement {
  return h('div', { class: 'jr-recap' },
    h('p', { class: 'jn-text' }, `${r.success} jour${r.success > 1 ? 's' : ''} en fleur · ${r.entries.length} page${r.entries.length > 1 ? 's' : ''} gardée${r.entries.length > 1 ? 's' : ''}`),
    r.energy.some((v) => v !== null) ? energyBars(r.energy) : null,
    r.trend ? h('p', { class: 'jn-text' }, TREND[r.trend]) : null,
    r.topNeeds.length
      ? h('p', { class: 'jn-text' }, h('span', { class: 'jn-meta-l' }, 'Tes besoins les plus notés'), h('br', null),
          r.topNeeds.map((x) => `${x.label} · ${x.count}`).join('   '))
      : null,
  );
}

/** One kept page: the question once, then the chips, then what she wrote. */
export function entryView(e: { day: number; date: string; title: string; question: string; chips: string[]; text?: string; qa?: { q: string; a: string }[] }): HTMLElement {
  const qa = e.qa ?? (e.text ? [{ q: e.question, a: e.text }] : []);
  const firstIsMain = qa.length > 0 && qa[0].q === e.question;
  const rest = firstIsMain ? qa.slice(1) : qa;
  return h('article', { class: 'jr-pg' },
    h('span', { class: 'jn-meta-l' }, `Jour ${e.day} · ${fmtShort(e.date)}`),
    h('h3', { class: 'jr-pg-title' }, e.title),
    e.chips.length || firstIsMain ? h('p', { class: 'jr-pg-q' }, e.question) : null,
    e.chips.length ? h('p', { class: 'jr-pg-chips' }, e.chips.join(' · ')) : null,
    firstIsMain ? h('p', { class: 'jr-pg-a' }, qa[0].a) : null,
    rest.map((x) => [h('p', { class: 'jr-pg-q next' }, x.q), h('p', { class: 'jr-pg-a' }, x.a)]),
  );
}

/** @deprecated The chapter end is a link under journeyEntryCard. */
export function journeyRecapCard(_date: string): HTMLElement | null {
  return null;
}

const CHAPTER_TITLES = CHAPTERS.map((c) => c.title);

function chapterPages(idx: number, open = true): HTMLElement {
  const ch = chapterInfo(idx);
  const r = chapterRecap(idx);
  const pages = () => (r && r.entries.length
    ? h('div', { class: 'jr-pages' }, r.entries.map(entryView))
    : h('p', { class: 'jn-text' }, idx === 1 ? 'Ta première page t’attend ce soir.' : 'Pas encore de page gardée ici.'));
  return h('section', { class: 'jr-chap-block' },
    h('h2', { class: 'jn-theme' }, `Chapitre ${idx} · ${ch.title}`),
    ch.subtitle ? h('p', { class: 'jn-q2' }, ch.subtitle) : null,
    r ? recapBody(r) : null,
    open ? pages() : disclosure(`Lire mes pages (${r?.entries.length ?? 0})`, pages, `jr-ch-${idx}`, 'Replier mes pages'),
  );
}

/** Pages of one chapter, with its recap. */
export function openChapterSheet(idx: number) {
  const ch = chapterInfo(idx);
  const page = openJournalPage({
    eyebrow: `Revenir à moi · Fin du chapitre ${idx}`,
    title: 'Mes pages',
    sub: `Chapitre ${idx} — ${ch.title}`,
    path: chapterPath(idx, CHAPTER_TITLES),
    body: [chapterPages(idx), ch.recapPrompt ? h('p', { class: 'jn-whisper' }, ch.recapPrompt) : null],
    primary: { label: 'Fermer', run: () => page.close() },
  });
}

/** All chapters (Équilibre → "Mes pages"), newest first. */
export function openJournalSheet() {
  const st = journeyStats();
  const last = st ? (st.day >= 1 ? st.chapter : 1) : 1;
  const answered = st?.answered ?? 0;
  const d = today();
  const canWrite = journeyDay(d) !== null && !store.getDay(d).journey?.answer;
  const page = openJournalPage({
    eyebrow: 'Revenir à moi',
    title: 'Mes pages',
    sub: answered ? `${answered} page${answered > 1 ? 's' : ''} gardée${answered > 1 ? 's' : ''}` : 'Ton carnet t’attend',
    path: chapterPath(last, CHAPTER_TITLES),
    meta: ['Par chapitre', 'Sur ton téléphone'],
    body: [
      ...Array.from({ length: last }, (_, i) => last - i).map((idx, k) => chapterPages(idx, k === 0)),
      h('p', { class: 'jn-whisper' }, 'Tes réponses restent sur ton téléphone (et dans ta sauvegarde chiffrée si elle est active).'),
    ],
    primary: canWrite ? { label: 'Écrire ma page du jour', run: () => { page.close(); setTimeout(() => openPageSheet(d), 240); } } : { label: 'Fermer', run: () => page.close() },
  });
}
