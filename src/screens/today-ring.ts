// Cycle ring (SVG, no dependency): one arc per phase, the past in full colour,
// what is still to come lighter, an ink dot "tu es ici", a small ovulation tick.
// When late, the ring is full and a dotted tail goes on past 360°.
// Shared by the Today hero (112 px, mini 56 px) and Équilibre (large).

import { h, s } from '../lib/ui';
import { daysBetween } from '../lib/dates';
import type { CycleInfo, CyclePhase } from '../lib/cycle';

interface Seg { phase: CyclePhase; from: number; to: number }

/** Phase segments in cycle days, 0-based [from, to), same priority as cycleOn(). */
export function ringSegments(info: CycleInfo, periodLength: number): { len: number; segs: Seg[] } {
  const len = Math.max(1, daysBetween(info.cycleStart, info.nextPeriod));
  const fs = daysBetween(info.cycleStart, info.fertileStart);
  const fe = daysBetween(info.cycleStart, info.fertileEnd) + 1;
  const pl = Math.min(periodLength, len);
  const pre = Math.max(len - 5, 0);
  const clamp = (n: number) => Math.max(0, Math.min(len, n));
  const raw: Seg[] = [
    { phase: 'regles', from: 0, to: pl },
    { phase: 'folliculaire', from: pl, to: clamp(fs) },
    { phase: 'fertile', from: Math.max(pl, clamp(fs)), to: clamp(fe) },
    { phase: 'luteale', from: Math.max(pl, clamp(fe)), to: Math.max(pl, clamp(fe), pre) },
    { phase: 'premenstruel', from: Math.max(pl, clamp(fe), pre), to: len },
  ];
  return { len, segs: raw.filter((x) => x.to > x.from) };
}

export interface RingOpts {
  size: number;
  periodLength: number;
  /** Accessible sentence (hereSentence()). */
  label: string;
  /** 3-word legend under the ring. */
  legend?: boolean;
  /** Center text; defaults to "J23" (or "+2 j" when late). */
  center?: boolean;
}

export function cycleRing(info: CycleInfo, o: RingOpts): HTMLElement {
  const { len, segs } = ringSegments(info, o.periodLength);
  const mini = o.size < 80;
  const stroke = mini ? 7 : o.size >= 140 ? 13 : 11;
  const r = 50 - stroke / 2 - (mini ? 2 : 4);
  const C = 2 * Math.PI * r;
  const late = info.phase === 'retard';
  const today = late ? len : Math.min(len, info.day); // days elapsed incl. today
  const gap = len > 1 ? 0.6 : 0; // small gap between arcs, in px of the 100-box

  const arc = (from: number, to: number, cls: string) => {
    const a = (from / len) * C;
    const l = Math.max(0.01, ((to - from) / len) * C - gap);
    return s('circle', { class: cls, cx: 50, cy: 50, r, fill: 'none', 'stroke-width': stroke, 'stroke-dasharray': `${l} ${C}`, 'stroke-dashoffset': -a });
  };

  const g = s('g', { transform: 'rotate(-90 50 50)' });
  for (const sg of segs) {
    g.append(arc(sg.from, sg.to, `cr-seg ph-${sg.phase} fut`));
    if (today > sg.from) g.append(arc(sg.from, Math.min(sg.to, today), `cr-seg ph-${sg.phase}`));
  }
  // Ovulation tick.
  const ovIdx = daysBetween(info.cycleStart, info.ovulation) + 0.5;
  if (!mini && ovIdx > 0 && ovIdx < len) {
    const t = (ovIdx / len) * 2 * Math.PI;
    const x1 = 50 + (r - stroke / 2 - 1) * Math.cos(t), y1 = 50 + (r - stroke / 2 - 1) * Math.sin(t);
    const x2 = 50 + (r - stroke / 2 - 5) * Math.cos(t), y2 = 50 + (r - stroke / 2 - 5) * Math.sin(t);
    g.append(s('line', { class: 'cr-ov', x1, y1, x2, y2, 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
  }
  // Late: dotted tail beyond 360°.
  let dotT: number;
  if (late) {
    const tail = Math.min(len * 0.5, Math.max(1, info.lateBy + 1));
    const rr = r + stroke / 2 + (mini ? 2 : 3);
    const Ct = 2 * Math.PI * rr;
    const tailLen = (tail / len) * Ct;
    const dashes = Array.from({ length: Math.max(1, Math.floor(tailLen / 5)) }, () => '2 3').join(' ');
    g.append(s('circle', { class: 'cr-tail', cx: 50, cy: 50, r: rr, fill: 'none', 'stroke-width': mini ? 1.6 : 2, 'stroke-dasharray': `${dashes} 0 ${Ct}` }));
    dotT = (tail / len) * 2 * Math.PI;
    const x = 50 + rr * Math.cos(dotT), y = 50 + rr * Math.sin(dotT);
    g.append(s('circle', { class: 'cr-dot', cx: x, cy: y, r: mini ? 3.4 : 4.2, 'stroke-width': mini ? 1.4 : 2 }));
  } else {
    dotT = ((info.day - 0.5) / len) * 2 * Math.PI;
    const x = 50 + r * Math.cos(dotT), y = 50 + r * Math.sin(dotT);
    g.append(s('circle', { class: 'cr-dot', cx: x, cy: y, r: mini ? 3.6 : stroke / 2 + 0.6, 'stroke-width': mini ? 1.4 : 2 }));
  }

  const svg = s('svg', { class: 'cr-svg', viewBox: '0 0 100 100', width: o.size, height: o.size, 'aria-hidden': 'true' }, g);
  const center = o.center === false ? null : h('span', { class: 'cr-center' },
    h('span', { class: 'cr-day num' }, late ? `+${info.lateBy} j` : `J${info.day}`),
    mini ? null : h('span', { class: 'cr-of' }, late ? 'de retard' : `sur ~${len}`),
  );
  return h('div', { class: 'cr' + (mini ? ' mini' : ''), role: 'img', 'aria-label': o.label, style: `--cr-size:${o.size}px` },
    h('div', { class: 'cr-box' }, svg, center),
    o.legend
      ? h('div', { class: 'cr-legend', 'aria-hidden': 'true' },
          h('span', null, h('i', { class: 'cr-key ph-regles' }), 'règles'),
          h('span', null, h('i', { class: 'cr-key ph-fertile' }), 'fertile'),
          h('span', null, h('i', { class: 'cr-key ph-luteale' }), 'lutéale'),
        )
      : null,
  );
}
