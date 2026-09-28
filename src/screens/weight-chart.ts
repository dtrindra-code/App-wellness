// Weight chart for the "Poids" screen: one y-scale (kg), faint grid,
// 7-day average as the main line, daily weigh-ins as faint dots, plan dashed,
// milestone (palier) and final goal dotted, "fin du lavage" marker, emphasized last point.
// With cycle tracking: period-start ticks on the x-axis and faint premenstrual bands.
// Tap/drag to read a day.

import type { DayLog, Profile } from '../types';
import { h, s, fmtKg } from '../lib/ui';
import { addDays, daysBetween, fmtDayMonth, fmtShort, today } from '../lib/dates';
import { movingAverage, plannedWeight } from '../lib/nutrition';
import { averageLength, cycleSettings, periodStarts } from '../lib/cycle';

export type ChartRange = 'all' | '30';

const W = 340;
const H = 210;
const PAD = { l: 30, r: 34, t: 16, b: 22 };

export function weightChart(
  profile: Profile,
  weights: { date: string; weight: number }[],
  range: ChartRange,
  days?: Record<string, DayLog>,
): HTMLElement {
  const t = today();
  const first = weights[0]?.date;
  const last = weights[weights.length - 1]?.date;

  let x0: string;
  let x1: string;
  if (range === '30') {
    x1 = last && last > t ? last : t;
    x0 = addDays(x1, -29);
  } else {
    x0 = first && first < profile.startDate ? first : profile.startDate;
    // A little past the milestone, so the start of the road to the final goal shows.
    const after = addDays(profile.goalDate, 14);
    x1 = last && last > after ? last : after;
  }
  const spanDays = Math.max(1, daysBetween(x0, x1));

  const ma = movingAverage(weights, 7);
  const visW = weights.filter((p) => p.date >= x0 && p.date <= x1);
  const visMA = ma.filter((p) => p.date >= x0 && p.date <= x1);

  // Plan sampled daily (capped to ~120 samples).
  const stepDays = Math.max(1, Math.ceil(spanDays / 120));
  const plan: { date: string; w: number }[] = [];
  for (let i = 0; i <= spanDays; i += stepDays) {
    const d = addDays(x0, i);
    plan.push({ date: d, w: plannedWeight(d, profile) });
  }
  if (plan[plan.length - 1].date !== x1) plan.push({ date: x1, w: plannedWeight(x1, profile) });

  // One y-scale for everything.
  const vals = [...visW.map((p) => p.weight), ...plan.map((p) => p.w), profile.goalWeight];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const span = hi - lo;
  const step = span <= 4 ? 1 : span <= 10 ? 2 : 5;
  lo = Math.floor((lo - 0.4) / step) * step;
  hi = Math.ceil((hi + 0.4) / step) * step;
  // Final goal: drawn only when it fits in the range (or sits just below it in "Tout").
  const final = profile.finalGoalWeight;
  let showFinal = final !== undefined && final < profile.goalWeight - 0.05 && final >= lo;
  if (!showFinal && final !== undefined && final < profile.goalWeight - 0.05 && range === 'all' && lo - final <= 3) {
    lo = Math.floor((final - 0.4) / step) * step;
    showFinal = true;
  }

  const X = (d: string) => PAD.l + (daysBetween(x0, d) / spanDays) * (W - PAD.l - PAD.r);
  const Y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * (H - PAD.t - PAD.b);
  const fx = (n: number) => n.toFixed(1);

  const svg = s('svg', {
    class: 'chart',
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': 'Courbe du poids : moyenne sur 7 jours, pesées, plan, palier et objectif',
    style: 'touch-action: pan-y',
  });

  // Grid + y labels.
  for (let v = lo; v <= hi + 1e-9; v += step) {
    svg.appendChild(s('line', { x1: PAD.l, x2: W - PAD.r, y1: fx(Y(v)), y2: fx(Y(v)), stroke: 'var(--line)', 'stroke-width': 1 }));
    svg.appendChild(s('text', { x: PAD.l - 6, y: fx(Y(v) + 3.5), 'text-anchor': 'end' }, String(v)));
  }

  // Cycle overlay: faint premenstrual bands + period-start ticks on the x-axis.
  const cs = cycleSettings(profile);
  const starts = days && cs.tracking && !cs.pregnant ? periodStarts(days) : [];
  const cycleOn = starts.length > 0;
  if (cycleOn) {
    const len = averageLength(starts, cs.avgLength);
    const bandTop = PAD.t;
    const bandH = H - PAD.t - PAD.b;
    starts.forEach((st, i) => {
      // Past cycles: the real next start; last cycle: the estimate.
      const next = starts[i + 1] ?? addDays(st, len);
      let b0 = addDays(next, -5);
      let b1 = addDays(next, -1);
      if (b1 < x0 || b0 > x1) return;
      if (b0 < x0) b0 = x0;
      if (b1 > x1) b1 = x1;
      const bx = X(b0);
      const bw = Math.max(2, X(addDays(b1, 1)) - bx);
      svg.appendChild(s('rect', { x: fx(bx), y: bandTop, width: fx(Math.min(bw, W - PAD.r - bx)), height: bandH, fill: 'var(--warn)', opacity: 0.08 }));
    });
    for (const st of starts) {
      if (st < x0 || st > x1) continue;
      svg.appendChild(s('circle', { cx: fx(X(st)), cy: fx(H - PAD.b), r: 3, fill: 'var(--bad)', opacity: 0.75 }));
    }
  }

  // X labels.
  const xTicks: string[] = [];
  if (range === '30') {
    for (let d = x1; d >= x0; d = addDays(d, -7)) xTicks.unshift(d);
  } else {
    let d = x0.slice(0, 8) + '01';
    if (d < x0) d = addDays(d, 32).slice(0, 8) + '01';
    for (; d <= x1; d = addDays(d, 32).slice(0, 8) + '01') xTicks.push(d);
  }
  for (const d of xTicks) {
    const x = X(d);
    if (x < PAD.l + 8 || x > W - PAD.r + 10) continue;
    svg.appendChild(s('text', { x: fx(x), y: H - 6, 'text-anchor': 'middle' }, fmtDayMonth(d)));
  }

  // Lavage marker.
  if (profile.lavageEnd >= x0 && profile.lavageEnd <= x1) {
    const x = X(profile.lavageEnd);
    svg.appendChild(s('line', { x1: fx(x), x2: fx(x), y1: PAD.t, y2: H - PAD.b, stroke: 'var(--muted)', 'stroke-width': 1, opacity: 0.45 }));
    const anchor = x < PAD.l + 40 ? 'start' : x > W - PAD.r - 30 ? 'end' : 'middle';
    svg.appendChild(s('text', { x: fx(x), y: PAD.t - 5, 'text-anchor': anchor }, 'fin du lavage'));
  }

  // Milestone (palier) line.
  const gy = Y(profile.goalWeight);
  svg.appendChild(s('line', {
    x1: PAD.l, x2: W - PAD.r, y1: fx(gy), y2: fx(gy),
    stroke: 'var(--good)', 'stroke-width': 1.5, 'stroke-dasharray': '1 4', 'stroke-linecap': 'round',
  }));
  svg.appendChild(s('text', { x: PAD.l + 4, y: fx(gy - 5) }, `palier ${fmtKg(profile.goalWeight)}`));

  // Final goal line (lighter).
  if (showFinal && final !== undefined) {
    const fy = Y(final);
    svg.appendChild(s('line', {
      x1: PAD.l, x2: W - PAD.r, y1: fx(fy), y2: fx(fy),
      stroke: 'var(--good)', 'stroke-width': 1, 'stroke-dasharray': '1 6', 'stroke-linecap': 'round', opacity: 0.7,
    }));
    svg.appendChild(s('text', { x: W - PAD.r, y: fx(fy - 5), 'text-anchor': 'end' }, `objectif final ${fmtKg(final)}`));
  }

  // Plan (dashed).
  svg.appendChild(s('path', {
    d: plan.map((p, i) => `${i ? 'L' : 'M'}${fx(X(p.date))},${fx(Y(p.w))}`).join(''),
    fill: 'none', stroke: 'var(--muted)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4', opacity: 0.8,
  }));

  // Daily weigh-ins (faint dots).
  for (const p of visW) {
    svg.appendChild(s('circle', { cx: fx(X(p.date)), cy: fx(Y(p.weight)), r: 2.5, fill: 'var(--muted)', opacity: 0.5 }));
  }

  // 7-day average (main line).
  if (visMA.length > 1) {
    svg.appendChild(s('path', {
      d: visMA.map((p, i) => `${i ? 'L' : 'M'}${fx(X(p.date))},${fx(Y(p.avg))}`).join(''),
      fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }

  // Emphasized last point.
  const end = visMA[visMA.length - 1];
  if (end) {
    const ex = X(end.date);
    const ey = Y(end.avg);
    svg.appendChild(s('circle', { cx: fx(ex), cy: fx(ey), r: 4.5, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 }));
    const nearRight = ex > W - PAD.r - 26;
    svg.appendChild(s('text', {
      x: fx(nearRight ? ex : ex + 8),
      y: fx(nearRight ? ey - 10 : ey - 6),
      'text-anchor': nearRight ? 'end' : 'start',
      style: 'fill: var(--ink); font-size: 12px; font-weight: 600',
    }, fmtKg(end.avg)));
  }

  // Hover / touch readout.
  const hair = s('line', { y1: PAD.t, y2: H - PAD.b, stroke: 'var(--ink)', 'stroke-width': 1, opacity: 0 });
  const hairDot = s('circle', { r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2, opacity: 0 });
  svg.append(hair, hairDot);
  const hit = s('rect', { x: PAD.l, y: 0, width: W - PAD.l - PAD.r, height: H, fill: 'transparent' });
  svg.appendChild(hit);

  const defaultReadout = end
    ? `Moyenne 7 j : ${fmtKg(end.avg)} kg au ${fmtDayMonth(end.date)}`
    : `En pointillé : le plan jusqu’au ${fmtDayMonth(profile.goalDate)}`;
  const readout = h('p', { class: 'small muted num w-readout', 'aria-live': 'polite' }, defaultReadout);

  const byDateW = new Map(weights.map((p) => [p.date, p.weight]));
  const byDateMA = new Map(ma.map((p) => [p.date, p.avg]));

  const onMove = (ev: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const vx = ((ev.clientX - rect.left) / rect.width) * W;
    const f = Math.max(0, Math.min(1, (vx - PAD.l) / (W - PAD.l - PAD.r)));
    let d = addDays(x0, Math.round(f * spanDays));
    // Snap to a nearby weigh-in if one is within 2 days.
    let best: string | null = null;
    for (const p of visW) {
      const dist = Math.abs(daysBetween(p.date, d));
      if (dist <= 2 && (best === null || dist < Math.abs(daysBetween(best, d)))) best = p.date;
    }
    if (best) d = best;
    const x = fx(X(d));
    hair.setAttribute('x1', x);
    hair.setAttribute('x2', x);
    hair.setAttribute('opacity', '0.35');
    const avg = byDateMA.get(d);
    if (avg !== undefined) {
      hairDot.setAttribute('cx', x);
      hairDot.setAttribute('cy', fx(Y(avg)));
      hairDot.setAttribute('opacity', '1');
    } else hairDot.setAttribute('opacity', '0');
    const parts = [fmtShort(d)];
    if (avg !== undefined) parts.push(`moyenne ${fmtKg(avg)}`);
    const w = byDateW.get(d);
    if (w !== undefined) parts.push(`pesée ${fmtKg(w)}`);
    parts.push(`plan ${fmtKg(plannedWeight(d, profile))}`);
    readout.textContent = parts.join(' · ');
  };
  const onLeave = () => {
    hair.setAttribute('opacity', '0');
    hairDot.setAttribute('opacity', '0');
    readout.textContent = defaultReadout;
  };
  hit.addEventListener('pointerdown', onMove as EventListener);
  hit.addEventListener('pointermove', onMove as EventListener);
  hit.addEventListener('pointerleave', onLeave);
  hit.addEventListener('pointercancel', onLeave);

  const key = (el: SVGElement) => s('svg', { viewBox: '0 0 18 8', width: 18, height: 8, 'aria-hidden': 'true' }, el);
  const legend = h('div', { class: 'w-legend' },
    h('span', null, key(s('line', { x1: 1, x2: 17, y1: 4, y2: 4, stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linecap': 'round' })), 'moyenne 7 j'),
    h('span', null, key(s('circle', { cx: 9, cy: 4, r: 2.5, fill: 'var(--muted)', opacity: 0.6 })), 'pesées'),
    h('span', null, key(s('line', { x1: 1, x2: 17, y1: 4, y2: 4, stroke: 'var(--muted)', 'stroke-width': 1.5, 'stroke-dasharray': '5 3' })), 'plan'),
    h('span', null, key(s('line', { x1: 2, x2: 17, y1: 4, y2: 4, stroke: 'var(--good)', 'stroke-width': 1.5, 'stroke-dasharray': '1 4', 'stroke-linecap': 'round' })), showFinal ? 'palier, objectif final' : 'palier'),
    cycleOn ? h('span', null, key(s('circle', { cx: 9, cy: 4, r: 3, fill: 'var(--bad)', opacity: 0.75 })), 'règles') : null,
    cycleOn ? h('span', null, key(s('rect', { x: 1, y: 0, width: 16, height: 8, fill: 'var(--warn)', opacity: 0.18 })), 'avant les règles') : null,
  );

  const wrap = h('div', { class: 'stack' }, svg as unknown as Node, readout, legend);
  if (weights.length < 2) {
    wrap.appendChild(h('p', { class: 'empty' },
      weights.length === 0
        ? 'Ta courbe apparaîtra dès tes premières pesées. En attendant, voici le plan.'
        : 'Première pesée notée. La moyenne se dessine dès la suivante.'));
  }
  return wrap;
}
