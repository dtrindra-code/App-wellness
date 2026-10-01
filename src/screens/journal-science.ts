// Reading pages of the journal: the chapter / module openings (quote on crumpled
// paper, "Comprendre…" page, clipped card "À relire quand ça monte"), the list of
// every reread card (Équilibre, the slip sheet), and "Ce que disent les études".

import { h, openSheet, clipSticker } from '../lib/ui';
import { CHAPTERS, MODULES, SCIENCE } from '../data/journey';
import type { JourneyChapter, JourneyModule, JourneyQuote, RereadCard, UnderstandPage } from '../data/journey';

/** Quote page: crumpled paper, Playfair italic. */
export function quotePage(q: JourneyQuote, eyebrow?: string): HTMLElement {
  return h('figure', { class: 'jn-quote paper' },
    eyebrow ? h('span', { class: 'eyebrow' }, eyebrow) : null,
    h('blockquote', { class: 'jn-quote-text' }, `« ${q.text} »`),
    q.author ? h('figcaption', { class: 'jn-quote-author' }, q.author) : null,
  );
}

/** Clipped card "À relire quand ça monte". */
export function rereadCard(r: RereadCard, from?: string): HTMLElement {
  return h('section', { class: 'jn-reread', 'aria-label': r.title },
    clipSticker('jn-clip'),
    h('h3', { class: 'jn-reread-title' }, r.title),
    from ? h('p', { class: 'jn-reread-from' }, from) : null,
    h('ul', { class: 'jn-reread-lines' }, r.lines.map((l) => h('li', null, l))),
  );
}

export function understandPage(u: UnderstandPage): HTMLElement {
  return h('section', { class: 'jn-understand lined' },
    h('h3', { class: 'jn-understand-title' }, u.title),
    u.paragraphs.map((p) => h('p', null, p)),
  );
}

type Opening = Pick<JourneyChapter, 'quote' | 'understand' | 'reread'> & { title: string; intro: string; eyebrow: string; steps?: string[] };

function openingFrom(x: JourneyChapter | JourneyModule): Opening {
  if ('index' in x) return { ...x, eyebrow: `Chapitre ${x.index}` };
  return { ...x, eyebrow: 'Module' };
}

/** Opening of a chapter or module: quote → intro → Comprendre → À relire. */
export function openOpening(x: JourneyChapter | JourneyModule) {
  const o = openingFrom(x);
  const body = h('div', { class: 'stack jn-opening' },
    quotePage(o.quote, o.eyebrow),
    h('p', { class: 'italic jr-sub' }, o.intro),
    o.steps?.length
      ? h('ol', { class: 'jn-steps' }, o.steps.map((st, i) => h('li', null, h('span', { class: 'num' }, `Jour ${i + 1}`), ' ', st)))
      : null,
    understandPage(o.understand),
    rereadCard(o.reread),
    h('p', { class: 'small muted', style: 'text-align:center' }, 'Tu retrouves cette carte dans Équilibre → Revenir à moi → À relire.'),
  );
  openSheet(o.title, body);
}

export function openChapterOpening(index: number) {
  const ch = CHAPTERS.find((c) => c.index === index) ?? CHAPTERS[0];
  openOpening(ch);
}

export function openModuleOpening(key: string) {
  const m = MODULES.find((x) => x.key === key);
  if (m) openOpening(m);
}

/** Every reread card: chapters and modules. */
export function openRereadSheet() {
  const body = h('div', { class: 'stack jn-reread-list' },
    h('p', { class: 'small muted' }, 'Quelques phrases à garder sous la main, pour les moments où ça monte.'),
    CHAPTERS.map((c) => rereadCard(c.reread, `Chapitre ${c.index} · ${c.title}`)),
    MODULES.map((m) => rereadCard(m.reread, `Module · ${m.title}`)),
  );
  openSheet('À relire', body);
}

/** "Ce que disent les études". */
export function openScienceSheet() {
  const sc = SCIENCE;
  const body = h('div', { class: 'stack jn-science' },
    h('p', { class: 'italic jr-sub' }, sc.intro),
    sc.points.map((p) => h('article', { class: 'jn-sci-point' },
      h('h3', { class: 'jn-sci-title' }, p.title),
      h('p', { class: 'small' }, p.text),
      p.source ? h('p', { class: 'jn-sci-src' }, p.source) : null)),
    h('h3', null, 'Les bénéfices concrets pour toi'),
    h('ul', { class: 'jn-benefits' }, sc.benefits.map((b) => h('li', null,
      h('span', { class: 'jr-check', 'aria-hidden': 'true' }, '✓'),
      h('span', null, h('strong', null, b.title), ' : ', b.text)))),
    h('div', { class: 'jn-summary paper' },
      h('span', { class: 'eyebrow' }, 'En résumé'),
      h('p', null, sc.summary)),
    h('p', { class: 'small muted' }, 'Sources citées pour aller plus loin. Les effets observés sont réels mais modestes : écrire aide, sans remplacer un accompagnement quand tu en as besoin.'),
  );
  openSheet(sc.title, body);
}
