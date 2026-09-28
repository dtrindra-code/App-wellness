// Tiny DOM helpers shared by all screens. No framework: screens build DOM with h().

export type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { class?: string; style?: string };

/**
 * h('div', {class: 'card', onclick: fn}, 'text', h('span', null, 'x'))
 * - `on*` keys become event listeners
 * - `class`, `style`, `for`, `id`, and `data-*`/`aria-*` become attributes
 * - other keys are set as properties (value, checked, type, placeholder…)
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2), v as EventListener);
      } else if (k === 'class' || k === 'style' || k === 'for' || k === 'id' || k === 'role' || k.startsWith('data-') || k.startsWith('aria-')) {
        el.setAttribute(k, String(v));
      } else {
        (el as unknown as Record<string, unknown>)[k] = v;
      }
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

/** SVG element helper (for charts, rings, icons). */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number> | null,
  ...children: (SVGElement | string | null | undefined | false)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) {
    if (!c) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

// ---------- number formatting ----------

export const fmtKg = (n: number | undefined | null) =>
  n === undefined || n === null ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtInt = (n: number) => Math.round(n).toLocaleString('fr-FR');

/** "+0,4" / "−1,2" with a real minus sign. */
export const fmtDelta = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmtKg(Math.abs(n));

/** Parse "70,4" or "70.4". */
export const parseNum = (v: string): number | undefined => {
  const n = parseFloat(v.replace(',', '.').trim());
  return Number.isFinite(n) ? n : undefined;
};

// ---------- sheet (bottom modal) ----------

export interface Sheet { el: HTMLElement; close: () => void }

/** Open a bottom sheet. Content is appended into the sheet body. */
export function openSheet(title: string, content: Node, opts: { onClose?: () => void } = {}): Sheet {
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const body = h('div', { class: 'sheet-body' }, content);
  const closeBtn = h('button', { class: 'btn-icon', 'aria-label': 'Fermer', onclick: () => close() }, '×');
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', null, title), closeBtn),
    body,
  );
  const wrap = h('div', { class: 'sheet-wrap' }, backdrop, sheet);
  backdrop.addEventListener('click', () => close());
  document.body.appendChild(wrap);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => wrap.classList.add('open'));
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    wrap.classList.remove('open');
    document.body.classList.remove('sheet-open');
    setTimeout(() => wrap.remove(), 220);
    opts.onClose?.();
  }
  const first = body.querySelector<HTMLElement>('input:not([type=date]):not([type=checkbox]), textarea');
  if (first) setTimeout(() => first.focus(), 250);
  return { el: body, close };
}

// ---------- toast ----------

let toastTimer: number | undefined;
export function toast(msg: string) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status' });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2200);
}

// ---------- form bits ----------

/** Labelled input row. Returns the wrapper; read the input via `.querySelector('input')` or pass an id. */
export function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

/** Segmented control. */
export function segmented<T extends string>(options: { value: T; label: string }[], current: T, onChange: (v: T) => void): HTMLElement {
  const wrap = h('div', { class: 'seg', role: 'tablist' });
  for (const o of options) {
    wrap.appendChild(
      h('button', {
        class: 'seg-item' + (o.value === current ? ' on' : ''),
        role: 'tab',
        'aria-selected': o.value === current ? 'true' : 'false',
        type: 'button',
        onclick: () => onChange(o.value),
      }, o.label),
    );
  }
  return wrap;
}

/** Horizontal progress bar. `ratio` can exceed 1 (shown as over). */
export function bar(ratio: number, tone: 'accent' | 'good' | 'warn' | 'bad' = 'accent'): HTMLElement {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return h('div', { class: 'bar' }, h('div', { class: `bar-fill tone-${tone}`, style: `width:${pct}%` }));
}

/** Pick an image file from the camera roll / camera. Resolves null if cancelled. */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export const SPORT_LABEL: Record<string, string> = {
  swim: 'Natation',
  bike: 'Vélo',
  run: 'Course à pied',
  strength: 'Renfo',
  basket: 'Basket',
  walk: 'Marche',
  mobility: 'Mobilité',
  other: 'Autre',
};

/** Short glyph per sport, used in lists instead of emoji. */
export const SPORT_GLYPH: Record<string, string> = {
  swim: 'NA',
  bike: 'VÉ',
  run: 'CAP',
  strength: 'RF',
  basket: 'BB',
  walk: 'MA',
  mobility: 'MO',
  other: '··',
};

/** Settings gear (Today and Équilibre headers). */
export function gearIcon(): SVGElement {
  return s('svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    s('circle', { cx: 12, cy: 12, r: 3 }),
    s('path', { d: 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' }),
  );
}

// ---------- scrapbook decor (seasoning: max 1–2 per screen, never over numbers or controls) ----------

/**
 * Bead letters: one round bead per character, like a friendship bracelet.
 * Purely decorative (aria-hidden); pair it with real text for screen readers (see screenTitle).
 * `pink` lists the bead indexes drawn pink (default: the first and one near the middle).
 */
export function beads(text: string, pink?: number[]): HTMLElement {
  const chars = Array.from(text.toLocaleUpperCase('fr-FR'));
  const letters = chars.filter((c) => c.trim() !== '').length;
  const pinkSet = new Set(pink ?? (letters > 3 ? [0, Math.floor(letters / 2) + 1] : [0]));
  const wrap = h('span', { class: 'beads', 'aria-hidden': 'true' });
  let i = 0;
  for (const c of chars) {
    if (c.trim() === '') { wrap.append(h('span', { class: 'bead-sp' })); continue; }
    wrap.append(h('b', pinkSet.has(i) ? { class: 'pink' } : null, c));
    i++;
  }
  return wrap;
}

/** Screen title: the h1 keeps its real text (sr-only) and shows bead letters. */
export function screenTitle(text: string, pink?: number[]): HTMLElement {
  return h('h1', { class: 'bead-title' }, h('span', { class: 'sr-only' }, text), beads(text, pink));
}

/** Small gold star sticker (Today countdown). */
export function starSticker(cls = ''): SVGElement {
  return s('svg', { class: `sticker stk-star ${cls}`.trim(), viewBox: '0 0 48 48', 'aria-hidden': 'true' },
    s('path', { class: 'stk-star-fill', d: 'M24 4.2c1.2 0 2.1.8 2.7 2l4.5 9.3 10.2 1.5c2.7.4 3.8 3.6 1.8 5.5l-7.4 7.2 1.8 10.1c.5 2.7-2.3 4.7-4.8 3.4L24 38.5l-8.9 4.8c-2.4 1.3-5.3-.7-4.8-3.4l1.8-10.1-7.4-7.2c-2-1.9-.9-5.1 1.8-5.5l10.2-1.5 4.5-9.3c.6-1.2 1.6-2 2.8-2z' }),
    s('path', { class: 'stk-star-shine', d: 'M17 16.5c2-3.5 4-6.5 6-7', fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round' }),
  );
}

/** Black binder clip holding a card (quote card). */
export function clipSticker(cls = ''): SVGElement {
  return s('svg', { class: `sticker stk-clip ${cls}`.trim(), viewBox: '0 0 60 54', 'aria-hidden': 'true' },
    s('path', { class: 'stk-clip-wire', d: 'M21 30 L17 6 Q17 2 21 2 L39 2 Q43 2 43 6 L39 30', fill: 'none', 'stroke-width': 2.6, 'stroke-linejoin': 'round' }),
    s('path', { class: 'stk-clip-body', d: 'M8 28 H52 L47 50 Q46 52 44 52 H16 Q14 52 13 50 Z' }),
    s('path', { class: 'stk-clip-shine', d: 'M12 32 H48', 'stroke-width': 1.2 }),
  );
}

let heartSeq = 0;
/** Polka-dot heart sticker (Équilibre accent). */
export function heartSticker(cls = ''): SVGElement {
  const id = `stk-dots-${++heartSeq}`;
  return s('svg', { class: `sticker stk-heart ${cls}`.trim(), viewBox: '0 0 40 36', 'aria-hidden': 'true' },
    s('defs', null,
      s('pattern', { id, width: 6, height: 6, patternUnits: 'userSpaceOnUse' },
        s('rect', { class: 'stk-heart-bg', width: 6, height: 6 }),
        s('circle', { class: 'stk-heart-dot', cx: 1.5, cy: 1.5, r: 1.2 }),
        s('circle', { class: 'stk-heart-dot', cx: 4.5, cy: 4.5, r: 1.2 }),
      ),
    ),
    s('path', { class: 'stk-heart-shape', fill: `url(#${id})`, 'stroke-width': 1.2, d: 'M20 34C8 25 2 18.5 2 11.3 2 5.8 6.3 2 11.2 2c3.6 0 6.7 2 8.8 5.1C22.1 4 25.2 2 28.8 2 33.7 2 38 5.8 38 11.3 38 18.5 32 25 20 34z' }),
  );
}

// ---------- ux v4: sections, one-action cards, info rows, tips carousel, disclosure, key bubble ----------
// Pattern: sectionTitle('Ta journée') above a card; one card = one topic = one action
// (actionLink at the bottom); details folded in disclosure(); one keyBubble per card at most.

/** Centered uppercase, letter-spaced section title ("TA JOURNÉE"). Text is given in normal case. */
export function sectionTitle(text: string): HTMLElement {
  return h('h2', { class: 'sec-title' }, text);
}

/** Centered text action for the bottom of a card ("Voir mes repas"). */
export function actionLink(label: string, onClick: () => void): HTMLElement {
  return h('button', { class: 'action-link', type: 'button', onclick: onClick }, label);
}

/** Icon paths from a 24px line-icon grid, several paths joined with '|'. */
function lineIcon(d: string, size = 22): SVGElement {
  return s('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    ...d.split('|').map((p) => s('path', { d: p })));
}

/** Small line icons for icon circles (24px grid, paths joined with '|'). */
export const ICON = {
  sun: 'M12 3v2|M12 19v2|M3 12h2|M19 12h2|M5.6 5.6l1.4 1.4|M17 17l1.4 1.4|M5.6 18.4 7 17|M17 7l1.4-1.4|M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  drop: 'M12 3c3.5 4.4 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.5-6.6 6-11z',
  scale: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z|M8.5 10a5 5 0 0 1 7 0|M12 10l1.5-2',
  fork: 'M7 3v8a2 2 0 0 0 4 0V3|M9 11v10|M17 3c-2 2-2 6 0 8v10',
  wave: 'M4 17c3-6 5-6 8 0s5 6 8 0|M4 9c3-6 5-6 8 0s5 6 8 0',
  heart: 'M12 21c-5-3-8-6.5-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 3.5c0 4-3 7.5-8 10.5',
  leaf: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14|M5 19l7-7',
  flag: 'M5 21V4|M5 4h11l-2 4 2 4H5',
  cycle: 'M12 4a8 8 0 1 1-8 8|M4 7v5h5',
  battery: 'M4 8h13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z|M21 11v2|M6 11v2',
  spark: 'M12 3v4|M12 17v4|M3 12h4|M17 12h4|M12 9l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
  plane: 'M3 14l18-7-6 13-3-6z|M12 14l3-3',
} as const;

/**
 * Soft round circle holding a line icon or a short glyph.
 * `icon`: an SVG path string (24px grid, '|' between paths; e.g. ICON.drop), an SVGElement, or a 1–3 letter glyph ("BB").
 */
export function iconCircle(icon: string | SVGElement, cls = ''): HTMLElement {
  const isPath = typeof icon === 'string' && /^[Mm]\s*-?\d/.test(icon);
  const inner = typeof icon !== 'string' ? icon : isPath ? lineIcon(icon) : h('span', { class: 'icon-glyph' }, icon);
  return h('span', { class: `icon-circle ${cls}`.trim(), 'aria-hidden': 'true' }, inner);
}

export interface InfoRowOpts {
  icon: string | SVGElement;
  title: Child;
  detail?: Child;
  /** Makes the whole row a button with a chevron. Don't combine with an interactive `trail`. */
  onClick?: () => void;
  /** Right-side node (chip, small button) when the row is not clickable. */
  trail?: Node | null;
  cls?: string;
}

/** Icon circle + bold title + one detail line ("Parc Disneyland · 09:30 à 21:00"). */
export function infoRow(o: InfoRowOpts): HTMLElement {
  const body = [
    iconCircle(o.icon),
    h('span', { class: 'info-main' },
      h('span', { class: 'info-title' }, o.title),
      o.detail !== undefined && o.detail !== null && o.detail !== '' ? h('span', { class: 'info-detail' }, o.detail) : null,
    ),
  ];
  const cls = `info-row ${o.cls ?? ''}`.trim();
  if (o.onClick) {
    return h('button', { class: cls + ' tap', type: 'button', onclick: o.onClick }, body, h('span', { class: 'info-chev', 'aria-hidden': 'true' }, '›'));
  }
  return h('div', { class: cls }, body, o.trail ?? null);
}

/** Scroll position of keyed carousels, so a re-render doesn't jump back to the first card. */
const carouselPos = new Map<string, number>();

/**
 * Horizontal swipe carousel (scroll-snap) with pagination dots updated on scroll.
 * Pass a `key` to keep the current card across re-renders.
 */
export function carousel(cards: HTMLElement[], key?: string): HTMLElement {
  const track = h('div', { class: 'carousel-track', role: 'list' },
    cards.map((c, i) => {
      c.classList.add('carousel-item');
      c.setAttribute('role', 'listitem');
      c.setAttribute('aria-label', `${i + 1} sur ${cards.length}`);
      return c;
    }));
  const dots = cards.map((_, i) =>
    h('button', {
      class: 'carousel-dot' + (i === 0 ? ' on' : ''),
      type: 'button',
      'aria-label': `Conseil ${i + 1}`,
      onclick: () => {
        const c = cards[i];
        track.scrollTo({ left: c.offsetLeft - track.offsetLeft - (track.clientWidth - c.offsetWidth) / 2, behavior: 'smooth' });
      },
    }));
  const indexNow = () => {
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0, dist = Infinity;
    cards.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft - track.offsetLeft + c.offsetWidth / 2 - center);
      if (d < dist) { dist = d; best = i; }
    });
    return best;
  };
  let raf = 0;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = indexNow();
      dots.forEach((d, j) => d.classList.toggle('on', j === i));
      if (key) carouselPos.set(key, track.scrollLeft);
    });
  }, { passive: true });
  if (key && carouselPos.has(key)) {
    const left = carouselPos.get(key)!;
    requestAnimationFrame(() => { track.scrollLeft = left; });
  }
  return h('div', { class: 'carousel' }, track, cards.length > 1 ? h('div', { class: 'carousel-dots' }, dots) : null);
}

export interface TipOpts {
  icon: string | SVGElement;
  title: string;
  text: string;
  /** Opens the details (usually a sheet). Adds the "En savoir plus" pill. */
  more?: () => void;
}

/** Tip card for carousel(): icon circle + bold title + 1–3 lines + "En savoir plus" pill. */
export function tipCard(o: TipOpts): HTMLElement {
  return h('article', { class: 'tip-card' },
    h('div', { class: 'tip-top' },
      iconCircle(o.icon, 'lg'),
      h('div', { class: 'tip-main' },
        h('h3', { class: 'tip-title' }, o.title),
        h('p', { class: 'tip-text' }, o.text),
      ),
    ),
    o.more ? h('button', { class: 'tip-more', type: 'button', onclick: o.more }, 'En savoir plus') : null,
  );
}

/** Open/closed state of disclosures, by key (survives re-renders). */
const disclosureOpen = new Map<string, boolean>();

/**
 * Chevron row "Voir le détail ⌄" that folds its content. The content is built only when open.
 * `key` identifies it across re-renders (defaults to the label: pass a key when the label repeats).
 */
export function disclosure(label: string, content: () => Child, key = label, openLabel = 'Masquer le détail'): HTMLElement {
  const wrap = h('div', { class: 'disc' });
  const draw = () => {
    const open = disclosureOpen.get(key) ?? false;
    wrap.classList.toggle('open', open);
    const btn = h('button', {
      class: 'disc-head', type: 'button', 'aria-expanded': open ? 'true' : 'false',
      onclick: () => { disclosureOpen.set(key, !open); draw(); },
    }, h('span', null, open ? openLabel : label),
      s('svg', { class: 'disc-chev', viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
        s('path', { d: 'M6 9l6 6 6-6' })));
    const kids = open ? content() : null;
    wrap.replaceChildren(btn, open ? h('div', { class: 'disc-body' }, kids) : '');
  };
  draw();
  return wrap;
}

/** The one strong figure of a card, in a pink bubble ("1 240 kcal", "J−77"). `tone: 'ink'` for a black bubble. */
export function keyBubble(value: string, unit?: string, label?: string, tone: 'pink' | 'ink' | 'warn' = 'pink'): HTMLElement {
  return h('div', { class: `key-bubble kb-${tone}` },
    h('span', { class: 'kb-value num' }, value),
    unit ? h('span', { class: 'kb-unit' }, unit) : null,
    label ? h('span', { class: 'kb-label' }, label) : null,
  );
}
