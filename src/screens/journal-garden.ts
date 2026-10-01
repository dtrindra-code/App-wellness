// "Ton parcours en un coup d'œil": the 60 days as a garden path on ink.
// Chaque jour une graine, chaque semaine une pousse, 60 jours pour cultiver ton jardin
// intérieur. One bed per chapter (15 days a row, the path winds from one to the next),
// day 0 / 30 / 60 as big stones, the "Anxiété & apaisement" module as a soft pink
// stretch, today as a pink dot with a halo. A day réussie blooms (5 pink petals), a day
// with something done is a cream seed, a day ahead an outlined one; every 7th day grows
// a sprout. Compact in Équilibre (tap: full size, with the legend).

import { h, s } from '../lib/ui';
import { today } from '../lib/dates';
import { JOURNEY_DAYS, journeyMap, journeyStats, chapterInfo, checkpointDone } from '../lib/journey';
import type { MapDay } from '../lib/journey';
import { MODULES } from '../data/journey';
import { openJournalPage } from './journal-shell';

const W = 342;
const X_START = 46; // first day of a row (left side)

interface Geo { top: number; gap: number; r: number; xR: number; sp: number; h: number; full: boolean }

function geo(full: boolean): Geo {
  const gap = full ? 66 : 40;
  const top = full ? 44 : 30;
  const r = gap / 2;
  const xR = W - r - 6;
  return { top, gap, r, xR, sp: (xR - X_START) / 14, h: top + 3 * gap + (full ? 34 : 14), full };
}

type Pt = [number, number];
interface Seg { len: number; at: (d: number) => Pt }

/** The path as segments: day 0 → row 1 → turn → row 2 (right to left) → … → row 4. */
function segments(g: Geo): Seg[] {
  const ys = [0, 1, 2, 3].map((k) => g.top + k * g.gap);
  const line = (a: Pt, b: Pt): Seg => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return { len, at: (d) => [a[0] + ((b[0] - a[0]) * d) / len, a[1] + ((b[1] - a[1]) * d) / len] };
  };
  const turn = (cx: number, cy: number, right: boolean): Seg => {
    const len = Math.PI * g.r;
    return {
      len,
      at: (d) => {
        const th = right ? -Math.PI / 2 + (d / len) * Math.PI : -Math.PI / 2 - (d / len) * Math.PI;
        return [cx + g.r * Math.cos(th), cy + g.r * Math.sin(th)];
      },
    };
  };
  return [
    line([22, ys[0]], [g.xR, ys[0]]),
    turn(g.xR, ys[0] + g.r, true),
    line([g.xR, ys[1]], [X_START, ys[1]]),
    turn(X_START, ys[1] + g.r, false),
    line([X_START, ys[2]], [g.xR, ys[2]]),
    turn(g.xR, ys[2] + g.r, true),
    line([g.xR, ys[3]], [X_START, ys[3]]),
  ];
}

/** Distance along the path of journey day `n` (0 … 60). */
function tOf(n: number, g: Geo, segs: Seg[]): number {
  if (n <= 0) return 0;
  const row = Math.min(3, Math.floor((n - 1) / 15));
  const i = (n - 1) % 15;
  let t = 0;
  for (let k = 0; k < row * 2; k++) t += segs[k].len;
  return t + (row === 0 ? X_START - 22 : 0) + i * g.sp;
}

function pointAt(t: number, segs: Seg[]): Pt {
  let rest = Math.max(0, t);
  for (const sg of segs) {
    if (rest <= sg.len) return sg.at(rest);
    rest -= sg.len;
  }
  const last = segs[segs.length - 1];
  return last.at(last.len);
}

/** SVG path data from t0 to t1, sampled every 3 units. */
function sample(t0: number, t1: number, segs: Seg[]): string {
  if (t1 - t0 < 0.5) return '';
  const pts: Pt[] = [];
  for (let t = t0; t < t1; t += 3) pts.push(pointAt(t, segs));
  pts.push(pointAt(t1, segs));
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
}

function flower(x: number, y: number): SVGElement {
  const g = s('g', { class: 'jg-bloom' });
  for (let k = 0; k < 5; k++) {
    const a = (-90 + k * 72) * (Math.PI / 180);
    g.append(s('circle', { class: 'jg-petal', cx: (x + 3.6 * Math.cos(a)).toFixed(1), cy: (y + 3.6 * Math.sin(a)).toFixed(1), r: 2.9 }));
  }
  g.append(s('circle', { class: 'jg-heart', cx: x.toFixed(1), cy: y.toFixed(1), r: 1.9 }));
  return g;
}

function sprout(x: number, y: number): SVGElement {
  const top = y - 13;
  return s('g', { class: 'jg-sprout', 'aria-hidden': 'true' },
    s('path', { d: `M${x} ${y - 5} V${top}` }),
    s('path', { d: `M${x} ${top + 3} q-6 -1 -7 -7 q6 0 7 7z` }),
    s('path', { d: `M${x} ${top + 4} q6 -1 7 -6 q-6 -1 -7 6z` }),
  );
}

function stop(d: MapDay, x: number, y: number): SVGElement | null {
  if (d.checkpoint !== undefined) {
    return s('circle', { class: `jg-stone ${d.status}`, cx: x.toFixed(1), cy: y.toFixed(1), r: 7.5 });
  }
  if (d.status === 'bloom') return flower(x, y);
  return s('circle', { class: `jg-seed ${d.status}`, cx: x.toFixed(1), cy: y.toFixed(1), r: 3 });
}

const LANDMARKS: Record<number, string> = { 0: 'Point de départ', 30: 'Premier regard', 60: 'Découvertes' };

/** The garden map SVG (compact: Équilibre; full: the sheet). */
export function gardenSvg(date: string = today(), full = false): SVGSVGElement {
  const g = geo(full);
  const segs = segments(g);
  const total = segs.reduce((a, x) => a + x.len, 0);
  const map = journeyMap(date);
  const todayDay = map.find((x) => x.status === 'today')?.day ?? null;
  const past = map.filter((x) => x.status !== 'future' && x.status !== 'today' && x.day > 0).length;
  const tNow = todayDay !== null ? tOf(todayDay, g, segs) : past >= JOURNEY_DAYS ? total : past ? tOf(past, g, segs) : 0;

  const svg = s('svg', { class: 'jg-svg' + (full ? ' full' : ''), viewBox: `0 0 ${W} ${g.h}`, 'aria-hidden': 'true', focusable: 'false' }) as SVGSVGElement;
  // Text goes on top of everything (drawn last, with an ink halo).
  const labels: SVGElement[] = [];

  // Module stretch (under the path).
  for (const m of MODULES) {
    const a = tOf(m.days[0], g, segs) - g.sp / 2, b = tOf(m.days[m.days.length - 1], g, segs) + g.sp / 2;
    svg.append(s('path', { class: 'jg-module', d: sample(a, b, segs) }));
    if (full) {
      const [mx, my] = pointAt((a + b) / 2, segs);
      labels.push(s('text', { class: 'jg-label mod', x: mx.toFixed(1), y: (my - 17).toFixed(1), 'text-anchor': 'middle' }, m.title));
    }
  }
  // The path: walked (pink, solid) and ahead (dashed).
  if (tNow > 0) svg.append(s('path', { class: 'jg-walked', d: sample(0, tNow, segs) }));
  svg.append(s('path', { class: 'jg-ahead', d: sample(tNow, total, segs) }));

  // Chapter names, at the start of each bed (hidden where the "Tu es ici" tag sits).
  const tagAt = todayDay !== null ? pointAt(tOf(todayDay, g, segs), segs) : null;
  for (let c = 1; c <= 4; c++) {
    const [x, y] = pointAt(tOf((c - 1) * 15 + 1, g, segs), segs);
    const leftToRight = c % 2 === 1;
    const title = chapterInfo(c).title;
    const wEst = title.length * 6.4;
    const x0 = leftToRight ? x - 4 : x + 4 - wEst;
    if (tagAt && Math.abs(tagAt[1] - y) < 2 && tagAt[0] + 52 > x0 && tagAt[0] - 52 < x0 + wEst) continue;
    labels.push(s('text', { class: 'jg-label', x: (leftToRight ? x - 4 : x + 4).toFixed(1), y: (y - 12).toFixed(1), 'text-anchor': leftToRight ? 'start' : 'end' }, title));
  }

  // Stops.
  for (const d of map) {
    const [x, y] = pointAt(tOf(d.day, g, segs), segs);
    if (d.sprout && d.status !== 'today') svg.append(sprout(x, y));
    if (d.status === 'today') continue;
    const el = stop(d, x, y);
    if (el) svg.append(el);
    if (full && LANDMARKS[d.day] !== undefined) {
      labels.push(s('text', { class: 'jg-label mark', x: (x - 4).toFixed(1), y: (y + 22).toFixed(1), 'text-anchor': 'start' }, LANDMARKS[d.day]));
    }
  }

  svg.append(...labels);
  // Today: halo, dot, "Tu es ici · J9".
  if (todayDay !== null && tagAt) {
    const [x, y] = tagAt;
    svg.append(s('circle', { class: 'jg-halo', cx: x.toFixed(1), cy: y.toFixed(1), r: 11 }));
    svg.append(s('circle', { class: 'jg-now', cx: x.toFixed(1), cy: y.toFixed(1), r: 6 }));
    const label = `Tu es ici · J${todayDay}`;
    const tw = label.length * 6.6 + 16;
    const tx = Math.max(2, Math.min(W - tw - 2, x - tw / 2));
    const ty = y - 34;
    svg.append(s('g', { class: 'jg-tag' },
      s('rect', { x: tx.toFixed(1), y: ty.toFixed(1), width: tw.toFixed(1), height: 20, rx: 10 }),
      s('text', { x: (tx + tw / 2).toFixed(1), y: (ty + 14).toFixed(1), 'text-anchor': 'middle' }, label)));
  }
  return svg;
}

/** Screen-reader summary: one sentence and one line per chapter. */
function summary(date: string): { label: string; list: HTMLElement } {
  const map = journeyMap(date);
  const st = journeyStats(date);
  const blooms = map.filter((x) => x.day > 0 && x.status === 'bloom').length;
  const d0 = checkpointDone('0');
  const label = st && st.day >= 1
    ? `Ton parcours : jour ${st.day} sur ${JOURNEY_DAYS}, chapitre ${st.chapter}, ${blooms} jour${blooms > 1 ? 's' : ''} en fleur, point de départ ${d0 ? 'noté' : 'à faire'}.`
    : `Ton parcours de ${JOURNEY_DAYS} jours, pas encore commencé : toutes les graines t’attendent.`;
  const list = h('ol', { class: 'sr-only' },
    [1, 2, 3, 4].map((c) => {
      const days = map.filter((x) => x.chapter === c && x.day > 0);
      const b = days.filter((x) => x.status === 'bloom').length;
      const now = days.find((x) => x.status === 'today');
      return h('li', null, `Chapitre ${c}, ${chapterInfo(c).title} : ${b} jour${b > 1 ? 's' : ''} en fleur sur ${days.length}${now ? `, tu es au jour ${now.day}` : ''}.`);
    }));
  return { label, list };
}

/** Équilibre: the compact map in the ink card (≈ 180 px). Tap: full size. */
export function gardenCompact(date: string = today()): HTMLElement {
  const { label, list } = summary(date);
  const svg = gardenSvg(date, false);
  return h('div', { class: 'jg' },
    h('div', { class: 'jg-head' },
      h('span', { class: 'jg-title' }, 'Ton parcours en un coup d’œil'),
      h('button', { class: 'jg-more', type: 'button', onclick: () => openGardenSheet(date) }, 'En grand ›')),
    h('div', { class: 'jg-map', role: 'img', 'aria-label': label, onclick: () => openGardenSheet(date) }, svg),
    list,
  );
}

function legendGlyph(kind: string): SVGElement {
  const g = s('svg', { class: 'jg-key', viewBox: '0 0 28 28', 'aria-hidden': 'true' });
  g.append(s('circle', { class: 'jg-key-bg', cx: 14, cy: 14, r: 14 }));
  if (kind === 'bloom') g.append(flower(14, 15));
  else if (kind === 'seed') g.append(s('circle', { class: 'jg-seed seed', cx: 14, cy: 14, r: 3.4 }));
  else if (kind === 'future') g.append(s('circle', { class: 'jg-seed future', cx: 14, cy: 14, r: 3.4 }));
  else if (kind === 'sprout') g.append(sprout(14, 22));
  else if (kind === 'stone') g.append(s('circle', { class: 'jg-stone future', cx: 14, cy: 14, r: 7 }));
  else if (kind === 'module') g.append(s('path', { class: 'jg-module', d: 'M5 14 H23' }));
  else if (kind === 'now') { g.append(s('circle', { class: 'jg-halo', cx: 14, cy: 14, r: 10 })); g.append(s('circle', { class: 'jg-now', cx: 14, cy: 14, r: 5.5 })); }
  return g;
}

/** Full-size map: the garden on the ink cover, the legend on the cream page. */
export function openGardenSheet(date: string = today()) {
  const st = journeyStats(date);
  const { label, list } = summary(date);
  const mod = MODULES[0];
  const legend: [string, string][] = [
    ['now', 'Tu es ici'],
    ['bloom', 'Une journée en fleur : 4 engagements sur 5, ou un joker'],
    ['seed', 'Une graine : un pas fait, ça compte aussi'],
    ['future', 'Les graines à venir'],
    ['sprout', 'Chaque semaine, une pousse'],
    ['stone', 'Les étapes : point de départ, jour 30, jour 60'],
    ['module', mod ? `Le module « ${mod.title} », jours ${mod.days[0]} à ${mod.days[mod.days.length - 1]}` : 'Un module'],
  ];
  const page = openJournalPage({
    eyebrow: st && st.day >= 1 ? `Revenir à moi · Jour ${st.day} / ${JOURNEY_DAYS}` : 'Revenir à moi',
    title: 'Ton parcours',
    sub: 'Chaque jour une graine, chaque semaine une pousse, 60 jours pour cultiver ton jardin intérieur.',
    coverExtra: h('div', { class: 'jg-map full', role: 'img', 'aria-label': label }, gardenSvg(date, true)),
    meta: st && st.day >= 1 ? [`Chapitre ${st.chapter}`, `${st.success} en fleur`] : ['60 jours', '4 chapitres'],
    body: [
      h('ul', { class: 'jg-legend' }, legend.map(([k, t]) => h('li', null, legendGlyph(k), h('span', null, t)))),
      list,
      h('p', { class: 'jn-whisper' }, 'Un jour sans fleur ne fane rien : le chemin continue, et chaque graine compte.'),
    ],
    primary: { label: 'Fermer', run: () => page.close() },
  });
}
