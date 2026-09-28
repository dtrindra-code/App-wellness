// "Équilibre": cycle + lifestyle (sleep, stress, cortisol), in sections:
// TON CYCLE ("tu es ici" first) · TON SUIVI (folded calendar) · TES PILIERS ·
// RESPIRER · TES CHIFFRES (Garmin form folded, insights) · STRESS ET CORTISOL.

import type { Screen, ScreenCtx } from './types';
import type { Profile, Wellbeing } from '../types';
import { store } from '../store';
import {
  h, gearIcon, screenTitle, heartSticker, field, parseNum, toast, fmtInt,
  sectionTitle, actionLink, infoRow, iconCircle, disclosure, keyBubble, ICON,
} from '../lib/ui';
import { today, addDays, daysBetween, fmtShort, fmtDayMonth, fmtLong, mondayOf } from '../lib/dates';
import { cycleOn, cycleSettings, cycleModel, positionOn, adviceFor, phaseLabel, TTC_TIPS, PREGNANCY_NOTE } from '../lib/cycle';
import type { CycleInfo } from '../lib/cycle';
import { cycleLog, hereSentence, openPeriodSheet, toggleChip, trackCard, updateCycle } from './cycle-calendar';
import {
  HABITS, habitScore, weekHabitStats, recoveryFlag, sleepWeightInsight, recentWellbeing,
  COHERENCE_TARGET,
} from '../lib/habits';
import { openBreathing } from './breathing';

// ---------- transient UI state ----------
/** Habit keys whose "why" is unfolded. */
const whyOpen = new Set<string>();
let confirmPregnancyOff = false;

const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const renderBalance: Screen = (root, ctx) => {
  const date = today();
  const p = store.profile;
  const cs = cycleSettings(p);
  const info = cs.tracking && !cs.pregnant ? cycleOn(date, p, store.state.days) : null;

  root.append(header(date, ctx, info));
  if (cs.tracking) {
    root.append(sectionTitle(cs.pregnant ? 'Ta grossesse' : 'Ton cycle'), cs.pregnant ? pregnancyCard(date) : cycleCard(date, p, info));
    if (!cs.pregnant) root.append(sectionTitle('Ton suivi'), trackCard(date));
  }
  root.append(
    sectionTitle('Tes piliers'), pillarsCard(date),
    sectionTitle('Respirer'), breathingCard(date),
    sectionTitle('Tes chiffres'), garminCard(date), insightsCard(date),
    sectionTitle('Stress et cortisol'), cortisolCard(),
  );
};

// ---------- header ----------

function header(date: string, ctx: ScreenCtx, info: CycleInfo | null): HTMLElement {
  const cs = cycleSettings(store.profile);
  let eyebrow = fmtLong(date);
  if (cs.tracking && cs.pregnant) eyebrow = 'Mode grossesse';
  else if (info) eyebrow = `${phaseLabel(info.phase)} · J${info.day}`;
  return h('header', { class: 'screen-head' },
    h('div', { class: 'stack', style: 'gap:4px' },
      screenTitle('Équilibre'),
      h('p', { class: 'subtitle' }, eyebrow),
    ),
    h('button', { class: 'btn-icon', 'aria-label': 'Réglages', type: 'button', onclick: () => ctx.go('settings') }, gearIcon()),
  );
}

// ---------- 1. cycle ----------

function cycleCard(date: string, p: Profile, info: CycleInfo | null): HTMLElement {
  const cs = cycleSettings(p);

  if (!info) {
    return h('section', { class: 'card ux solo' },
      infoRow({ icon: ICON.cycle, title: 'Ton cycle', detail: 'Note le 1er jour de tes dernières règles : l’app estimera ta phase, ton ovulation et tes prochaines règles.' }),
      h('button', { class: 'btn primary block bal-big', type: 'button', onclick: () => openPeriodSheet(date, true) }, 'Noter mes dernières règles'),
      disclosure('Noter aujourd’hui', () => cycleLog(date, { title: null, explicit: false }), 'bal-log'),
    );
  }

  const adv = adviceFor(info, p, date);
  const card = h('section', { class: 'card ux' },
    // "Tu es ici" first: the day in a bubble, the phase and the sentence.
    h('div', { class: 'bal-here' },
      keyBubble(`J${info.day}`, undefined, `sur ~${info.length}`),
      h('div', { class: 'bal-here-text' },
        h('span', { class: 'eyebrow' }, 'Tu es ici'),
        h('h2', null, phaseLabel(info.phase)),
        h('p', { class: 'small' }, hereSentence(date, info)),
      ),
    ),
    cycleStrip(date, info),
    disclosure('Voir les dates', () => [
      h('div', { class: 'grid-3 bal-dates' },
        stat('Prochaines règles', fmtDayMonth(info.nextPeriod)),
        stat(info.ovulationFromLH ? 'Ovulation (test LH)' : 'Ovulation', fmtDayMonth(info.ovulation)),
        stat('Fenêtre fertile', `${fmtDayMonth(info.fertileStart)} – ${fmtDayMonth(info.fertileEnd)}`),
      ),
      legendRow(),
      h('p', { class: 'small muted' }, 'Dates estimées d’après tes cycles notés : chaque cycle peut varier.'),
    ], 'bal-dates'),
    h('div', { class: 'stack', style: 'gap:4px' },
      h('h3', null, adv.headline),
      h('p', { class: 'small muted' }, adv.body),
    ),
    h('div', { class: 'stack bal-advice', style: 'gap:8px' },
      infoRow({ icon: ICON.wave, title: 'Sport', detail: adv.sport }),
      infoRow({ icon: ICON.fork, title: 'Assiette', detail: adv.food }),
      infoRow({ icon: ICON.scale, title: 'Balance', detail: adv.weight }),
    ),
  );

  if (info.phase === 'retard') card.append(lateBlock(date, info));

  const posTest = Object.values(store.state.days).some((d) => d.date >= info.cycleStart && d.date <= date && d.cycle?.pregnancyTest === 'pos');
  if (posTest) card.append(pregnancyOffer(date));

  if (cs.ttc) {
    card.append(disclosure('Essai bébé : les repères', () => h('ul', { class: 'bal-list small' }, TTC_TIPS.map((t) => h('li', null, t))), 'bal-ttc'));
  }

  card.append(
    disclosure('Noter aujourd’hui', () => cycleLog(date, { title: null, explicit: false }), 'bal-log', 'Fermer'),
    actionLink('Début de règles un autre jour', () => openPeriodSheet(date, false)),
  );
  return card;
}

function stat(label: string, value: string): HTMLElement {
  return h('div', { class: 'stat' }, h('span', { class: 'label' }, label), h('span', { class: 'num small', style: 'font-weight:500' }, value));
}

function cycleStrip(date: string, info: CycleInfo): HTMLElement {
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
  // "Aujourd'hui" marker: label above, caret pointing at today's cell.
  const idx = info.day - 1;
  const center = ((idx + 0.5) / n) * 100;
  const align = center < 22 ? 'start' : center > 78 ? 'end' : 'mid';
  return h('div', { class: 'stack', style: 'gap:6px' },
    h('div', { class: 'cc-here', 'aria-hidden': 'true' },
      h('span', { class: `cc-here-label ${align}`, style: `left:${center}%` }, `Aujourd’hui · J${info.day}`),
      h('span', { class: 'cc-here-caret', style: `left:${center}%` }),
    ),
    h('div', { class: 'bal-strip', role: 'img', 'aria-label': `Cycle en cours : tu es au jour ${info.day} sur environ ${info.length}` }, cells),
    h('div', { class: 'cc-strip-ends small muted num', 'aria-hidden': 'true' },
      h('span', null, `J1 · ${fmtDayMonth(info.cycleStart)}`),
      h('span', null, `règles ~${fmtDayMonth(info.nextPeriod)}`),
    ),
  );
}

function legendRow(): HTMLElement {
  return h('div', { class: 'w-legend' },
    legend('ph-regles', 'Règles'), legend('ph-fertile', 'Fertile'), legend('ph-luteale', 'Lutéale'), legend('ph-premenstruel', 'Avant règles'),
    h('span', null, h('i', { class: 'bal-cell bal-key ph-luteale fut' }), 'Plus clair : prévu'),
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
  const offSlot = h('div', { class: 'row' });
  const paintOff = () => offSlot.replaceChildren(...(confirmPregnancyOff
    ? [
        h('button', { class: 'btn sm danger grow', type: 'button', onclick: () => { confirmPregnancyOff = false; void store.saveProfile({ cycle: { ...cs, pregnant: false, pregnantSince: undefined } }); } }, 'Oui, désactiver'),
        h('button', { class: 'btn sm grow', type: 'button', onclick: () => { confirmPregnancyOff = false; paintOff(); } }, 'Annuler'),
      ]
    : [h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { confirmPregnancyOff = true; paintOff(); } }, 'Désactiver le mode grossesse')]));
  paintOff();
  return h('section', { class: 'card ux solo' },
    h('div', { class: 'bal-here' },
      weeks ? keyBubble(String(weeks), 'sem.', rest ? `et ${rest} j` : undefined) : keyBubble(String(n), 'j'),
      h('div', { class: 'bal-here-text' },
        h('span', { class: 'eyebrow' }, 'Grossesse'),
        h('p', { class: 'small' }, `Depuis l’activation du mode, le ${fmtDayMonth(since)} (pas l’âge de la grossesse).`),
      ),
    ),
    infoRow({ icon: ICON.heart, title: 'Pas de déficit', detail: PREGNANCY_NOTE }),
    infoRow({ icon: ICON.leaf, title: 'Acide folique', detail: 'Demande à ton médecin ou ta sage-femme.' }),
    offSlot,
  );
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

  return h('section', { class: 'card ux solo bal-pillars' },
    heartSticker('bal-heart'),
    h('div', { class: 'td-score' },
      h('span', { class: 'big-number' }, String(score)),
      h('span', { class: 'muted num' }, `/ ${HABITS.length} aujourd’hui`),
    ),
    h('p', { class: 'small muted', style: 'text-align:center' }, 'Pas besoin de tout cocher. Touche un pilier pour savoir pourquoi il aide.'),
    h('div', { class: 'bal-habits' },
      HABITS.map((hb) => {
        const on = !!day.habits?.[hb.key];
        const open = whyOpen.has(hb.key);
        return h('div', { class: 'bal-habit' + (on ? ' on' : '') },
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
  );
}

// ---------- 3. breathing ----------

function breathingCard(date: string): HTMLElement {
  const n = store.getDay(date).wellbeing?.breathing ?? 0;
  const dots = Array.from({ length: COHERENCE_TARGET }, (_, i) => h('span', { class: 'week-dot' + (i < n ? ' on' : ''), 'aria-hidden': 'true' }));
  return h('section', { class: 'card ux solo bal-breathe-card' },
    h('button', { class: 'bal-breathe', type: 'button', onclick: () => openBreathing(date) },
      iconCircle(ICON.wave, 'lg'),
      h('span', { class: 'bal-breathe-main' },
        h('span', { class: 'bal-breathe-title' }, 'Cohérence cardiaque'),
        h('span', { class: 'bal-breathe-sub' }, 'Commencer · 5 min'),
      ),
    ),
    h('div', { class: 'row', style: 'justify-content:center;gap:8px' }, dots),
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

  const shown = GFIELDS.filter((f) => wb[f.key] !== undefined).slice(0, 3);
  return h('section', { class: 'card ux solo' },
    infoRow({
      icon: ICON.battery,
      title: 'Mes chiffres Garmin',
      detail: shown.length
        ? shown.map((f) => `${f.label} ${fmtVal(f, wb[f.key] as number)}${f.unit ? ' ' + f.unit : ''}`).join(' · ')
        : 'Sommeil, Body Battery, stress… de la nuit et d’hier',
    }),
    disclosure(shown.length ? 'Modifier mes chiffres' : 'Saisir mes chiffres', () => [
      grid,
      err,
      h('button', { class: 'btn primary block', type: 'button', onclick: save }, 'Enregistrer'),
    ], 'bal-garmin', 'Fermer'),
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
      rows.push(insight(ICON.moon, short ? `${short} nuit${short > 1 ? 's' : ''} sous 6 h sur 7 jours.` : 'Aucune nuit sous 6 h sur 7 jours.',
        short >= 2 ? 'Viser un coucher un peu plus tôt aide souvent plus que tout le reste.' : undefined));
    }
    if (stresses.length) {
      const high = stresses.filter((v) => v >= 50).length;
      rows.push(insight(ICON.spark, high ? `${high} jour${high > 1 ? 's' : ''} de stress haut (50 ou plus) sur 7.` : 'Pas de journée de stress haut sur 7 jours.',
        high >= 2 ? 'Ces jours-là, marche et respiration valent mieux qu’une séance intense.' : undefined));
    }
    if (sw) {
      rows.push(insight(ICON.scale, `Tendance du poids : ${fmtSlope(sw.goodSlope)} les semaines à 7 h de sommeil ou plus, ${fmtSlope(sw.shortSlope)} sinon.`,
        `Estimation sur ${sw.goodWeeks + sw.shortWeeks} semaines : un lien, pas une preuve.`));
    }
  }

  return h('section', { class: 'card ux solo' },
    h('h3', null, 'Ce que disent tes chiffres'),
    rows.length ? h('div', { class: 'stack', style: 'gap:8px' }, rows) : null,
    enough ? null : h('p', { class: 'small muted' }, 'Note ton sommeil et ton stress quelques jours : ici apparaîtront tes nuits courtes, tes jours de stress et leur lien avec ton poids.'),
  );
}

function insight(icon: string, text: string, sub?: string): HTMLElement {
  return infoRow({ icon, title: text, detail: sub, cls: 'bal-insight' });
}

// ---------- 6. cortisol ----------

function cortisolCard(): HTMLElement {
  return h('section', { class: 'card ux solo' },
    infoRow({ icon: ICON.leaf, title: 'Le stress pèse aussi sur la balance', detail: 'Le cortisol pousse à stocker et donne faim. Voici ce qui aide.' }),
    disclosure('Ce qui fait baisser le stress', () => h('ul', { class: 'bal-list small' },
      h('li', null, 'Des nuits de 7 h ou plus, à heures régulières'),
      h('li', null, 'La lumière du jour le matin'),
      h('li', null, 'La cohérence cardiaque'),
      h('li', null, 'Marcher dehors'),
      h('li', null, 'Lever le pied quand tu es épuisée'),
      h('li', null, 'Ne pas sauter de repas'),
      h('li', null, 'Moins de café l’après-midi'),
      h('li', null, 'Peu ou pas d’alcool'),
    ), 'bal-cort-down', 'Masquer'),
    disclosure('Ce qui le fait grimper', () => h('ul', { class: 'bal-list small' },
      h('li', null, 'Les nuits courtes'),
      h('li', null, 'Les gros déficits caloriques'),
      h('li', null, 'Les séances intenses enchaînées'),
      h('li', null, 'Les écrans tard le soir'),
    ), 'bal-cort-up', 'Masquer'),
    h('p', { class: 'small muted' }, 'Pas de complément « anti-cortisol » (ashwagandha…) en essai bébé ou grossesse : demande à ton médecin.'),
  );
}
