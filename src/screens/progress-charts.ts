// Small bar charts for the Progrès tab. One y-scale, faint grid, muted labels,
// thin rounded bars in the brand's pink-deep, an optional ink reference (budget tick
// per bar, or one horizontal target line), the highlighted bar in ink, tap to read a bar.

import { h, s } from '../lib/ui';

export interface BarDatum {
  /** x-axis label ('' to skip). */
  tick: string;
  value: number | null;
  /** Per-bar reference (e.g. the day's budget), drawn as a short ink tick. */
  mark?: number | null;
  /** Text shown in the readout when the bar is tapped. */
  readout: string;
}

export interface BarOpts {
  ariaLabel: string;
  /** One horizontal reference line (e.g. 7 h of sleep). */
  refValue?: number;
  refLabel?: string;
  /** Index drawn in ink (the current week…). */
  highlight?: number;
  fmtAxis?: (v: number) => string;
  /** Default readout (before any tap). */
  hint: string;
  legend?: { kind: 'bar' | 'tick' | 'line'; label: string }[];
  /** Integer axis (counts). */
  integer?: boolean;
}

const W = 320;
const H = 140;
const PAD0 = { l: 30, r: 8, t: 12, b: 20 };

function niceStep(max: number, integer: boolean): number {
  const raw = max / 3;
  if (integer) return Math.max(1, Math.ceil(raw));
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export function barChart(data: BarDatum[], o: BarOpts): HTMLElement {
  // Room on the right for the reference label, outside the bars.
  const PAD = { ...PAD0, r: o.refLabel ? 28 : PAD0.r };
  const fmt = o.fmtAxis ?? ((v: number) => String(v));
  const vals = data.flatMap((d) => [d.value, d.mark]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (o.refValue !== undefined) vals.push(o.refValue);
  const maxV = Math.max(1, ...vals);
  const step = niceStep(maxV, !!o.integer);
  const hi = Math.ceil(maxV / step) * step;
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const Y = (v: number) => PAD.t + (1 - v / hi) * innerH;
  const slot = innerW / Math.max(1, data.length);
  const bw = Math.max(3, Math.min(22, slot - 5));
  const f = (n: number) => n.toFixed(1);

  const svg = s('svg', { class: 'chart pg-chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': o.ariaLabel });
  for (let v = 0; v <= hi + 1e-9; v += step) {
    svg.appendChild(s('line', { x1: PAD.l, x2: W - PAD.r, y1: f(Y(v)), y2: f(Y(v)), stroke: 'var(--line)', 'stroke-width': 1 }));
    svg.appendChild(s('text', { x: PAD.l - 6, y: f(Y(v) + 3.5), 'text-anchor': 'end' }, fmt(v)));
  }

  const bars: SVGElement[] = [];
  data.forEach((d, i) => {
    const cx = PAD.l + slot * i + slot / 2;
    if (d.value !== null && d.value > 0) {
      const y = Y(d.value);
      const hgt = Math.max(2, Y(0) - y);
      const r = Math.min(4, bw / 2, hgt);
      // Rounded top, square base anchored on the baseline.
      const x0 = cx - bw / 2, x1 = cx + bw / 2, yb = Y(0), yt = yb - hgt;
      const path = `M${f(x0)},${f(yb)}V${f(yt + r)}Q${f(x0)},${f(yt)} ${f(x0 + r)},${f(yt)}H${f(x1 - r)}Q${f(x1)},${f(yt)} ${f(x1)},${f(yt + r)}V${f(yb)}Z`;
      const bar = s('path', { d: path, class: 'pg-bar' + (i === o.highlight ? ' on' : '') });
      bars.push(bar);
      svg.appendChild(bar);
    } else bars.push(s('g'));
    if (typeof d.mark === 'number' && Number.isFinite(d.mark)) {
      svg.appendChild(s('line', { x1: f(cx - bw / 2 - 1), x2: f(cx + bw / 2 + 1), y1: f(Y(d.mark)), y2: f(Y(d.mark)), class: 'pg-mark' }));
    }
    if (d.tick) svg.appendChild(s('text', { x: f(cx), y: H - 5, 'text-anchor': 'middle' }, d.tick));
  });

  if (o.refValue !== undefined) {
    const y = Y(o.refValue);
    svg.appendChild(s('line', { x1: PAD.l, x2: W - PAD.r, y1: f(y), y2: f(y), class: 'pg-ref' }));
    if (o.refLabel) svg.appendChild(s('text', { x: W - PAD.r + 4, y: f(y + 3.5), 'text-anchor': 'start', class: 'pg-ref-label' }, o.refLabel));
  }

  const readout = h('p', { class: 'small muted num w-readout', 'aria-live': 'polite' }, o.hint);
  const hitbox = s('rect', { x: PAD.l, y: 0, width: innerW, height: H, fill: 'transparent' });
  svg.appendChild(hitbox);
  let sel = -1;
  const pick = (ev: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const vx = ((ev.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(data.length - 1, Math.floor((vx - PAD.l) / slot)));
    if (i === sel) return;
    sel = i;
    bars.forEach((b, j) => b.classList.toggle('sel', j === i));
    readout.textContent = data[i].readout;
  };
  hitbox.addEventListener('pointerdown', pick as EventListener);
  hitbox.addEventListener('pointermove', pick as EventListener);

  const key = (kind: 'bar' | 'tick' | 'line') => s('svg', { viewBox: '0 0 18 10', width: 18, height: 10, 'aria-hidden': 'true' },
    kind === 'bar' ? s('rect', { x: 5, y: 1, width: 8, height: 9, rx: 2, class: 'pg-bar' })
      : kind === 'tick' ? s('line', { x1: 2, x2: 16, y1: 5, y2: 5, class: 'pg-mark' })
        : s('line', { x1: 1, x2: 17, y1: 5, y2: 5, class: 'pg-ref' }));
  const legend = o.legend?.length
    ? h('div', { class: 'w-legend' }, o.legend.map((l) => h('span', null, key(l.kind), l.label)))
    : null;
  return h('div', { class: 'stack pg-chart-wrap' }, svg as unknown as Node, readout, legend);
}
