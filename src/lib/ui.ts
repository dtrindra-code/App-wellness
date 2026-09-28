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
