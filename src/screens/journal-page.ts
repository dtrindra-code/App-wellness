// "Ma page du jour": the evening page of the journal, in the shared template
// (journal-shell): ink cover (Jour n/60, chapter, the 4-chapter path), then the cream
// page: theme, the big italic question, quick chips, the writing area on notebook
// lines (always visible), the follow-up questions, an optional emotion, the tip as a
// whisper, "Garder ma page" / "Passer". Opened from the ink card on Today.
// Saving happens per question while typing (debounced) and on blur, so closing the
// page never loses a word.

import { store } from '../store';
import { h, toast } from '../lib/ui';
import { fmtLong } from '../lib/dates';
import {
  JOURNEY_DAYS, promptOn, answerText, saveQuestion, toggleAnswerChip, skipPage, unskipPage, isAnswered, dayInChapter, chapterInfo, chapterOf,
} from '../lib/journey';
import { CHAPTERS } from '../data/journey';
import { openModuleOpening, openChapterOpening } from './journal-science';
import { emotionPicker } from './journal-emotions';
import { openJournalPage, chapterPath, whisper } from './journal-shell';
import type { JournalPage } from './journal-shell';

type Prompt = NonNullable<ReturnType<typeof promptOn>>;

const SAVE_MS = 600;

/** Grow a textarea with its content (never below its CSS min-height). */
export function autoGrow(ta: HTMLTextAreaElement) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.max(ta.scrollHeight, 0)}px`; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
}

/** A textarea on notebook lines that saves itself (debounced while typing, at once on blur). */
export function savingTextarea(o: { value: string; label: string; placeholder?: string; rows?: number; cls?: string; save: (v: string) => void }): HTMLTextAreaElement {
  let timer: number | undefined;
  let last = o.value;
  const flush = () => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    if (ta.value !== last) { last = ta.value; o.save(ta.value); }
  };
  const ta = h('textarea', {
    class: 'jn-lines ' + (o.cls ?? ''), rows: o.rows ?? 4, placeholder: o.placeholder ?? 'Quelques mots, si tu veux…',
    'aria-label': o.label, value: o.value,
    oninput: () => { if (timer !== undefined) clearTimeout(timer); timer = window.setTimeout(flush, SAVE_MS); },
    onblur: flush,
  });
  autoGrow(ta);
  return ta;
}

/** Wrapping chips (44 px), toggled in place. */
export function jnChips(list: string[], isOn: (c: string) => boolean, onToggle: (c: string, on: boolean) => void, label = 'Réponses rapides (facultatif)'): HTMLElement {
  return h('div', { class: 'jn-chips', role: 'group', 'aria-label': label },
    list.map((c) => {
      const btn = h('button', {
        class: 'jn-chip' + (isOn(c) ? ' on' : ''), type: 'button', 'aria-pressed': isOn(c) ? 'true' : 'false',
        onclick: () => {
          const on = !btn.classList.contains('on');
          btn.classList.toggle('on', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
          onToggle(c, on);
        },
      }, c);
      return btn;
    }));
}

function moduleLine(pr: Prompt): HTMLElement | null {
  const m = pr.module;
  if (!m) return null;
  return h('div', { class: 'jn-module' },
    h('span', { class: 'jn-module-l' }, `Module · ${m.title} · étape ${m.step}/${m.of}`),
    m.stepTitle !== pr.title ? h('span', { class: 'jn-module-step' }, m.stepTitle) : null,
    h('button', { class: 'jn-link', type: 'button', onclick: () => openModuleOpening(m.key) },
      m.step === 1 ? 'Commencer par « Comprendre l’anxiété » ›' : 'Relire « Comprendre l’anxiété » ›'),
  );
}

/** Day 1 of a chapter: its quote, intro and the "Comprendre" page. */
function chapterIntro(pr: Prompt): HTMLElement | null {
  if (dayInChapter(pr.day) !== 1) return null;
  const ch = chapterInfo(chapterOf(pr.day));
  return h('section', { class: 'jn-intro', 'aria-label': `Chapitre ${ch.index}` },
    h('span', { class: 'jn-meta-l' }, `Nouveau chapitre · ${ch.subtitle}`),
    h('blockquote', { class: 'jn-quote-line' }, `« ${ch.quote.text} »`, ch.quote.author ? h('span', { class: 'jn-quote-by' }, ch.quote.author) : null),
    h('p', { class: 'jn-text' }, ch.intro),
    h('button', { class: 'jn-link', type: 'button', onclick: () => openChapterOpening(ch.index) }, `Lire « ${ch.understand.title} » ›`),
  );
}

/** The questions of the day: the first one big, with chips; the next ones smaller. */
export function pageEditor(date: string, pr: Prompt): HTMLElement {
  const a = store.getDay(date).journey?.answer;
  const chips = new Set(a && !a.skipped ? a.chips ?? [] : []);
  const qs = pr.questions?.length ? pr.questions : [{ q: pr.question, chips: pr.chips }];
  const many = qs.length > 1;
  return h('div', { class: 'jn-qs' },
    qs.map((q, i) => h('div', { class: 'jn-q-block' + (i ? ' next' : '') },
      h('p', { class: i === 0 ? 'jn-q' : 'jn-q2', id: `jn-q-${date}-${i}` },
        many ? h('span', { class: 'jn-n', 'aria-hidden': 'true' }, `${i + 1}.`) : null, many ? ' ' : null, q.q),
      i === 0 && q.chips?.length ? jnChips(q.chips, (c) => chips.has(c), (c) => toggleAnswerChip(date, c)) : null,
      savingTextarea({ value: answerText(a, i), label: q.q, rows: i === 0 ? 4 : 3, cls: i ? 'short' : '', save: (v) => saveQuestion(date, i, v) }),
    )),
  );
}

/** Optional emotion, at the end of the page (repaints itself on pick). */
function emotionBlock(date: string): HTMLElement {
  const wrap = h('div', { class: 'jn-emo' });
  const paint = () => wrap.replaceChildren(
    h('p', { class: 'jn-q2' }, 'Et ton émotion du jour ? ', h('span', { class: 'jn-opt' }, 'facultatif')),
    emotionPicker(date, () => setTimeout(paint, 0)),
  );
  paint();
  return wrap;
}

function pageBody(date: string, pr: Prompt): Node[] {
  const day = store.getDay(date);
  const head = [chapterIntro(pr), h('h2', { class: 'jn-theme' }, pr.title), moduleLine(pr)];
  if (day.journey?.answer?.skipped) {
    return [
      ...head,
      h('p', { class: 'jn-text' }, 'Passée aujourd’hui. C’est ok, la page t’attendra.'),
    ].filter((x): x is HTMLElement => !!x);
  }
  return [
    ...head,
    pageEditor(date, pr),
    emotionBlock(date),
    pr.tip ? whisper(pr.tip) : null,
  ].filter((x): x is HTMLElement => !!x);
}

/** The full page of `date`. */
export function openPageSheet(date: string) {
  const pr = promptOn(date);
  if (!pr) return;
  const ch = chapterInfo(chapterOf(pr.day));
  const meta: [string, string] = [fmtLong(date), '2 min'];
  const blur = () => (document.activeElement as HTMLElement | null)?.blur();

  const actions = (): Pick<Parameters<typeof openJournalPage>[0], 'primary' | 'secondary'> => {
    if (store.getDay(date).journey?.answer?.skipped) {
      return {
        primary: { label: 'Y répondre quand même', run: () => { unskipPage(date); repaint(); } },
        secondary: { label: 'Fermer', run: () => page.close() },
      };
    }
    return {
      primary: {
        label: 'Garder ma page',
        run: () => {
          blur();
          if (!isAnswered(store.getDay(date))) {
            page.close();
            toast('Ta page t’attend, quand tu veux.');
            return;
          }
          toast('Gardée. Merci pour toi.');
          void page.celebrate().then(() => page.close());
        },
      },
      secondary: isAnswered(store.getDay(date))
        ? null
        : { label: 'Passer', run: () => { blur(); skipPage(date); page.close(); toast('Passée. À demain, en douceur.'); } },
    };
  };
  const repaint = () => { page.update({ body: pageBody(date, pr), ...actions() }); page.toTop(); };

  const page: JournalPage = openJournalPage({
    eyebrow: `Revenir à moi · Jour ${pr.day} / ${JOURNEY_DAYS}`,
    title: 'Ma page du jour',
    sub: `Chapitre ${ch.index} — ${ch.title}`,
    path: chapterPath(ch.index, CHAPTERS.map((c) => c.title)),
    meta,
    body: [],
    onClose: blur,
  });
  page.update({ body: pageBody(date, pr), ...actions() });
}
