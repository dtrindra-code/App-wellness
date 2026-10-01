// "Ma page du jour": the evening page of the journal, on lined paper. 2–3 short
// questions, each with its own textarea (auto-grow, saved while typing and on blur),
// optional quick chips on the first, "Passer". Shown inline on Today (CE SOIR) and as
// a full sheet. Days 30 and 60 show their checkpoint instead (journal-checkpoints).
// Saving happens per question; the app defers its re-render while a field is focused,
// so typing is never interrupted.

import { store } from '../store';
import { h, openSheet, toast } from '../lib/ui';
import {
  promptOn, answerText, saveQuestion, toggleAnswerChip, skipPage, unskipPage, isAnswered,
} from '../lib/journey';
import { openModuleOpening } from './journal-science';

const kids = (...xs: (Node | null | undefined | false)[]): Node[] => xs.filter((x): x is Node => !!x);
type Prompt = NonNullable<ReturnType<typeof promptOn>>;

const SAVE_MS = 600;

/** Grow a textarea with its content. */
export function autoGrow(ta: HTMLTextAreaElement) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.max(ta.scrollHeight, 0)}px`; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
}

/** A textarea that saves itself (debounced while typing, at once on blur). */
export function savingTextarea(o: { value: string; label: string; placeholder?: string; rows?: number; cls?: string; save: (v: string) => void }): HTMLTextAreaElement {
  let timer: number | undefined;
  let last = o.value;
  const flush = () => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    if (ta.value !== last) { last = ta.value; o.save(ta.value); }
  };
  const ta = h('textarea', {
    class: 'jp-ta ' + (o.cls ?? ''), rows: o.rows ?? 2, placeholder: o.placeholder ?? 'Quelques mots suffisent…',
    'aria-label': o.label, value: o.value,
    oninput: () => { if (timer !== undefined) clearTimeout(timer); timer = window.setTimeout(flush, SAVE_MS); },
    onblur: flush,
  });
  autoGrow(ta);
  return ta;
}

function moduleLine(pr: Prompt, compact: boolean): HTMLElement | null {
  const m = pr.module;
  if (!m) return null;
  return h('div', { class: 'jp-module' },
    h('span', { class: 'eyebrow' }, `Module · ${m.title} · étape ${m.step}/${m.of}`),
    m.stepTitle !== pr.title ? h('span', { class: 'jp-module-step' }, m.stepTitle) : null,
    m.step === 1 || !compact
      ? h('button', { class: 'dc-link', type: 'button', style: 'align-self:flex-start', onclick: () => openModuleOpening(m.key) },
          m.step === 1 ? 'Commencer par « Comprendre l’anxiété » ›' : 'Relire « Comprendre l’anxiété » ›')
      : null,
  );
}

/** The questions of the day on lined paper. */
export function pageEditor(date: string, pr: Prompt): HTMLElement {
  const a = store.getDay(date).journey?.answer;
  const chips = new Set(a && !a.skipped ? a.chips ?? [] : []);
  const qs = pr.questions?.length ? pr.questions : [{ q: pr.question, chips: pr.chips }];
  return h('div', { class: 'jp-paper lined' },
    qs.map((q, i) => {
      const chipRow = i === 0 && q.chips?.length
        ? h('div', { class: 'jr-chips jp-chips', role: 'group', 'aria-label': 'Réponses rapides (facultatif)' },
            q.chips.map((c) => {
              const btn = h('button', {
                class: 'jr-chip' + (chips.has(c) ? ' on' : ''), type: 'button', 'aria-pressed': chips.has(c) ? 'true' : 'false',
                onclick: () => {
                  const on = !chips.has(c);
                  if (on) chips.add(c); else chips.delete(c);
                  btn.classList.toggle('on', on);
                  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                  toggleAnswerChip(date, c);
                },
              }, c);
              return btn;
            }))
        : null;
      return h('div', { class: 'jp-q-block' },
        h('p', { class: 'jp-q', id: `jp-q-${date}-${i}` }, h('span', { class: 'jp-n num' }, `${i + 1}.`), ' ', q.q),
        chipRow,
        savingTextarea({ value: answerText(a, i), label: q.q, save: (v) => saveQuestion(date, i, v) }),
      );
    }),
  );
}

function pageHead(pr: Prompt): HTMLElement[] {
  return [
    h('div', { class: 'jp-head' },
      h('span', { class: 'eyebrow' }, `Ma page du jour · Jour ${pr.day}`),
      pr.themeLabel ? h('span', { class: 'jp-theme' }, pr.themeLabel) : null),
    h('h3', { class: 'jr-title jp-title' }, pr.title),
  ];
}

/** CE SOIR: the page, editable in place. */
export function journeyPageCard(date: string, rerender: () => void): HTMLElement | null {
  const pr = promptOn(date);
  if (!pr) return null;
  const day = store.getDay(date);
  const a = day.journey?.answer;
  const card = h('section', { class: 'card ux solo jr-card jp-card', 'aria-label': 'Ma page du jour' }, ...pageHead(pr), moduleLine(pr, true));
  if (a?.skipped) {
    card.append(
      h('p', { class: 'small muted' }, 'Passée aujourd’hui. C’est ok, la page t’attendra.'),
      h('button', { class: 'dc-link', style: 'align-self:flex-start', type: 'button', onclick: () => { unskipPage(date); rerender(); } }, 'Y répondre quand même'),
    );
    return card;
  }
  const written = isAnswered(day);
  card.append(...kids(
    pageEditor(date, pr),
    pr.tip ? h('p', { class: 'small muted jr-tip' }, pr.tip) : null,
    h('div', { class: 'row between jp-foot' },
      written
        ? h('span', { class: 'small muted' }, '✓ Gardé sur ton téléphone')
        : h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { skipPage(date); toast('Passée. À demain, en douceur.'); } }, 'Passer'),
      h('button', { class: 'dc-link', type: 'button', onclick: () => openPageSheet(date) }, 'Ouvrir en grand ›')),
  ));
  return card;
}

/** Full-screen page. */
export function openPageSheet(date: string) {
  const pr = promptOn(date);
  if (!pr) return;
  const body = h('div', { class: 'stack jp-sheet' },
    ...pageHead(pr),
    moduleLine(pr, false),
    pageEditor(date, pr),
    pr.tip ? h('p', { class: 'small muted jr-tip' }, pr.tip) : null,
    h('p', { class: 'small muted' }, 'Deux ou trois lignes suffisent. Tout est gardé au fur et à mesure.'),
    h('button', { class: 'btn primary block', type: 'button', onclick: () => {
      (document.activeElement as HTMLElement | null)?.blur();
      sheet.close();
      if (isAnswered(store.getDay(date))) toast('C’est écrit. Merci pour toi.');
    } }, 'C’est écrit'),
  );
  const sheet = openSheet('Ma page du jour', body);
}
