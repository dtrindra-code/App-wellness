// Horizontal cycle strip: one cell per day of the current cycle, coloured by
// phase, with an "Aujourd'hui · Jn" marker above today's cell.
import { h } from '../lib/ui';
import { store } from '../store';
import { addDays, daysBetween, fmtDayMonth, fmtShort } from '../lib/dates';
import { cycleModel, phaseLabel, positionOn } from '../lib/cycle';
import type { CycleInfo } from '../lib/cycle';

export function cycleStrip(date: string, info: CycleInfo, opts: { ends?: boolean } = {}): HTMLElement {
  const m = cycleModel(date, store.profile, store.state.days);
  const n = Math.min(60, Math.max(daysBetween(info.cycleStart, info.nextPeriod), info.day));
  const cells: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(info.cycleStart, i);
    const ph = positionOn(m, d)?.phase ?? 'retard';
    const cls = ['bal-cell', `ph-${ph}`];
    if (d === date) cls.push('today');
    if (d > date) cls.push('fut');
    if (d === info.ovulation) cls.push('ov');
    cells.push(h('span', { class: cls.join(' '), title: `${fmtShort(d)} · ${phaseLabel(ph)}${d > date ? ' (prévu)' : ''}` }));
  }
  const center = ((info.day - 0.5) / n) * 100;
  const align = center < 22 ? 'start' : center > 78 ? 'end' : 'mid';
  return h('div', { class: 'stack', style: 'gap:6px' },
    h('div', { class: 'cc-here', 'aria-hidden': 'true' },
      h('span', { class: `cc-here-label ${align}`, style: `left:${center}%` }, `Aujourd’hui · J${info.day}`),
      h('span', { class: 'cc-here-caret', style: `left:${center}%` }),
    ),
    h('div', { class: 'bal-strip', role: 'img', 'aria-label': `Cycle en cours : tu es au jour ${info.day} sur environ ${info.length}` }, cells),
    opts.ends === false ? null : h('div', { class: 'cc-strip-ends small muted num', 'aria-hidden': 'true' },
      h('span', null, `J1 · ${fmtDayMonth(info.cycleStart)}`),
      h('span', null, `règles ~${fmtDayMonth(info.nextPeriod)}`),
    ),
  );
}

export function cycleLegend(): HTMLElement {
  const item = (cls: string, label: string) => h('span', null, h('i', { class: `bal-cell bal-key ${cls}` }), label);
  return h('div', { class: 'w-legend' },
    item('ph-regles', 'Règles'), item('ph-fertile', 'Fertile'), item('ph-luteale', 'Lutéale'), item('ph-premenstruel', 'Avant règles'),
  );
}
