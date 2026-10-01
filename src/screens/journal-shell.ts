// The "Revenir à moi" page template, shared by the daily page, Mes pages, the Sunday
// reset, the checkpoints and the garden map: a full-height sheet with an ink "cover"
// (eyebrow, title, italic chapter line, a path of dots) over a cream page (meta line,
// content, a quiet primary action and a text link). In dark mode the page stays on ink.
// Multi-step flows repaint through `update()`; the sheet itself is ui.openSheet
// (variant 'full', class `jn-full`), so focus trap, Escape and focus return come for free.

import { h, openSheet, starSticker } from '../lib/ui';
import type { Child } from '../lib/ui';

export type PathState = 'done' | 'now' | 'next';
export interface PathStep { label?: string; state: PathState }
export interface PageAction { label: string; run: () => void }

export interface JournalPageOpts {
  /** "Revenir à moi · Jour 9 / 60". */
  eyebrow: string;
  /** "Ma page du jour" (28, cream). */
  title: string;
  /** "Chapitre 1 — Me poser" (italic 18). */
  sub?: string;
  /** Dots under the title: chapters, or the steps of a flow. */
  path?: PathStep[];
  /** Small caps line at the top of the page: [left, right], e.g. ["Mercredi 14 octobre", "2 min"]. */
  meta?: [string, string];
  /** Extra node inside the cover, under the path (the garden map). */
  coverExtra?: Node | null;
  body: Child;
  primary?: PageAction | null;
  secondary?: PageAction | null;
  onClose?: () => void;
}

export interface JournalPage {
  close: () => void;
  /** Repaint some parts (multi-step flows). */
  update: (p: Partial<JournalPageOpts>) => void;
  /** Scroll the sheet back to the top. */
  toTop: () => void;
  /** The gold star pops on the page (kept page, finished chapter). Resolves when done. */
  celebrate: () => Promise<void>;
  page: HTMLElement;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function pathView(steps: PathStep[]): HTMLElement {
  const now = steps.findIndex((x) => x.state === 'now');
  const labelled = steps.some((x) => x.label);
  const kids: HTMLElement[] = [];
  steps.forEach((st, i) => {
    if (i > 0) kids.push(h('span', { class: 'jn-seg' + (i <= now || st.state === 'done' ? ' done' : ''), 'aria-hidden': 'true' }));
    kids.push(h('span', { class: `jn-step ${st.state}` + (labelled ? '' : ' bare') },
      h('span', { class: 'jn-dot', 'aria-hidden': 'true' }),
      st.label ? h('span', { class: 'jn-step-l' }, st.label) : null));
  });
  const text = labelled
    ? steps.map((x) => `${x.label}${x.state === 'now' ? ' (en cours)' : x.state === 'done' ? ' (fait)' : ''}`).join(', ')
    : `Étape ${Math.max(1, now + 1)} sur ${steps.length}`;
  return h('div', { class: 'jn-path' + (labelled ? '' : ' bare'), role: 'img', 'aria-label': text }, kids);
}

/** Open a journal page. */
export function openJournalPage(o: JournalPageOpts): JournalPage {
  let cur: JournalPageOpts = { ...o };
  const cover = h('header', { class: 'jn-cover' });
  const page = h('div', { class: 'jn-page' });
  const wrap = h('div', { class: 'jn-sheet' }, cover, page);

  const paint = () => {
    cover.replaceChildren(
      h('div', { class: 'jn-cover-top' },
        h('div', { class: 'jn-cover-text' },
          h('span', { class: 'jn-eyebrow' }, cur.eyebrow),
          h('h1', { class: 'jn-title' }, cur.title),
          cur.sub ? h('p', { class: 'jn-sub' }, cur.sub) : null),
        h('button', { class: 'jn-close', type: 'button', 'aria-label': 'Fermer', onclick: () => sheet.close() },
          h('span', { 'aria-hidden': 'true' }, '×'))),
      ...(cur.path?.length ? [pathView(cur.path)] : []),
      ...(cur.coverExtra ? [cur.coverExtra] : []),
    );
    const body = h('div', { class: 'jn-body' });
    const add = (c: Child) => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else body.append(typeof c === 'object' ? c : document.createTextNode(String(c)));
    };
    add(cur.body);
    page.replaceChildren(
      cur.meta ? h('div', { class: 'jn-meta' }, h('span', null, cur.meta[0]), h('span', null, cur.meta[1])) : '',
      body,
      cur.primary || cur.secondary
        ? h('div', { class: 'jn-actions' },
            cur.primary ? h('button', { class: 'btn jn-primary', type: 'button', onclick: () => cur.primary!.run() }, cur.primary.label) : h('span'),
            cur.secondary ? h('button', { class: 'jn-skip', type: 'button', onclick: () => cur.secondary!.run() }, cur.secondary.label) : null)
        : '',
    );
  };
  paint();

  const sheet = openSheet(o.title, wrap, { variant: 'full', cls: 'jn-full', onClose: o.onClose });
  const scroller = () => sheet.el;

  return {
    page,
    close: () => sheet.close(),
    update: (p) => { cur = { ...cur, ...p }; paint(); },
    toTop: () => { scroller().scrollTop = 0; },
    celebrate: () => new Promise<void>((resolve) => {
      if (reducedMotion()) { resolve(); return; }
      const star = starSticker('jn-star');
      page.append(star);
      setTimeout(() => { resolve(); }, 650);
    }),
  };
}

/** Chapter path (4 dots) for a journey day. */
export function chapterPath(chapter: number, labels: string[]): PathStep[] {
  return labels.map((label, i) => ({ label, state: i + 1 < chapter ? 'done' : i + 1 === chapter ? 'now' : 'next' }));
}

/** Path of `total` dots, the `i`-th (0-based) current. */
export function stepPath(i: number, total: number): PathStep[] {
  return Array.from({ length: total }, (_, k) => ({ state: k < i ? 'done' : k === i ? 'now' : 'next' }));
}

/** The writing area: notebook lines, always visible. */
export function linesClass(extra = ''): string {
  return `jn-lines ${extra}`.trim();
}

/** Soft sentence under the page: a pink rule, Playfair italic. */
export function whisper(text: string): HTMLElement {
  return h('p', { class: 'jn-whisper' }, text);
}
