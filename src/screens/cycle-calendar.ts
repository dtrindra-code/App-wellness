// Cycle follow-up on the Équilibre tab: "tu es ici" sentence, the cycle log
// controls (today or any day), and the "Suivi" section with three views:
// month calendar, day by day, and cycle history.

import type { CycleDay, DayLog } from '../types';
import { store } from '../store';
import { h, field, openSheet, toast, fmtKg } from '../lib/ui';
import { today, addDays, daysBetween, parseISO, toISO, fmtShort, fmtDayMonth, fmtLong, weekday } from '../lib/dates';
import { cycleSettings, cycleModel, dayMark, positionOn, lengthStats, phaseLabel, periodStarts, cycleOn } from '../lib/cycle';
import type { CycleInfo, CycleModel, CyclePhase, CycleRecord } from '../lib/cycle';

export const SYMPTOMS = ['crampes', 'ballonnements', 'fatigue', 'fringales', 'maux de tête', 'seins sensibles', 'humeur basse'];

// ---------- transient UI state ----------
type View = 'cal' | 'days' | 'cycles';
let view: View = 'cal';
/** First day of the month shown in the calendar ("YYYY-MM-01"), null = current month. */
let calMonth: string | null = null;
/** Cycle shown in "Jour par jour": 0 = in progress, 1 = previous… */
let daysBack = 0;

// ---------- log helpers ----------

/** Mutate a day's cycle log; empty logs are removed. */
export function updateCycle(date: string, fn: (c: CycleDay) => void) {
  void store.updateDay(date, (d) => {
    const c: CycleDay = { ...(d.cycle ?? {}) };
    fn(c);
    (Object.keys(c) as (keyof CycleDay)[]).forEach((k) => {
      const v = c[k];
      if (v === undefined || (Array.isArray(v) && !v.length)) delete c[k];
    });
    if (Object.keys(c).length) d.cycle = c;
    else delete d.cycle;
  });
}

export function toggleChip(label: string, on: boolean, onclick: () => void): HTMLElement {
  return h('button', { class: 'bal-chip' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick }, label);
}

interface LogOpts {
  /** Heading of the block, null for none. */
  title: string | null;
  /** Explicit period choice (Rien / 1er jour / Règles / Spotting) instead of the smart toggle. */
  explicit: boolean;
  /** Also show the pregnancy test row. */
  test?: boolean;
  /** Called after each change (the sheet repaints itself; the screen re-renders on its own). */
  after?: () => void;
}

/** Cycle log controls for `date`: period, LH, (test), energy, symptoms. */
export function cycleLog(date: string, opts: LogOpts): HTMLElement {
  const c = store.getDay(date).cycle ?? {};
  const bleeding = c.period === 'start' || c.period === 'flow';
  const symptoms = c.symptoms ?? [];
  const set = (fn: (cy: CycleDay) => void) => { updateCycle(date, fn); opts.after?.(); };

  const togglePeriod = () => set((cy) => {
    if (bleeding) { cy.period = undefined; return; }
    const prev = store.getDay(addDays(date, -1)).cycle?.period;
    const prevBleeding = prev === 'start' || prev === 'flow';
    // A start logged in the last few days means we are still in the same period.
    const recent = cycleOn(addDays(date, -1), store.profile, store.state.days);
    const sameBleed = recent !== null && recent.day <= cycleSettings(store.profile).periodLength + 2;
    cy.period = prevBleeding || sameBleed ? 'flow' : 'start';
  });

  const periodRow = opts.explicit
    ? h('div', { class: 'stack', style: 'gap:6px' },
        h('span', { class: 'small muted' }, 'Règles'),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Règles ce jour-là' },
          ([[undefined, 'Rien'], ['start', '1er jour'], ['flow', 'Règles'], ['spotting', 'Spotting']] as [CycleDay['period'], string][]).map(([v, label]) =>
            h('button', {
              class: 'seg-item' + (c.period === v ? ' on' : ''), type: 'button', 'aria-pressed': c.period === v ? 'true' : 'false',
              onclick: () => set((cy) => { cy.period = v; }),
            }, label)),
        ),
        c.period === 'start' ? startHint(date) : null,
      )
    : null;

  return h('div', { class: 'stack' + (opts.title ? ' bal-sub' : ''), style: 'gap:10px' },
    opts.title ? h('h3', null, opts.title) : null,
    periodRow,
    h('div', { class: 'row wrap', style: 'gap:6px' },
      opts.explicit ? null : toggleChip('Règles aujourd’hui', bleeding, togglePeriod),
      opts.explicit ? null : toggleChip('Spotting', c.period === 'spotting', () => set((cy) => { cy.period = c.period === 'spotting' ? undefined : 'spotting'; })),
      toggleChip('Test LH +', c.lh === 'pos', () => set((cy) => { cy.lh = c.lh === 'pos' ? undefined : 'pos'; })),
      toggleChip('Test LH −', c.lh === 'neg', () => set((cy) => { cy.lh = c.lh === 'neg' ? undefined : 'neg'; })),
    ),
    opts.test
      ? h('div', { class: 'row wrap', style: 'gap:6px' },
          h('span', { class: 'small muted' }, 'Test de grossesse'),
          toggleChip('Négatif', c.pregnancyTest === 'neg', () => set((cy) => { cy.pregnancyTest = c.pregnancyTest === 'neg' ? undefined : 'neg'; })),
          toggleChip('Positif', c.pregnancyTest === 'pos', () => set((cy) => { cy.pregnancyTest = c.pregnancyTest === 'pos' ? undefined : 'pos'; })),
        )
      : null,
    h('div', { class: 'row', style: 'gap:8px' },
      h('span', { class: 'small muted', style: 'flex:none' }, 'Énergie'),
      h('div', { class: 'seg grow', role: 'group', 'aria-label': 'Énergie de 1 à 5' },
        [1, 2, 3, 4, 5].map((n) =>
          h('button', {
            class: 'seg-item' + (c.energy === n ? ' on' : ''), type: 'button', 'aria-pressed': c.energy === n ? 'true' : 'false',
            onclick: () => set((cy) => { cy.energy = c.energy === n ? undefined : n; }),
          }, String(n)),
        ),
      ),
    ),
    h('div', { class: 'row wrap', style: 'gap:6px' },
      SYMPTOMS.map((s) => toggleChip(s, symptoms.includes(s), () => set((cy) => {
        const all = new Set(cy.symptoms ?? []);
        if (all.has(s)) all.delete(s); else all.add(s);
        cy.symptoms = SYMPTOMS.filter((x) => all.has(x));
      }))),
    ),
  );
}

/** Starts less than 10 days apart count as one period (see periodStarts): say which one wins. */
function startHint(date: string): HTMLElement | null {
  const kept = periodStarts(store.state.days);
  if (kept.includes(date)) {
    const later = Object.values(store.state.days)
      .filter((d) => d.cycle?.period === 'start' && d.date > date && daysBetween(date, d.date) < 10)
      .map((d) => d.date).sort()[0];
    return later ? h('p', { class: 'small muted' }, `Ce jour devient le 1er jour de ces règles (au lieu du ${fmtDayMonth(later)}).`) : null;
  }
  const owner = kept.filter((d) => d < date).pop();
  return owner ? h('p', { class: 'small muted' }, `Des règles ont déjà commencé le ${fmtDayMonth(owner)} : ce jour compte dans les mêmes règles, pas un nouveau cycle.`) : null;
}

export function openPeriodSheet(date: string, withHistory: boolean) {
  const main = h('input', { type: 'date', max: date, value: date });
  const e1 = h('input', { type: 'date', max: date });
  const e2 = h('input', { type: 'date', max: date });
  const err = h('p', { class: 'small tone-bad', role: 'alert' });
  const content = h('div', { class: 'stack' },
    field(withHistory ? '1er jour des dernières règles' : '1er jour des règles', main),
    withHistory
      ? h('div', { class: 'stack' },
          h('p', { class: 'small muted' }, 'Facultatif : les deux précédentes, pour de meilleures estimations.'),
          h('div', { class: 'grid-2' }, field('Avant', e1), field('Encore avant', e2)))
      : null,
    err,
    h('button', { class: 'btn primary block', type: 'button', onclick: save }, 'Enregistrer'),
  );
  const sheet = openSheet(withHistory ? 'Dernières règles' : 'Début de règles', content);

  function save() {
    const dates = [main.value, e1.value, e2.value].filter(Boolean);
    if (!main.value) { err.textContent = 'Choisis une date.'; return; }
    if (dates.some((d) => d > date)) { err.textContent = 'Les dates doivent être passées.'; return; }
    if (new Set(dates).size !== dates.length) { err.textContent = 'Deux dates identiques.'; return; }
    for (const d of dates) {
      void store.updateDay(d, (day: DayLog) => { day.cycle = { ...(day.cycle ?? {}), period: 'start' }; });
    }
    sheet.close();
    toast('Noté');
  }
}

// ---------- "tu es ici" ----------

const WHERE: Record<CyclePhase, string> = {
  regles: 'pendant tes règles',
  folliculaire: 'en phase folliculaire',
  fertile: 'en fenêtre fertile',
  luteale: 'en phase lutéale',
  premenstruel: 'avant les règles',
  retard: 'règles en retard',
};

/** "Tu es au jour 19 sur ~23 : avant les règles. Règles prévues dans ~4 j (3 oct.)." */
export function hereSentence(date: string, info: CycleInfo): string {
  const first = `Tu es au jour ${info.day} sur ~${info.length} : ${WHERE[info.phase]}`;
  if (info.phase === 'retard') {
    return info.lateBy >= 1 ? `${first} de ${info.lateBy} j (prévues le ${fmtDayMonth(info.nextPeriod)}).` : `${first.replace('règles en retard', 'règles attendues aujourd’hui')}.`;
  }
  const n = daysBetween(date, info.nextPeriod);
  const what = info.phase === 'regles' ? 'Prochaines règles prévues' : 'Règles prévues';
  const when = n <= 1 ? (n === 1 ? 'demain' : 'aujourd’hui') : `dans ~${n} j`;
  let second = `${what} ${when} (${fmtDayMonth(info.nextPeriod)}).`;
  if (info.phase === 'fertile' || (info.phase === 'folliculaire' && daysBetween(date, info.fertileStart) <= 3)) {
    const ovN = daysBetween(date, info.ovulation);
    const ovWhen = ovN === 0 ? 'aujourd’hui' : ovN === 1 ? 'demain' : ovN > 0 ? `le ${fmtDayMonth(info.ovulation)}` : `passée (${fmtDayMonth(info.ovulation)})`;
    second = `Ovulation ${info.ovulationFromLH ? '(test LH)' : 'estimée'} ${ovWhen}. ${second}`;
  }
  return `${first}. ${second}`;
}

// ---------- the "Suivi" section ----------

export function trackCard(date: string): HTMLElement {
  const card = h('section', { class: 'card' });
  const paint = () => {
    const m = cycleModel(date, store.profile, store.state.days);
    card.replaceChildren(
      h('div', { class: 'card-head' }, h('h2', null, 'Suivi du cycle'), h('span', { class: 'small muted' }, 'jour par jour, mois par mois')),
      h('div', { class: 'seg cc-tabs', role: 'tablist', 'aria-label': 'Vue du suivi' },
        ([['cal', 'Calendrier'], ['days', 'Jour par jour'], ['cycles', 'Mes cycles']] as [View, string][]).map(([v, label]) =>
          h('button', {
            class: 'seg-item' + (view === v ? ' on' : ''), role: 'tab', type: 'button', 'aria-selected': view === v ? 'true' : 'false',
            onclick: () => { view = v; paint(); },
          }, label)),
      ),
      view === 'cal' ? calendarView(m, paint) : view === 'days' ? daysView(m, paint) : cyclesView(m),
    );
  };
  paint();
  return card;
}

// ---------- calendar ----------

const monthStart = (d: string) => d.slice(0, 8) + '01';
function shiftMonth(first: string, n: number): string {
  const d = parseISO(first);
  d.setMonth(d.getMonth() + n, 1);
  return toISO(d);
}
function monthLabel(first: string): string {
  const s = parseISO(first).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function calendarView(m: CycleModel, repaint: () => void): HTMLElement {
  const days = store.state.days;
  const current = monthStart(m.today);
  const first = calMonth ?? current;
  const earliest = m.starts[0] ? monthStart(m.starts[0]) : shiftMonth(current, -3);
  const floor = shiftMonth(current, -24);
  const minMonth = shiftMonth(earliest < floor ? floor : earliest, -1);
  const maxMonth = shiftMonth(current, 6);
  const go = (n: number) => { calMonth = shiftMonth(first, n); repaint(); };

  const cells: HTMLElement[] = [];
  const lead = weekday(first);
  for (let i = 0; i < lead; i++) cells.push(h('span', { class: 'cc-day empty', 'aria-hidden': 'true' }));
  const next = shiftMonth(first, 1);
  for (let d = first; d < next; d = addDays(d, 1)) {
    const mk = dayMark(m, d, days);
    const cls = ['cc-day'];
    if (mk.period) cls.push('per');
    if (mk.predictedPeriod) cls.push('pred');
    if (mk.fertile) cls.push('fer');
    if (mk.ovulation) cls.push('ov');
    if (mk.future) cls.push('fut');
    if (d === m.today) cls.push('today');
    const bits: string[] = [];
    if (mk.period) bits.push('règles');
    if (mk.spotting) bits.push('spotting');
    if (mk.predictedPeriod) bits.push('règles prévues');
    if (mk.fertile) bits.push(mk.future ? 'fertile (prévu)' : 'fertile (estimé)');
    if (mk.ovulation) bits.push('ovulation estimée');
    if (mk.lhPos) bits.push('LH positif');
    if (mk.noted) bits.push('noté');
    cells.push(h('button', {
      class: cls.join(' '), type: 'button',
      'aria-label': `${fmtShort(d)}${d === m.today ? ', aujourd’hui' : ''}${bits.length ? ' : ' + bits.join(', ') : ''}`,
      onclick: () => openDaySheet(d),
    },
      h('span', { class: 'cc-num num' }, String(parseISO(d).getDate())),
      mk.lhPos ? h('i', { class: 'cc-lh', 'aria-hidden': 'true' }) : null,
      mk.spotting || mk.noted
        ? h('span', { class: 'cc-dots', 'aria-hidden': 'true' }, mk.spotting ? h('i', { class: 'cc-spot' }) : null, mk.noted ? h('i', { class: 'cc-note' }) : null)
        : null,
    ));
  }

  return h('div', { class: 'stack', style: 'gap:10px' },
    h('div', { class: 'day-nav' },
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Mois précédent', disabled: first <= minMonth, onclick: () => go(-1) }, '‹'),
      h('span', { class: 'label' }, monthLabel(first)),
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Mois suivant', disabled: first >= maxMonth, onclick: () => go(1) }, '›'),
    ),
    first !== current
      ? h('button', { class: 'btn ghost sm', type: 'button', style: 'align-self:center', onclick: () => { calMonth = null; repaint(); } }, 'Revenir à ce mois-ci')
      : null,
    h('div', { class: 'cc-grid cc-head', 'aria-hidden': 'true' }, ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l) => h('span', null, l))),
    h('div', { class: 'cc-grid', role: 'group', 'aria-label': monthLabel(first) }, cells),
    h('div', { class: 'w-legend cc-legend' },
      key('per', 'Règles notées'), key('pred', 'Règles prévues'), key('fer', 'Fertile'), key('ov', 'Ovulation estimée'),
      h('span', null, h('i', { class: 'cc-key-dot cc-spot' }), 'Spotting'),
      h('span', null, h('i', { class: 'cc-key-lh' }), 'LH +'),
      h('span', null, h('i', { class: 'cc-key-dot cc-note' }), 'Énergie ou symptômes'),
    ),
    h('p', { class: 'small muted' }, m.info
      ? `Les jours à venir sont prévus d’après ton cycle moyen (~${m.length} j) : plus clairs, à titre indicatif. Touche un jour pour le voir ou le modifier.`
      : 'Touche un jour pour noter tes règles, un test ou tes symptômes.'),
  );
}

function key(cls: string, label: string): HTMLElement {
  return h('span', null, h('i', { class: `cc-key ${cls}` }), label);
}

// ---------- day sheet ----------

function logSummary(d: DayLog | undefined): string[] {
  const c = d?.cycle;
  const out: string[] = [];
  if (c?.period === 'start') out.push('1er jour des règles');
  else if (c?.period === 'flow') out.push('Règles');
  else if (c?.period === 'spotting') out.push('Spotting');
  if (c?.lh) out.push(c.lh === 'pos' ? 'LH +' : 'LH −');
  if (c?.pregnancyTest) out.push(c.pregnancyTest === 'pos' ? 'Test grossesse +' : 'Test grossesse −');
  if (c?.energy !== undefined) out.push(`Énergie ${c.energy}/5`);
  if (c?.symptoms?.length) out.push(c.symptoms.join(', '));
  if (typeof d?.weight === 'number') out.push(`${fmtKg(d.weight)} kg`);
  return out;
}

function positionLine(m: CycleModel, date: string): string {
  const pos = positionOn(m, date);
  if (!pos) return 'Avant ton premier cycle noté.';
  const parts = [`J${pos.day}`, phaseLabel(pos.phase) + (pos.predicted ? ' (prévu)' : '')];
  if (date === pos.ovulation) parts.push(pos.ovulationFromLH ? 'ovulation (test LH)' : 'ovulation estimée');
  return parts.join(' · ');
}

export function openDaySheet(date: string) {
  const body = h('div', { class: 'stack' });
  const paint = () => {
    const m = cycleModel(today(), store.profile, store.state.days);
    const future = date > m.today;
    body.replaceChildren(h('div', { class: 'stack' },
      h('p', { class: 'small cc-sheet-pos' }, positionLine(m, date)),
      future
        ? h('p', { class: 'small muted' }, 'Ce jour n’est pas encore passé : ce qui s’affiche est une prévision. Tu pourras le noter le moment venu.')
        : cycleLog(date, { title: null, explicit: true, test: true, after: paint }),
      typeof store.getDay(date).weight === 'number' ? h('p', { class: 'small muted' }, `Pesée ce jour-là : ${fmtKg(store.getDay(date).weight)} kg`) : null,
    ));
  };
  paint();
  const title = fmtLong(date);
  openSheet(title.charAt(0).toUpperCase() + title.slice(1), body);
}

// ---------- day by day ----------

function daysView(m: CycleModel, repaint: () => void): HTMLElement {
  if (!m.cycles.length) {
    return h('p', { class: 'empty' }, 'Note le 1er jour de tes règles : chaque jour du cycle s’affichera ici, avec ce que tu as noté.');
  }
  const back = Math.min(daysBack, m.cycles.length - 1);
  const c = m.cycles[m.cycles.length - 1 - back];
  const last = c.next ? addDays(c.next, -1) : m.today;
  const rows: HTMLElement[] = [];
  for (let d = last; d >= c.start; d = addDays(d, -1)) {
    const pos = positionOn(m, d);
    const log = logSummary(store.state.days[d]);
    rows.push(h('button', { class: 'cc-row' + (d === m.today ? ' today' : ''), type: 'button', onclick: () => openDaySheet(d) },
      h('span', { class: 'cc-row-day num' }, `J${daysBetween(c.start, d) + 1}`),
      h('span', { class: 'cc-row-main' },
        h('span', { class: 'cc-row-top' },
          h('span', { class: 'cc-row-date' }, d === m.today ? 'Aujourd’hui' : fmtShort(d)),
          pos ? h('span', { class: `cc-phase ph-${pos.phase}` }, phaseLabel(pos.phase)) : null,
        ),
        h('span', { class: 'cc-row-log' + (log.length ? '' : ' muted') }, log.length ? log.join(' · ') : 'Rien de noté'),
      ),
    ));
  }
  const title = back === 0 ? 'Cycle en cours' : `Cycle du ${fmtDayMonth(c.start)}`;
  return h('div', { class: 'stack', style: 'gap:8px' },
    h('div', { class: 'day-nav' },
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Cycle précédent', disabled: back >= m.cycles.length - 1, onclick: () => { daysBack = back + 1; repaint(); } }, '‹'),
      h('span', { class: 'label' }, title, h('span', { class: 'small muted', style: 'display:block;font-weight:400' },
        `${fmtDayMonth(c.start)} – ${c.next ? fmtDayMonth(last) : 'aujourd’hui'} · ${c.length ?? daysBetween(c.start, m.today) + 1} j`)),
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Cycle suivant', disabled: back <= 0, onclick: () => { daysBack = back - 1; repaint(); } }, '›'),
    ),
    h('div', { class: 'cc-rows' }, rows),
    h('p', { class: 'small muted' }, 'Du plus récent au plus ancien. Touche un jour pour le modifier.'),
  );
}

// ---------- cycle history ----------

function cyclesView(m: CycleModel): HTMLElement {
  const addBtn = (label: string, primary: boolean) =>
    h('button', { class: primary ? 'btn block' : 'btn ghost sm', type: 'button', style: primary ? undefined : 'align-self:flex-start', onclick: () => openPeriodSheet(m.today, false) }, label);
  const done = m.cycles.filter((c) => c.length !== null);
  if (!done.length) {
    return h('div', { class: 'stack', style: 'gap:10px' },
      h('p', { class: 'small' }, 'Note 2–3 débuts de règles passés pour voir ton historique : durée de chaque cycle, des règles, et ta moyenne.'),
      addBtn('Ajouter un début de règles passé', true),
    );
  }
  const st = lengthStats(m);
  const current = m.cycles[m.cycles.length - 1].next === null ? m.cycles[m.cycles.length - 1] : null;
  const curDays = current ? daysBetween(current.start, m.today) + 1 : 0;
  const scale = Math.max(...done.map((c) => c.length!), current ? Math.max(curDays, m.length) : 0, 1);

  const row = (c: CycleRecord) => {
    const inProgress = c.next === null;
    const len = inProgress ? curDays : c.length!;
    const plausible = inProgress || (len >= 21 && len <= 40);
    return h('div', { class: 'cc-cyc' },
      h('div', { class: 'cc-cyc-top' },
        h('span', { class: 'cc-cyc-date' }, `${fmtDayMonth(c.start)}${inProgress ? '' : ' – ' + fmtDayMonth(addDays(c.next!, -1))}`),
        h('span', { class: 'num cc-cyc-len' }, inProgress ? `en cours · J${curDays}` : `${len} j`),
      ),
      h('div', { class: 'cc-cyc-bar', 'aria-hidden': 'true' },
        h('span', { class: 'cc-cyc-per', style: `width:${((c.periodDays ?? 0) / scale) * 100}%` }),
        h('span', { class: 'cc-cyc-rest' + (plausible ? '' : ' odd') + (c.periodDays ? '' : ' solo'), style: `width:${((len - (c.periodDays ?? 0)) / scale) * 100}%` }),
        inProgress && m.length > curDays ? h('span', { class: 'cc-cyc-pred', style: `width:${((m.length - curDays) / scale) * 100}%` }) : null,
      ),
      h('span', { class: 'small muted' },
        `Règles ${c.periodDays ? c.periodDays + ' j' : '—'} · Ovulation ${c.ovulationFromLH ? 'test LH' : inProgress && c.ovulation > m.today ? 'prévue' : 'estimée'} ${fmtDayMonth(c.ovulation)}`
        + (plausible ? '' : ' · hors moyenne (oubli de saisie ?)')),
    );
  };

  return h('div', { class: 'stack', style: 'gap:10px' },
    st
      ? h('div', { class: 'stack', style: 'gap:2px' },
          h('p', { class: 'cc-summary' }, `Cycle moyen ${st.mean} j`, st.min !== st.max ? h('span', { class: 'muted' }, ` · de ${st.min} à ${st.max} j`) : null),
          h('p', { class: 'small muted' }, `Sur ${st.count} cycle${st.count > 1 ? 's' : ''} complet${st.count > 1 ? 's' : ''}${st.excluded ? `, ${st.excluded} hors 21–40 j non compté${st.excluded > 1 ? 's' : ''}` : ''}. Sert aux prévisions.`),
        )
      : h('p', { class: 'small muted' }, 'Tes cycles notés sont hors de 21–40 j : les prévisions gardent ta durée réglée.'),
    h('div', { class: 'cc-cycs' }, [...m.cycles].reverse().map(row)),
    h('div', { class: 'w-legend' },
      h('span', null, h('i', { class: 'cc-key per' }), 'Règles notées'),
      h('span', null, h('i', { class: 'cc-key cc-key-rest' }), 'Reste du cycle'),
    ),
    done.length < 2 ? h('p', { class: 'small muted' }, 'Note 2–3 débuts de règles passés pour une moyenne plus fiable.') : null,
    addBtn('Début de règles un autre jour', false),
  );
}
