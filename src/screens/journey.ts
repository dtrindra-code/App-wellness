// "Revenir à moi" on Aujourd'hui: the invite (until she starts), the morning card
// (Jour N/60 · chapter intro on day 1 · 30 s check-in: energy + needs), the
// engagements as one-tap chips (+ joker), the journal prompt of the evening and the
// chapter recap on day 15. Also the sheets shared with Équilibre: start flow, rules
// editor, chapter recap / journal history.
// Pure render functions: they read the store, never subscribe to it. Drafts live in
// module variables so a re-render never loses what she is typing.

import { store } from '../store';
import { h, openSheet, toast, iconCircle, ICON, bar, disclosure } from '../lib/ui';
import { addDays, fmtDayMonth, fmtShort, today } from '../lib/dates';
import {
  JOURNEY_DAYS, CHAPTER_DAYS, JOKERS_PER_WEEK, MAX_NEEDS,
  journeyOf, journeyStatus, journeyDay, chapterOf, dayInChapter, chapterInfo, rulesOn, ruleDef, ruleDone, autoDone,
  dayScore, jokersLeft, setJoker, toggleRule, energyOf, setEnergy, toggleNeed, promptOn, saveAnswer,
  startJourney, changeRules, stopJourney, chapterRecap, besoinDe, journeyStats,
} from '../lib/journey';
import type { ChapterRecap } from '../lib/journey';
import { DEFAULT_RULES, NEEDS, RULES } from '../data/journey';
import type { NeedKey } from '../data/journey';
import { markDone, popCls } from './today-shared';

// ---------- transient UI state ----------
const INVITE_KEY = 'cap-maldives:journey-invite';
/** Journal drafts by date (chips + text), kept across re-renders. */
const drafts = new Map<string, { chips: Set<string>; text: string }>();
/** Dates whose answer is being edited again. */
const editing = new Set<string>();
/** Dates whose check-in is open (being answered or changed): it folds on « C’est noté ». */
const checkinEdit = new Set<string>();

export const ENERGY_LABELS = ['À plat', 'Basse', 'Moyenne', 'Bonne', 'Pleine'] as const;

const check = () => h('span', { class: 'jr-check', 'aria-hidden': 'true' }, '✓');

// ---------- invite (not started) ----------

function inviteHiddenUntil(): string | null {
  try { return localStorage.getItem(INVITE_KEY); } catch { return null; }
}

/** Today card while the journey is not started (hidden 7 days after "Plus tard"). */
export function journeyInviteCard(date: string): HTMLElement | null {
  if (journeyStatus(date, store.profile) !== 'none') return null;
  const until = inviteHiddenUntil();
  if (until && date < until) return null;
  return h('section', { class: 'card ux solo jr-invite paper', 'aria-label': 'Revenir à moi' },
    h('span', { class: 'eyebrow' }, 'Nouveau · 60 jours'),
    h('h3', { class: 'jr-title' }, 'Revenir à moi'),
    h('p', { class: 'italic jr-sub' }, '5 minutes par jour, rien que pour toi.'),
    h('div', { class: 'row', style: 'gap:8px' },
      h('button', { class: 'btn primary grow', type: 'button', onclick: () => openJourneyStart() }, 'Découvrir'),
      h('button', {
        class: 'btn ghost', type: 'button',
        onclick: (e: Event) => {
          try { localStorage.setItem(INVITE_KEY, addDays(date, 7)); } catch { /* ignore */ }
          (e.currentTarget as HTMLElement).closest('.jr-invite')?.remove();
        },
      }, 'Plus tard'),
    ),
  );
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
    h('p', { class: 'italic jr-sub' }, '60 jours pour te retrouver, 5 minutes par jour maximum.'),
    h('ul', { class: 'jr-lines' },
      h('li', null, 'Chaque matin : ton énergie et ton besoin du jour, en 30 secondes.'),
      h('li', null, 'Dans la journée : 5 petits engagements doux. 4 sur 5, c’est une journée réussie.'),
      h('li', null, 'Le soir : une question pour toi. Tu réponds en un tap, ou tu passes.'),
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

// ---------- morning: Jour N/60 + check-in ----------

function dayEyebrow(n: number): string {
  return `Revenir à moi · Jour ${n}/${JOURNEY_DAYS} · Chapitre ${chapterOf(n)}`;
}

/** CE MATIN: compact journey card. Upcoming: one line; active: chapter intro (day 1) + check-in. */
export function journeyMorningCard(date: string, rerender: () => void): HTMLElement | null {
  const p = store.profile;
  const st = journeyStatus(date, p);
  const j = journeyOf(p);
  if (st === 'upcoming' && j) {
    return h('section', { class: 'card ux solo jr-card' },
      h('span', { class: 'eyebrow' }, 'Revenir à moi'),
      h('p', { class: 'small' }, j.startDate === addDays(date, 1) ? 'Ça commence demain. Rien à préparer : je te guide.' : `Ça commence le ${fmtDayMonth(j.startDate)}.`),
    );
  }
  const n = journeyDay(date, p);
  if (n === null) return null;
  const day = store.getDay(date);
  const ch = chapterInfo(chapterOf(n));
  const dic = dayInChapter(n);
  const energy = energyOf(day);
  const fromMood = day.journey?.energy === undefined && energy !== undefined;
  const needs = day.journey?.needs ?? [];
  const answered = energy !== undefined && needs.length > 0 && !checkinEdit.has(date);

  const card = h('section', { class: 'card ux jr-card', 'aria-label': 'Revenir à moi' },
    h('span', { class: 'eyebrow' }, dayEyebrow(n)),
  );
  if (dic === 1) {
    card.append(h('div', { class: 'jr-intro paper' },
      h('span', { class: 'eyebrow' }, `Chapitre ${ch.index}`),
      h('h3', { class: 'jr-title' }, ch.title),
      ch.subtitle ? h('p', { class: 'italic jr-sub' }, ch.subtitle) : null,
      h('p', { class: 'small' }, ch.intro),
    ));
  } else {
    card.append(h('div', { class: 'jr-chap-line' },
      h('span', { class: 'jr-chap-name' }, ch.title),
      h('span', { class: 'small muted num' }, `jour ${dic}/${CHAPTER_DAYS}`)));
  }

  if (answered) {
    card.append(h('div', { class: 'jr-ci-done' },
      iconCircle(ICON.heart),
      h('span', { class: 'jr-ci-text' },
        h('span', { class: 'info-title' }, `Énergie ${ENERGY_LABELS[(energy as number) - 1].toLowerCase()}`),
        h('span', { class: 'info-detail' }, needs.map((k) => besoinDe(k)).join(' · '))),
      h('button', { class: 'dc-link', type: 'button', onclick: () => { checkinEdit.add(date); rerender(); } }, 'Changer'),
    ));
    return card;
  }

  card.append(h('div', { class: 'stack jr-ci', style: 'gap:10px' },
    h('p', { class: 'dc-q' }, 'Ton énergie ce matin ?'),
    h('div', { class: 'jr-energy', role: 'group', 'aria-label': 'Ton énergie, de 1 à 5' },
      ENERGY_LABELS.map((label, i) => {
        const on = energy === i + 1;
        return h('button', {
          class: 'jr-en' + (on ? ' on' : '') + popCls(`jr-en-${i + 1}`), type: 'button', 'aria-pressed': on ? 'true' : 'false', 'aria-label': `${i + 1} : ${label}`,
          onclick: () => { markDone(`jr-en-${i + 1}`); checkinEdit.add(date); setEnergy(date, i + 1); },
        }, h('span', { class: 'jr-en-dot num' }, String(i + 1)), h('span', { class: 'jr-en-label' }, label));
      })),
    fromMood ? h('p', { class: 'small muted' }, 'Repris de ton humeur du matin. Change si besoin.') : null,
    h('p', { class: 'dc-q' }, 'De quoi as-tu besoin aujourd’hui ?'),
    h('div', { class: 'jr-chips', role: 'group', 'aria-label': `Ton besoin du jour, ${MAX_NEEDS} au plus` },
      NEEDS.map((x) => {
        const on = needs.includes(x.key);
        return h('button', {
          class: 'jr-chip' + (on ? ' on' : '') + popCls(`jr-need-${x.key}`), type: 'button', 'aria-pressed': on ? 'true' : 'false',
          onclick: () => {
            markDone(`jr-need-${x.key}`);
            checkinEdit.add(date);
            if (!toggleNeed(date, x.key as NeedKey)) toast(`${MAX_NEEDS} besoins au plus : garde l’essentiel`);
          },
        }, on ? check() : null, x.label);
      })),
    checkinEdit.has(date) && energy !== undefined && needs.length
      ? h('button', { class: 'dc-link', style: 'align-self:flex-end', type: 'button', onclick: () => { checkinEdit.delete(date); rerender(); } }, 'C’est noté')
      : null,
  ));
  return card;
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

/** TA JOURNÉE / CE SOIR: the day's engagements as one-tap chips, auto ones already ticked, joker. */
export function journeyRulesCard(date: string): HTMLElement | null {
  const n = journeyDay(date);
  if (n === null) return null;
  const day = store.getDay(date);
  const rules = rulesOn(date);
  const sc = dayScore(date);
  const left = jokersLeft(date);
  const status = sc.joker
    ? 'Joker utilisé : journée réussie quand même.'
    : sc.success
      ? sc.done === sc.total ? 'Tout est coché. Journée réussie.' : 'Journée réussie.'
      : `Encore ${sc.need - sc.done} pour une journée réussie.`;

  return h('section', { class: 'card ux jr-card jr-rules' + (sc.success ? ' ok' : ''), 'aria-label': 'Tes engagements du jour' },
    h('div', { class: 'jr-rules-head' },
      h('span', { class: 'eyebrow' }, 'Tes engagements'),
      h('span', { class: 'num jr-score' }, `${sc.done}/${sc.total}`),
    ),
    bar(sc.total ? sc.done / sc.total : 0, sc.success ? 'good' : 'accent'),
    h('div', { class: 'jr-chips', role: 'group', 'aria-label': 'Engagements du jour' },
      rules.map((k) => {
        const r = ruleDef(k);
        const on = ruleDone(k, day);
        const auto = autoDone(k, day) && (r?.auto === 'move' || r?.auto === 'water');
        return h('button', {
          class: 'jr-chip jr-rule' + (on ? ' on' : '') + (auto ? ' auto' : '') + popCls(`jr-rule-${k}`), type: 'button',
          'aria-pressed': on ? 'true' : 'false', title: r?.detail ?? r?.label ?? k,
          onclick: () => {
            markDone(`jr-rule-${k}`);
            if (!toggleRule(date, k)) toast('Compté tout seul d’après ta journée');
          },
        }, on ? check() : null, r?.label ?? k, auto ? h('span', { class: 'jr-auto-tag' }, 'auto') : null);
      })),
    h('p', { class: 'small jr-status' }, status),
    sc.joker
      ? h('button', { class: 'dc-link', style: 'align-self:center', type: 'button', onclick: () => setJoker(date, false) }, 'Rendre le joker')
      : !sc.success
        ? left > 0
          ? h('button', { class: 'dc-link', style: 'align-self:center', type: 'button', onclick: () => { if (setJoker(date, true)) toast('Joker posé. Prends soin de toi.'); } },
              `Utiliser un joker (${left} restant${left > 1 ? 's' : ''} cette semaine)`)
          : h('p', { class: 'small muted', style: 'text-align:center' }, 'Plus de joker cette semaine : ce n’est pas grave, rien ne se remet à zéro.')
        : null,
  );
}

// ---------- journal prompt ----------

function draftFor(date: string) {
  let d = drafts.get(date);
  if (!d) {
    const a = store.getDay(date).journey?.answer;
    d = { chips: new Set(a && !a.skipped ? a.chips : []), text: a?.text ?? '' };
    drafts.set(date, d);
  }
  return d;
}

/** CE SOIR: the question of the day (chips + optional text + Passer). */
export function journeyPromptCard(date: string, rerender: () => void): HTMLElement | null {
  const pr = promptOn(date);
  if (!pr) return null;
  const a = store.getDay(date).journey?.answer;
  const head = [
    h('span', { class: 'eyebrow' }, `Ta page du jour · Jour ${pr.day}`),
    h('h3', { class: 'jr-title' }, pr.title),
  ];

  if (a && !editing.has(date)) {
    if (a.skipped) {
      return h('section', { class: 'card ux solo jr-card jr-prompt' }, ...head,
        h('p', { class: 'small muted' }, 'Passée aujourd’hui. C’est ok, la question t’attendra.'),
        h('button', { class: 'dc-link', style: 'align-self:flex-start', type: 'button', onclick: () => { editing.add(date); drafts.delete(date); rerender(); } }, 'Y répondre quand même'),
      );
    }
    return h('section', { class: 'card ux solo jr-card jr-prompt done' }, ...head,
      h('p', { class: 'jr-q' }, pr.question),
      a.chips.length ? h('div', { class: 'jr-chips' }, a.chips.map((c) => h('span', { class: 'jr-chip on static' }, c))) : null,
      a.text ? h('p', { class: 'jr-answer' }, a.text) : null,
      h('div', { class: 'row between' },
        h('span', { class: 'small muted' }, 'Gardé sur ton téléphone.'),
        h('button', { class: 'dc-link', type: 'button', onclick: () => { editing.add(date); drafts.delete(date); rerender(); } }, 'Modifier')),
    );
  }

  const d = draftFor(date);
  const chipsWrap = h('div', { class: 'jr-chips', role: 'group', 'aria-label': 'Réponses rapides' });
  const paintChips = () => chipsWrap.replaceChildren(...pr.chips.map((c) => {
    const on = d.chips.has(c);
    return h('button', {
      class: 'jr-chip' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
      onclick: () => { if (on) d.chips.delete(c); else d.chips.add(c); paintChips(); },
    }, on ? check() : null, c);
  }));
  paintChips();
  const ta = h('textarea', {
    class: 'input jr-text', rows: 3, placeholder: 'Si tu veux, quelques mots…', 'aria-label': pr.question,
    value: d.text, oninput: (e: Event) => { d.text = (e.target as HTMLTextAreaElement).value; },
  });
  const save = () => {
    const text = d.text.trim();
    if (!d.chips.size && !text) { toast('Choisis une réponse ou écris un mot. Ou passe, c’est ok.'); return; }
    editing.delete(date);
    drafts.delete(date);
    saveAnswer(date, { chips: [...d.chips], ...(text ? { text } : {}) });
    toast('C’est écrit. Merci pour toi.');
  };
  const skip = () => { editing.delete(date); drafts.delete(date); saveAnswer(date, { chips: [], skipped: true }); };

  return h('section', { class: 'card ux solo jr-card jr-prompt' }, ...head,
    h('p', { class: 'jr-q' }, pr.question),
    chipsWrap,
    disclosure('Écrire quelques mots (facultatif)', () => ta, `jr-ta-${date}`, 'Replier'),
    pr.tip ? h('p', { class: 'small muted jr-tip' }, pr.tip) : null,
    h('div', { class: 'jr-actions' },
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Enregistrer'),
      h('button', { class: 'btn ghost', type: 'button', onclick: skip }, 'Passer'),
    ),
  );
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
  return h('div', { class: 'stack', style: 'gap:10px' },
    h('p', { class: 'small' }, `${r.success} jour${r.success > 1 ? 's' : ''} réussi${r.success > 1 ? 's' : ''} · ${r.entries.length} page${r.entries.length > 1 ? 's' : ''} écrite${r.entries.length > 1 ? 's' : ''}`),
    r.energy.some((v) => v !== null) ? energyBars(r.energy) : null,
    r.trend ? h('p', { class: 'small' }, TREND[r.trend]) : null,
    r.topNeeds.length
      ? h('div', { class: 'stack', style: 'gap:6px' },
          h('span', { class: 'eyebrow' }, 'Tes besoins les plus notés'),
          h('div', { class: 'jr-chips' }, r.topNeeds.map((x) => h('span', { class: 'jr-chip static' }, `${x.label} · ${x.count}`))))
      : null,
  );
}

export function entryView(e: { day: number; date: string; title: string; question: string; chips: string[]; text?: string }): HTMLElement {
  return h('article', { class: 'jr-entry' },
    h('div', { class: 'jr-entry-head' },
      h('span', { class: 'eyebrow' }, `Jour ${e.day} · ${fmtShort(e.date)}`)),
    h('p', { class: 'jr-entry-q' }, e.question),
    e.chips.length ? h('p', { class: 'small' }, e.chips.join(' · ')) : null,
    e.text ? h('p', { class: 'jr-answer' }, e.text) : null,
  );
}

/** CE SOIR on chapter day 15 (and the day after the last day): what this chapter said. */
export function journeyRecapCard(date: string): HTMLElement | null {
  const n = journeyDay(date);
  if (n === null || dayInChapter(n) !== CHAPTER_DAYS) return null;
  const idx = chapterOf(n);
  const r = chapterRecap(idx, date);
  if (!r) return null;
  const ch = chapterInfo(idx);
  return h('section', { class: 'card ux solo jr-card jr-recap paper', 'aria-label': `Fin du chapitre ${idx}` },
    h('span', { class: 'eyebrow' }, `Fin du chapitre ${idx}`),
    h('h3', { class: 'jr-title' }, ch.title),
    recapBody(r),
    ch.recapPrompt ? h('p', { class: 'italic jr-sub' }, ch.recapPrompt) : null,
    h('button', { class: 'btn block', type: 'button', onclick: () => openChapterSheet(idx) }, 'Relire mes pages'),
  );
}

/** Pages of one chapter, with its recap. */
export function openChapterSheet(idx: number) {
  const r = chapterRecap(idx);
  const ch = chapterInfo(idx);
  const body = h('div', { class: 'stack' },
    ch.subtitle ? h('p', { class: 'italic jr-sub' }, ch.subtitle) : null,
    r ? recapBody(r) : null,
    r && r.entries.length
      ? h('div', { class: 'stack', style: 'gap:10px' }, r.entries.map(entryView))
      : h('p', { class: 'small muted' }, 'Pas encore de page écrite dans ce chapitre.'),
  );
  openSheet(`Chapitre ${idx} · ${ch.title}`, body);
}

/** All chapters (Équilibre → "Mes pages"). */
export function openJournalSheet() {
  const st = journeyStats();
  const last = st ? (st.day >= 1 ? st.chapter : 1) : 1;
  const body = h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, 'Tes réponses restent sur ton téléphone (et dans ta sauvegarde chiffrée si elle est active).'),
    ...Array.from({ length: last }, (_, i) => last - i).map((idx) => {
      const ch = chapterInfo(idx);
      const r = chapterRecap(idx);
      return h('div', { class: 'jr-chap-block' },
        h('h3', null, `Chapitre ${idx} · ${ch.title}`),
        r ? recapBody(r) : null,
        disclosure(`Lire mes pages (${r?.entries.length ?? 0})`, () => (r && r.entries.length
          ? h('div', { class: 'stack', style: 'gap:10px' }, r.entries.map(entryView))
          : h('p', { class: 'small muted' }, 'Pas encore de page écrite ici.')), `jr-ch-${idx}`, 'Replier'),
      );
    }),
  );
  openSheet('Mes pages', body);
}
