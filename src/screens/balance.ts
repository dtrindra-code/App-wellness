// "Équilibre": cycle + lifestyle (sleep, stress, cortisol). Order: where I am in
// my cycle, today's pillars, a breathing break, Garmin numbers, what they say,
// and a short cortisol reminder.

import type { Screen, ScreenCtx } from './types';
import type { CycleDay, DayLog, Profile, Wellbeing } from '../types';
import { store } from '../store';
import { h, gearIcon, field, openSheet, parseNum, toast, fmtInt } from '../lib/ui';
import { today, addDays, daysBetween, fmtShort, fmtDayMonth, fmtLong, mondayOf } from '../lib/dates';
import { cycleOn, cycleSettings, adviceFor, phaseLabel, TTC_TIPS, PREGNANCY_NOTE } from '../lib/cycle';
import type { CycleInfo, CyclePhase } from '../lib/cycle';
import {
  HABITS, habitScore, weekHabitStats, recoveryFlag, sleepWeightInsight, recentWellbeing,
  COHERENCE_TARGET,
} from '../lib/habits';
import { openBreathing } from './breathing';

// ---------- transient UI state ----------
/** Habit keys whose "why" is unfolded. */
const whyOpen = new Set<string>();
let ttcOpen = false;
let confirmPregnancyOff = false;

const SYMPTOMS = ['crampes', 'ballonnements', 'fatigue', 'fringales', 'maux de tête', 'seins sensibles', 'humeur basse'];
const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const renderBalance: Screen = (root, ctx) => {
  const date = today();
  const p = store.profile;
  const cs = cycleSettings(p);
  const info = cs.tracking && !cs.pregnant ? cycleOn(date, p, store.state.days) : null;

  root.append(header(date, ctx, info));
  if (cs.tracking) root.append(cs.pregnant ? pregnancyCard(date) : cycleCard(date, p, info));
  root.append(pillarsCard(date), breathingCard(date), garminCard(date), insightsCard(date), cortisolCard());
};

// ---------- header ----------

function header(date: string, ctx: ScreenCtx, info: CycleInfo | null): HTMLElement {
  const cs = cycleSettings(store.profile);
  let eyebrow = fmtLong(date);
  if (cs.tracking && cs.pregnant) eyebrow = 'Mode grossesse';
  else if (info) eyebrow = `${phaseLabel(info.phase)} · J${info.day}`;
  return h('header', { class: 'screen-head' },
    h('div', { class: 'stack', style: 'gap:4px' },
      h('div', { class: 'eyebrow' }, eyebrow),
      h('h1', null, 'Équilibre'),
    ),
    h('button', { class: 'btn-icon', 'aria-label': 'Réglages', type: 'button', onclick: () => ctx.go('settings') }, gearIcon()),
  );
}


// ---------- cycle helpers ----------

/** Mutate today's (or any day's) cycle log; empty logs are removed. */
function updateCycle(date: string, fn: (c: CycleDay) => void) {
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

function phaseOfDay(d: string, info: CycleInfo, periodLength: number): CyclePhase {
  const n = daysBetween(info.cycleStart, d) + 1;
  if (d >= info.nextPeriod) return 'retard';
  if (n <= periodLength) return 'regles';
  if (d >= info.fertileStart && d <= info.fertileEnd) return 'fertile';
  if (d < info.fertileStart) return 'folliculaire';
  if (daysBetween(d, info.nextPeriod) <= 5) return 'premenstruel';
  return 'luteale';
}

// ---------- 1. cycle ----------

function cycleCard(date: string, p: Profile, info: CycleInfo | null): HTMLElement {
  const cs = cycleSettings(p);
  const card = h('section', { class: 'card' });

  if (!info) {
    card.append(
      h('h2', null, 'Cycle'),
      h('p', { class: 'small muted' }, 'Note le 1er jour de tes dernières règles : l’app estimera ta phase, ton ovulation et tes prochaines règles.'),
      h('button', { class: 'btn primary block', type: 'button', onclick: () => openPeriodSheet(date, true) }, 'Noter mes dernières règles'),
      dailyLog(date),
    );
    return card;
  }

  const adv = adviceFor(info, p, date);
  card.append(
    h('div', { class: 'card-head' },
      h('h2', null, phaseLabel(info.phase)),
      h('span', { class: 'small muted num' }, `Jour ${info.day} du cycle (~${info.length} j)`),
    ),
    cycleStrip(date, info, cs.periodLength),
    h('div', { class: 'grid-3 bal-dates' },
      stat('Prochaines règles', fmtDayMonth(info.nextPeriod)),
      stat(info.ovulationFromLH ? 'Ovulation (test LH)' : 'Ovulation', fmtDayMonth(info.ovulation)),
      stat('Fenêtre fertile', `${fmtDayMonth(info.fertileStart)} – ${fmtDayMonth(info.fertileEnd)}`),
    ),
    h('p', { class: 'small muted' }, 'Dates estimées d’après tes cycles notés : chaque cycle peut varier.'),
    h('div', { class: 'stack bal-advice', style: 'gap:6px' },
      h('h3', null, adv.headline),
      h('p', { class: 'small' }, adv.body),
    ),
    h('div', { class: 'list' },
      adviceRow('Sport', adv.sport),
      adviceRow('Assiette', adv.food),
      adviceRow('Balance', adv.weight),
    ),
  );

  if (info.phase === 'retard') card.append(lateBlock(date, info));

  const posTest = Object.values(store.state.days).some((d) => d.date >= info.cycleStart && d.date <= date && d.cycle?.pregnancyTest === 'pos');
  if (posTest) card.append(pregnancyOffer(date));

  if (cs.ttc) {
    const list = h('ul', { class: 'bal-list small', hidden: !ttcOpen }, TTC_TIPS.map((t) => h('li', null, t)));
    const sign = h('span', { class: 'muted' }, ttcOpen ? '−' : '+');
    const fold = h('button', {
      class: 'bal-fold', type: 'button', 'aria-expanded': ttcOpen ? 'true' : 'false',
      onclick: () => {
        ttcOpen = !ttcOpen;
        list.hidden = !ttcOpen;
        sign.textContent = ttcOpen ? '−' : '+';
        fold.setAttribute('aria-expanded', ttcOpen ? 'true' : 'false');
      },
    }, h('span', null, 'Essai bébé'), sign);
    card.append(fold, list);
  }

  card.append(dailyLog(date), h('button', { class: 'btn ghost sm', type: 'button', style: 'align-self:flex-start', onclick: () => openPeriodSheet(date, false) }, 'Début de règles un autre jour'));
  return card;
}

function stat(label: string, value: string): HTMLElement {
  return h('div', { class: 'stat' }, h('span', { class: 'label' }, label), h('span', { class: 'num small', style: 'font-weight:500' }, value));
}

function adviceRow(title: string, text: string): HTMLElement {
  return h('div', { class: 'list-row', style: 'align-items:flex-start' },
    h('span', { class: 'bal-tag' }, title),
    h('p', { class: 'main small' }, text),
  );
}

function cycleStrip(date: string, info: CycleInfo, periodLength: number): HTMLElement {
  const n = Math.min(60, Math.max(info.length, info.day));
  const cells: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(info.cycleStart, i);
    const ph = phaseOfDay(d, info, periodLength);
    const cls = ['bal-cell', `ph-${ph}`];
    if (d === date) cls.push('today');
    if (d === info.ovulation) cls.push('ov');
    cells.push(h('span', { class: cls.join(' '), title: `${fmtShort(d)} · ${phaseLabel(ph)}` }));
  }
  return h('div', { class: 'stack', style: 'gap:6px' },
    h('div', { class: 'bal-strip', role: 'img', 'aria-label': `Cycle en cours, jour ${info.day} sur environ ${info.length}` }, cells),
    h('div', { class: 'w-legend' },
      legend('ph-regles', 'Règles'), legend('ph-fertile', 'Fertile'), legend('ph-luteale', 'Lutéale'), legend('ph-premenstruel', 'Avant règles'),
    ),
  );
}

function legend(cls: string, label: string): HTMLElement {
  return h('span', null, h('i', { class: `bal-cell bal-key ${cls}` }), label);
}

function lateBlock(date: string, info: CycleInfo): HTMLElement {
  const test = store.getDay(date).cycle?.pregnancyTest;
  return h('div', { class: 'stack bal-sub', style: 'gap:8px' },
    h('h3', null, 'Faire un test'),
    h('p', { class: 'small' },
      info.lateBy >= 1
        ? 'Un test urinaire est fiable dès le jour des règles attendues. Le matin, avec les premières urines, c’est le plus sûr. Négatif et toujours rien dans 3 jours : refais-en un.'
        : 'Tes règles sont attendues aujourd’hui. Si rien demain, un test urinaire est déjà fiable.'),
    h('div', { class: 'row wrap', style: 'gap:6px' },
      h('span', { class: 'small muted' }, 'Test du jour :'),
      toggleChip('Négatif', test === 'neg', () => updateCycle(date, (c) => { c.pregnancyTest = test === 'neg' ? undefined : 'neg'; })),
      toggleChip('Positif', test === 'pos', () => updateCycle(date, (c) => { c.pregnancyTest = test === 'pos' ? undefined : 'pos'; })),
    ),
  );
}

function pregnancyOffer(date: string): HTMLElement {
  const cs = cycleSettings(store.profile);
  return h('div', { class: 'card accent', style: 'gap:8px' },
    h('h3', null, 'Test positif'),
    h('p', { class: 'small' }, 'Prends ton temps pour savourer. Pense à prendre rendez-vous avec ton médecin ou ta sage-femme.'),
    h('p', { class: 'small' }, PREGNANCY_NOTE),
    h('button', {
      class: 'btn primary block', type: 'button',
      onclick: () => { void store.saveProfile({ cycle: { ...cs, pregnant: true, pregnantSince: date } }); toast('Mode grossesse activé'); },
    }, 'Activer le mode grossesse'),
  );
}

function pregnancyCard(date: string): HTMLElement {
  const cs = cycleSettings(store.profile);
  const since = cs.pregnantSince ?? date;
  const n = Math.max(0, daysBetween(since, date));
  const weeks = Math.floor(n / 7);
  const rest = n % 7;
  const span = weeks ? `${weeks} sem.${rest ? ` et ${rest} j` : ''}` : `${n} j`;
  const offSlot = h('div', { class: 'row' });
  const paintOff = () => offSlot.replaceChildren(...(confirmPregnancyOff
    ? [
        h('button', { class: 'btn sm danger grow', type: 'button', onclick: () => { confirmPregnancyOff = false; void store.saveProfile({ cycle: { ...cs, pregnant: false, pregnantSince: undefined } }); } }, 'Oui, désactiver'),
        h('button', { class: 'btn sm grow', type: 'button', onclick: () => { confirmPregnancyOff = false; paintOff(); } }, 'Annuler'),
      ]
    : [h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { confirmPregnancyOff = true; paintOff(); } }, 'Désactiver le mode grossesse')]));
  paintOff();
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Grossesse'), h('span', { class: 'small muted' }, `depuis le ${fmtDayMonth(since)}`)),
    h('div', { class: 'stat' }, h('span', { class: 'value' }, span), h('span', { class: 'label' }, 'depuis l’activation du mode (pas l’âge de la grossesse)')),
    h('p', { class: 'small' }, PREGNANCY_NOTE),
    h('p', { class: 'small muted' }, 'Acide folique : demande à ton médecin ou ta sage-femme.'),
    offSlot,
  );
}

function dailyLog(date: string): HTMLElement {
  const c = store.getDay(date).cycle ?? {};
  const bleeding = c.period === 'start' || c.period === 'flow';
  const symptoms = c.symptoms ?? [];

  const togglePeriod = () => updateCycle(date, (cy) => {
    if (bleeding) { cy.period = undefined; return; }
    const prev = store.getDay(addDays(date, -1)).cycle?.period;
    const prevBleeding = prev === 'start' || prev === 'flow';
    // A start logged in the last few days means we are still in the same period.
    const recent = cycleOn(addDays(date, -1), store.profile, store.state.days);
    const sameBleed = recent !== null && recent.day <= cycleSettings(store.profile).periodLength + 2;
    cy.period = prevBleeding || sameBleed ? 'flow' : 'start';
  });

  return h('div', { class: 'stack bal-sub', style: 'gap:10px' },
    h('h3', null, 'Aujourd’hui'),
    h('div', { class: 'row wrap', style: 'gap:6px' },
      toggleChip('Règles aujourd’hui', bleeding, togglePeriod),
      toggleChip('Spotting', c.period === 'spotting', () => updateCycle(date, (cy) => { cy.period = c.period === 'spotting' ? undefined : 'spotting'; })),
      toggleChip('Test LH +', c.lh === 'pos', () => updateCycle(date, (cy) => { cy.lh = c.lh === 'pos' ? undefined : 'pos'; })),
      toggleChip('Test LH −', c.lh === 'neg', () => updateCycle(date, (cy) => { cy.lh = c.lh === 'neg' ? undefined : 'neg'; })),
    ),
    h('div', { class: 'row', style: 'gap:8px' },
      h('span', { class: 'small muted', style: 'flex:none' }, 'Énergie'),
      h('div', { class: 'seg grow', role: 'group', 'aria-label': 'Énergie de 1 à 5' },
        [1, 2, 3, 4, 5].map((n) =>
          h('button', {
            class: 'seg-item' + (c.energy === n ? ' on' : ''), type: 'button', 'aria-pressed': c.energy === n ? 'true' : 'false',
            onclick: () => updateCycle(date, (cy) => { cy.energy = c.energy === n ? undefined : n; }),
          }, String(n)),
        ),
      ),
    ),
    h('div', { class: 'row wrap', style: 'gap:6px' },
      SYMPTOMS.map((s) => toggleChip(s, symptoms.includes(s), () => updateCycle(date, (cy) => {
        const set = new Set(cy.symptoms ?? []);
        if (set.has(s)) set.delete(s); else set.add(s);
        cy.symptoms = SYMPTOMS.filter((x) => set.has(x));
      }))),
    ),
  );
}

function toggleChip(label: string, on: boolean, onclick: () => void): HTMLElement {
  return h('button', { class: 'bal-chip' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick }, label);
}

function openPeriodSheet(date: string, withHistory: boolean) {
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

// ---------- 2. pillars ----------

function pillarsCard(date: string): HTMLElement {
  const day = store.getDay(date);
  const score = habitScore(day);
  const week = weekHabitStats(store.state.days, mondayOf(date));

  const toggle = (key: string) => void store.updateDay(date, (d) => {
    const hb = { ...(d.habits ?? {}) };
    if (hb[key]) delete hb[key]; else hb[key] = true;
    d.habits = hb;
  });

  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', null, 'Mes piliers'),
      h('span', { class: 'num small muted' }, `${score}/${HABITS.length} aujourd’hui`),
    ),
    h('div', { class: 'list' },
      HABITS.map((hb) => {
        const on = !!day.habits?.[hb.key];
        const open = whyOpen.has(hb.key);
        return h('div', { class: 'list-row bal-habit', style: 'align-items:flex-start' },
          h('button', { class: 'bal-check' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', 'aria-label': hb.label, onclick: () => toggle(hb.key) }, on ? '✓' : ''),
          h('div', { class: 'main' },
            h('button', {
              class: 'bal-label', type: 'button', 'aria-expanded': open ? 'true' : 'false',
              onclick: (e: Event) => {
                const btn = e.currentTarget as HTMLElement;
                const why = btn.nextElementSibling as HTMLElement;
                const nowOpen = !whyOpen.has(hb.key);
                if (nowOpen) whyOpen.add(hb.key); else whyOpen.delete(hb.key);
                why.hidden = !nowOpen;
                btn.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
              },
            }, hb.label),
            h('p', { class: 'sub', hidden: !open }, hb.why),
          ),
        );
      }),
    ),
    h('div', { class: 'bal-week', 'aria-label': 'Piliers cette semaine' },
      week.days.map((d, i) => h('div', { class: 'bal-week-day' + (d.date === date ? ' today' : '') },
        h('div', { class: 'bal-week-bar' }, h('span', { style: `height:${Math.round((d.done / HABITS.length) * 100)}%` })),
        h('span', { class: 'week-letter' }, WEEK_LETTERS[i]),
      )),
    ),
    h('p', { class: 'small muted' }, 'Touche un pilier pour savoir pourquoi il aide. Pas besoin de tout cocher.'),
  );
}

// ---------- 3. breathing ----------

function breathingCard(date: string): HTMLElement {
  const n = store.getDay(date).wellbeing?.breathing ?? 0;
  return h('section', { class: 'card' },
    h('button', { class: 'btn primary block', type: 'button', onclick: () => openBreathing(date) }, 'Cohérence cardiaque · 5 min'),
    h('p', { class: 'small muted', style: 'text-align:center' },
      n ? `${Math.min(n, 99)} séance${n > 1 ? 's' : ''} aujourd’hui${n < COHERENCE_TARGET ? ` sur ${COHERENCE_TARGET}` : ''}` : 'Idéal : matin, midi et fin d’après-midi.'),
  );
}

// ---------- 4. Garmin ----------

interface GField { key: keyof Wellbeing; label: string; unit: string; min: number; max: number; decimal: boolean; ph: string }
const GFIELDS: GField[] = [
  { key: 'sleepH', label: 'Sommeil', unit: 'h', min: 0, max: 16, decimal: true, ph: 'ex. 7,5' },
  { key: 'bodyBattery', label: 'Body Battery', unit: '', min: 0, max: 100, decimal: false, ph: 'ex. 65' },
  { key: 'stress', label: 'Stress moyen', unit: '', min: 0, max: 100, decimal: false, ph: 'ex. 30' },
  { key: 'restingHr', label: 'FC repos', unit: 'bpm', min: 30, max: 120, decimal: false, ph: 'ex. 60' },
  { key: 'steps', label: 'Pas', unit: '', min: 0, max: 100000, decimal: false, ph: 'ex. 8000' },
];

const fmtVal = (f: GField, v: number | undefined) =>
  v === undefined ? '' : f.decimal ? String(v).replace('.', ',') : f.key === 'steps' ? fmtInt(v) : String(v);

function garminCard(date: string): HTMLElement {
  const wb = store.getDay(date).wellbeing ?? {};
  const yWb = store.getDay(addDays(date, -1)).wellbeing ?? {};
  const inputs = new Map<keyof Wellbeing, HTMLInputElement>();
  const err = h('p', { class: 'small tone-bad', role: 'alert' });

  const grid = h('div', { class: 'grid-2' },
    GFIELDS.map((f) => {
      const input = h('input', {
        type: 'text', inputMode: f.decimal ? 'decimal' : 'numeric', placeholder: f.ph,
        value: fmtVal(f, wb[f.key] as number | undefined).replace(/\s/g, ''),
      });
      inputs.set(f.key, input);
      const y = yWb[f.key] as number | undefined;
      return field(f.unit ? `${f.label} (${f.unit})` : f.label, input, y !== undefined ? `Hier : ${fmtVal(f, y)}` : undefined);
    }),
  );

  function save() {
    const next: Wellbeing = { ...wb };
    for (const f of GFIELDS) {
      const raw = inputs.get(f.key)!.value.replace(/\s/g, '');
      if (!raw) { delete next[f.key]; continue; }
      const v = parseNum(raw);
      if (v === undefined || v < f.min || v > f.max) { err.textContent = `${f.label} : entre ${f.min} et ${fmtInt(f.max)}.`; return; }
      (next[f.key] as number) = f.decimal ? Math.round(v * 10) / 10 : Math.round(v);
    }
    err.textContent = '';
    (document.activeElement as HTMLElement | null)?.blur();
    void store.updateDay(date, (d) => {
      d.wellbeing = next;
      // Numbers that clearly meet a pillar tick it (never untick).
      const hb = { ...(d.habits ?? {}) };
      if ((next.sleepH ?? 0) >= 7) hb.sleep = true;
      if ((next.steps ?? 0) >= 8000) hb.walk = true;
      d.habits = hb;
    });
    toast('Chiffres enregistrés');
  }

  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Mes chiffres Garmin'), h('span', { class: 'small muted' }, 'de la nuit et d’hier')),
    grid,
    err,
    h('button', { class: 'btn block', type: 'button', onclick: save }, 'Enregistrer'),
  );
}

// ---------- 5. insights ----------

const fmtSlope = (kgWeek: number) => {
  const r = Math.round(kgWeek * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg/sem.`;
};

function insightsCard(date: string): HTMLElement {
  const days = store.state.days;
  const week = recentWellbeing(days, date, 7);
  const sleeps = week.map((x) => x.wb?.sleepH).filter((v): v is number => typeof v === 'number');
  const stresses = week.map((x) => x.wb?.stress).filter((v): v is number => typeof v === 'number');
  const flag = recoveryFlag(date, days);
  const sw = sleepWeightInsight(days, date);
  const enough = sleeps.length >= 3 || stresses.length >= 3 || sw !== null;

  const rows: HTMLElement[] = [];
  if (flag.low) rows.push(h('div', { class: 'bal-flag' }, `${flag.reason} : aujourd’hui, séance douce.`));
  if (enough) {
    if (sleeps.length) {
      const short = sleeps.filter((v) => v < 6).length;
      rows.push(insight(short ? `${short} nuit${short > 1 ? 's' : ''} sous 6 h sur 7 jours.` : 'Aucune nuit sous 6 h sur 7 jours.',
        short >= 2 ? 'Viser un coucher un peu plus tôt aide souvent plus que tout le reste.' : undefined));
    }
    if (stresses.length) {
      const high = stresses.filter((v) => v >= 50).length;
      rows.push(insight(high ? `${high} jour${high > 1 ? 's' : ''} de stress haut (50 ou plus) sur 7.` : 'Pas de journée de stress haut sur 7 jours.',
        high >= 2 ? 'Ces jours-là, marche et respiration valent mieux qu’une séance intense.' : undefined));
    }
    if (sw) {
      rows.push(insight(`Tendance du poids : ${fmtSlope(sw.goodSlope)} les semaines à 7 h de sommeil ou plus, ${fmtSlope(sw.shortSlope)} sinon.`,
        `Estimation sur ${sw.goodWeeks + sw.shortWeeks} semaines : un lien, pas une preuve.`));
    }
  }

  return h('section', { class: 'card' },
    h('h2', null, 'Ce que disent tes chiffres'),
    rows.length ? h('div', { class: 'list' }, rows) : null,
    enough ? null : h('p', { class: 'small muted' }, 'Note ton sommeil et ton stress quelques jours : ici apparaîtront tes nuits courtes, tes jours de stress et leur lien avec ton poids.'),
  );
}

function insight(text: string, sub?: string): HTMLElement {
  return h('div', { class: 'list-row' }, h('div', { class: 'main' }, h('p', { class: 'small' }, text), sub ? h('p', { class: 'sub' }, sub) : null));
}

// ---------- 6. cortisol ----------

function cortisolCard(): HTMLElement {
  return h('section', { class: 'card flat' },
    h('h2', null, 'Stress et cortisol'),
    h('div', { class: 'stack', style: 'gap:4px' },
      h('h3', { class: 'small tone-good' }, 'Ce qui fait baisser le stress'),
      h('ul', { class: 'bal-list small' },
        h('li', null, 'Des nuits de 7 h ou plus, à heures régulières'),
        h('li', null, 'La lumière du jour le matin'),
        h('li', null, 'La cohérence cardiaque'),
        h('li', null, 'Marcher dehors'),
        h('li', null, 'Lever le pied quand tu es épuisée'),
        h('li', null, 'Ne pas sauter de repas'),
        h('li', null, 'Moins de café l’après-midi'),
        h('li', null, 'Peu ou pas d’alcool'),
      ),
    ),
    h('div', { class: 'stack', style: 'gap:4px' },
      h('h3', { class: 'small tone-warn' }, 'Ce qui le fait grimper'),
      h('ul', { class: 'bal-list small' },
        h('li', null, 'Les nuits courtes'),
        h('li', null, 'Les gros déficits caloriques'),
        h('li', null, 'Les séances intenses enchaînées'),
        h('li', null, 'Les écrans tard le soir'),
      ),
    ),
    h('p', { class: 'small muted' }, 'Pas de complément « anti-cortisol » (ashwagandha…) en essai bébé ou grossesse : demande à ton médecin.'),
  );
}
