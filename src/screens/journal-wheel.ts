// "Ma roue de la vie": 8 domains rated 0–10, drawn as a wheel of 8 wedges whose
// filled radius is the score. Interactive (tap a wedge at the height you want, or
// arrow keys on a focused wedge, or the 0–10 sliders under it), and a compare mode
// (day 0 drawn as a dashed outline over today's fill). Works at 390 px.

import { h, s } from '../lib/ui';
import { LIFE_DOMAINS } from '../data/journey';

const R = 100;
const STEP = R / 10;
const N = LIFE_DOMAINS.length;
const SHORT: Record<string, string> = {
  sante: 'Santé', carriere: 'Carrière', finance: 'Finance', relations: 'Relations',
  contribution: 'Contribution', loisirs: 'Loisirs', amour: 'Amour', developpement: 'Dév. perso',
};
export const domainShort = (key: string) => SHORT[key] ?? key;

type Vals = Record<string, number>;

const rad = (deg: number) => (deg * Math.PI) / 180;
/** Angle (deg, 0 = right, clockwise) of wedge i's start; wedge 0 starts at the top. */
const a0 = (i: number) => -90 + (360 / N) * i;

function wedge(i: number, r: number): string {
  if (r <= 0) return '';
  const s0 = rad(a0(i)), s1 = rad(a0(i + 1));
  const x0 = r * Math.cos(s0), y0 = r * Math.sin(s0), x1 = r * Math.cos(s1), y1 = r * Math.sin(s1);
  return `M0 0 L${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

/** Outer arc only (for the day-0 outline). */
function arc(i: number, r: number): string {
  if (r <= 0) return '';
  const s0 = rad(a0(i)), s1 = rad(a0(i + 1));
  return `M${(r * Math.cos(s0)).toFixed(2)} ${(r * Math.sin(s0)).toFixed(2)} A${r} ${r} 0 0 1 ${(r * Math.cos(s1)).toFixed(2)} ${(r * Math.sin(s1)).toFixed(2)}`;
}

export interface WheelOpts {
  /** Faint reference (day 0), drawn as a dashed outline. */
  base?: Vals | null;
  /** Makes the wheel editable. */
  onPick?: (key: string, value: number) => void;
  label?: string;
}

/** The SVG wheel. */
export function lifeWheelSvg(values: Vals, o: WheelOpts = {}): SVGSVGElement {
  const edit = !!o.onPick;
  const svg = s('svg', {
    class: 'jw-svg' + (edit ? ' edit' : ''), viewBox: '-168 -150 336 300',
    role: edit ? 'group' : 'img',
    'aria-label': o.label ?? (edit ? 'Ma roue de la vie : touche un domaine pour le noter' : 'Ma roue de la vie'),
  }) as SVGSVGElement;
  // Guides.
  for (let k = 2; k <= 10; k += 2) svg.append(s('circle', { class: 'jw-ring' + (k === 10 ? ' out' : ''), r: k * STEP, cx: 0, cy: 0 }));
  for (let i = 0; i < N; i++) {
    const a = rad(a0(i));
    svg.append(s('line', { class: 'jw-spoke', x1: 0, y1: 0, x2: (R * Math.cos(a)).toFixed(2), y2: (R * Math.sin(a)).toFixed(2) }));
  }
  LIFE_DOMAINS.forEach((d, i) => {
    const v = values[d.key];
    const g = s('g', { class: 'jw-wedge' });
    // Hit area: the full wedge.
    g.append(s('path', { class: 'jw-hit', d: wedge(i, R) }));
    if (typeof v === 'number' && v > 0) g.append(s('path', { class: 'jw-fill', d: wedge(i, v * STEP) }));
    const b = o.base?.[d.key];
    if (typeof b === 'number' && b > 0) g.append(s('path', { class: 'jw-base', d: arc(i, b * STEP) }));
    // Label outside.
    const mid = rad(a0(i) + 180 / N);
    const lx = (R + 14) * Math.cos(mid), ly = (R + 14) * Math.sin(mid);
    const anchor = Math.abs(lx) < 12 ? 'middle' : lx > 0 ? 'start' : 'end';
    g.append(s('text', { class: 'jw-label', x: lx.toFixed(1), y: (ly + 4).toFixed(1), 'text-anchor': anchor },
      `${domainShort(d.key)} `, s('tspan', { class: 'jw-val' }, typeof v === 'number' ? String(v) : '–')));
    if (edit) {
      g.setAttribute('tabindex', '0');
      g.setAttribute('data-jw', `w-${d.key}`);
      g.setAttribute('role', 'slider');
      g.setAttribute('aria-label', d.label);
      g.setAttribute('aria-valuemin', '0');
      g.setAttribute('aria-valuemax', '10');
      g.setAttribute('aria-valuenow', String(v ?? 0));
      g.setAttribute('aria-valuetext', typeof v === 'number' ? `${v} sur 10` : 'pas encore noté');
      g.addEventListener('keydown', (e: KeyboardEvent) => {
        const cur = values[d.key] ?? 0;
        let next: number | null = null;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = Math.min(10, cur + 1);
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = 10;
        if (next === null) return;
        e.preventDefault();
        o.onPick!(d.key, next);
      });
    }
    svg.append(g);
  });
  svg.append(s('circle', { class: 'jw-hub', r: 5, cx: 0, cy: 0 }));
  if (edit) {
    svg.addEventListener('click', (e: MouseEvent) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const m = svg.getScreenCTM();
      if (!m) return;
      const p = pt.matrixTransform(m.inverse());
      const r = Math.hypot(p.x, p.y);
      if (r > R + 8) return;
      let ang = (Math.atan2(p.y, p.x) * 180) / Math.PI + 90;
      if (ang < 0) ang += 360;
      const i = Math.floor(ang / (360 / N)) % N;
      const v = Math.max(0, Math.min(10, Math.round(r / STEP)));
      o.onPick!(LIFE_DOMAINS[i].key, v);
    });
  }
  return svg;
}

/**
 * Editable wheel + one 0–10 slider per domain (the accessible way). The rows are built
 * once; a pick (slider, tap on the wheel, arrow keys on a wedge) only redraws the wheel
 * and syncs the sliders, so a slider being dragged is never replaced.
 */
export function wheelEditor(initial: Vals, onChange: (next: Vals) => void, base?: Vals | null): HTMLElement {
  const values: Vals = { ...initial };
  const svgWrap = h('div', { class: 'jw-svg-wrap' });
  const ranges = new Map<string, { input: HTMLInputElement; out: HTMLElement }>();

  const sync = (key: string) => {
    const r = ranges.get(key);
    if (!r) return;
    const v = values[key];
    const set = typeof v === 'number';
    if (set && document.activeElement !== r.input) r.input.value = String(v);
    r.input.classList.toggle('unset', !set);
    r.input.setAttribute('aria-valuetext', set ? `${v} sur 10` : 'pas encore noté');
    r.out.textContent = set ? String(v) : '–';
  };
  const drawSvg = () => {
    const focused = document.activeElement?.getAttribute('data-jw') ?? null;
    svgWrap.replaceChildren(lifeWheelSvg(values, { base, onPick: (key, v) => { pick(key, v); } }));
    if (focused && focused.startsWith('w-')) (svgWrap.querySelector(`[data-jw="${focused}"]`) as SVGElement | null)?.focus();
  };
  const pick = (key: string, v: number, save = true) => {
    values[key] = v;
    sync(key);
    drawSvg();
    if (save) onChange({ ...values });
  };

  const rows = LIFE_DOMAINS.map((d) => {
    const v = values[d.key];
    const out = h('output', { class: 'jw-row-v num' }, typeof v === 'number' ? String(v) : '–');
    const input = h('input', {
      class: 'jw-range' + (typeof v === 'number' ? '' : ' unset'), type: 'range', min: 0, max: 10, step: 1,
      value: String(typeof v === 'number' ? v : 5), 'aria-label': `${d.label}, de 0 à 10`,
      'aria-valuetext': typeof v === 'number' ? `${v} sur 10` : 'pas encore noté',
      oninput: () => pick(d.key, Number(input.value), false),
      onchange: () => pick(d.key, Number(input.value)),
    });
    ranges.set(d.key, { input, out });
    return h('div', { class: 'jw-row' },
      h('div', { class: 'jw-row-head' },
        h('span', { class: 'jw-row-label' }, d.label),
        typeof base?.[d.key] === 'number' ? h('span', { class: 'jw-row-base' }, `départ ${base[d.key]}`) : null,
        out),
      input);
  });
  drawSvg();
  return h('div', { class: 'jw' }, svgWrap, base ? legend() : null, h('div', { class: 'jw-rows' }, rows));
}

function legend(): HTMLElement {
  return h('div', { class: 'jw-legend small' },
    h('span', null, h('i', { class: 'jw-key now' }), 'maintenant'),
    h('span', null, h('i', { class: 'jw-key base' }), 'jour 0'));
}

/** Read-only compare: day 0 outline vs now, plus a line per domain. */
export function wheelCompare(start: Vals | null, now: Vals | null): HTMLElement {
  const cur = now ?? start ?? {};
  return h('div', { class: 'jw' },
    h('div', { class: 'jw-svg-wrap' }, lifeWheelSvg(cur, { base: now ? start : null, label: 'Ma roue de la vie, maintenant et au départ' })),
    now && start ? legend() : null,
    now && start
      ? h('ul', { class: 'jw-diff' }, LIFE_DOMAINS.map((d) => {
          const a = start[d.key], b = now[d.key];
          const diff = typeof a === 'number' && typeof b === 'number' ? b - a : null;
          return h('li', null,
            h('span', { class: 'jw-diff-l' }, d.label),
            h('span', { class: 'num' }, `${a ?? '–'} → ${b ?? '–'}`),
            diff !== null && diff !== 0 ? h('span', { class: 'jw-diff-d num' + (diff > 0 ? ' up' : '') }, diff > 0 ? `+${diff}` : `−${-diff}`) : h('span', { class: 'jw-diff-d' }, ''));
        }))
      : null,
  );
}
