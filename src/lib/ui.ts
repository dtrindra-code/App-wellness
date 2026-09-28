// Tiny DOM helpers shared by all screens. No framework: screens build DOM with h().

type Child = Node | string | number | null | undefined | false | Child[];
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
