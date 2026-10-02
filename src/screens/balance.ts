// "Équilibre": the reference page for the cycle and lifestyle (sleep, stress, cortisol).
// The daily actions (pillars, breathing, recovery, symptoms) live on Aujourd'hui; here:
// TON CYCLE (same ring as the Today hero, then Assiette · Régulation · Sport for the phase)
// · TES PILIERS (full list + why) · TA RÉCUP (Garmin + what the numbers say) · RESPIRER
// · TON SUIVI (calendar) · STRESS ET CORTISOL.

import type { Screen, ScreenCtx } from './types';
import type { Profile } from '../types';
import { store } from '../store';
import {
  h, gearIcon, screenTitle, toast, segmented, openSheet,
  sectionTitle, infoRow, iconCircle, disclosure, keyBubble, checkRow, rowList, ICON,
} from '../lib/ui';
import { today, daysBetween, fmtDayMonth, fmtLong, mondayOf } from '../lib/dates';
import { cycleOn, cycleSettings, adviceFor, phaseLabel, TTC_TIPS, PREGNANCY_NOTE } from '../lib/cycle';
import type { CycleInfo } from '../lib/cycle';
import { hereSentence, openPeriodSheet, trackCard } from './cycle-calendar';
import {
  HABITS, habitScore, weekHabitStats, sleepWeightInsight, recentWellbeing,
  COHERENCE_TARGET,
} from '../lib/habits';
import { openBreathing } from './breathing';
import { cycleRing } from './today-ring';
import { cycleStrip } from './cycle-strip';
import { journeySection } from './journey-balance';
import { guideSafe, openFeelSheet } from './today-guide';
import {
  garminForm, lateBlock, toggleHabit, popCls, recoveryLevel, recoveryLine, RECOVERY_LABEL, GFIELDS, fmtGVal,
} from './today-shared';

// ---------- transient UI state ----------
let confirmPregnancyOff = false;
/** Tab of the cycle card. */
type CycTab = 'plate' | 'reg' | 'sport';
let cycTab: CycTab = 'plate';

const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const renderBalance: Screen = (root, ctx) => {
  const date = today();
  const p = store.profile;
  const cs = cycleSettings(p);
  const info = cs.tracking && !cs.pregnant ? cycleOn(date, p, store.state.days) : null;

  root.append(header(date, ctx, info));
  root.append(...journeySection(date));
  if (cs.tracking) {
    root.append(sectionTitle(cs.pregnant ? 'Ta grossesse' : 'Ton cycle'), cs.pregnant ? pregnancyCard(date) : cycleCard(date, p, info, ctx));
    // Calendar & history sit right under the cycle card (no separate section).
    if (!cs.pregnant) root.append(trackCard(date));
  }
  root.append(
    sectionTitle('Tes piliers'), pillarsCard(date),
    sectionTitle('Ta récup'), recoveryCard(date),
    // Breathing + stress share one card: two hairline rows, no extra section.
    sectionTitle('Respirer, souffler'), h('section', { class: 'card ux solo bal-calm' }, breathingRow(date), cortisolRow()),
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
      h('p', { class: 'subtitle italic' }, eyebrow),
    ),
    h('button', { class: 'btn-icon', 'aria-label': 'Réglages', type: 'button', style: 'background:none', onclick: () => ctx.go('settings') }, gearIcon()),
  );
}

// ---------- 1. cycle ----------

function cycleCard(date: string, p: Profile, info: CycleInfo | null, ctx: ScreenCtx): HTMLElement {
  const cs = cycleSettings(p);

  if (!info) {
    return h('section', { class: 'card ux solo' },
      infoRow({ icon: ICON.cycle, title: 'Ton cycle', detail: 'Note le 1er jour de tes dernières règles : l’app estimera ta phase, ton ovulation et tes prochaines règles.' }),
      h('button', { class: 'btn primary block bal-big', type: 'button', onclick: () => openPeriodSheet(date, true) }, 'Noter mes dernières règles'),
      h('button', { class: 'btn sm', type: 'button', style: 'align-self:flex-start', onclick: () => openFeelSheet(date) }, 'Noter un symptôme'),
    );
  }

  const adv = adviceFor(info, p, date);
  const guide = guideSafe(date, { tips: 4, ideas: 4 });
  const here = hereSentence(date, info);

  const tabBody = (): HTMLElement => {
    if (cycTab === 'plate') {
      const n = guide?.nutrition;
      if (!n) return h('p', { class: 'small' }, adv.food);
      return h('div', { class: 'stack', style: 'gap:10px' },
        h('h3', null, n.title),
        h('p', { class: 'small' }, n.why),
        n.favour.length ? h('div', { class: 'stack', style: 'gap:4px' }, h('span', { class: 'eyebrow' }, 'À privilégier'), h('ul', { class: 'bal-list small' }, n.favour.map((x) => h('li', null, x)))) : null,
        n.limit.length ? h('div', { class: 'stack', style: 'gap:4px' }, h('span', { class: 'eyebrow' }, 'À limiter'), h('ul', { class: 'bal-list small' }, n.limit.map((x) => h('li', null, x)))) : null,
        n.ideas.length
          ? h('button', { class: 'dc-link', type: 'button', style: 'align-self:flex-start', onclick: () => ctx.go('food') }, `${n.ideas.length} idées de repas sur Repas ›`)
          : null,
        n.ttcNote ? h('p', { class: 'small' }, h('strong', null, cs.ttc ? 'Essai bébé : ' : 'Bon à savoir : '), n.ttcNote) : null,
        n.weight ? h('p', { class: 'small muted' }, n.weight) : null,
      );
    }
    if (cycTab === 'reg') {
      const tips = guide?.regulate ?? [];
      if (!tips.length) return h('p', { class: 'small' }, adv.body);
      return h('div', { class: 'stack', style: 'gap:10px' },
        rowList(...tips.map((tp) => infoRow({ icon: tp.action === 'breathing' ? ICON.wave : tp.action === 'sleep' ? ICON.moon : ICON.leaf, title: tp.title, detail: tp.why ?? tp.detail }))),
        h('p', { class: 'small muted' }, 'À cocher au fil de la journée sur Aujourd’hui.'),
      );
    }
    return h('div', { class: 'stack', style: 'gap:10px' },
      h('p', { class: 'small' }, adv.sport),
      h('p', { class: 'small muted' }, adv.weight),
    );
  };
  const tabSlot = h('div', { class: 'bal-tab-body' });
  const tabsSlot = h('div');
  const paintTabs = () => {
    tabsSlot.replaceChildren(segmented<CycTab>([
      { value: 'plate', label: 'Assiette' }, { value: 'reg', label: 'Régulation' }, { value: 'sport', label: 'Sport' },
    ], cycTab, (v) => { cycTab = v; paintTabs(); }));
    tabSlot.replaceChildren(tabBody());
  };
  paintTabs();

  const card = h('section', { class: 'card ux bal-cyc' },
    // Same ring as the Today row, bigger: one marker for "tu es ici".
    h('div', { class: 'bal-cyc-top' },
      cycleRing(info, { size: 120, periodLength: cs.periodLength, label: here, legend: true }),
      h('div', { class: 'bal-here-text' },
        h('span', { class: 'eyebrow' }, 'Tu es ici'),
        h('h2', null, guide?.label ?? phaseLabel(info.phase)),
        h('p', { class: 'italic' }, guide?.dayLabel ?? `J${info.day} sur ~${info.length}`),
      ),
    ),
    h('p', { class: 'bal-cyc-meaning' }, guide?.meaning ?? adv.headline),
    disclosure('Voir les dates', () => [
      h('p', { class: 'small' }, here),
      cycleStrip(date, info),
      h('div', { class: 'grid-3 bal-dates' },
        stat('Prochaines règles', `~${fmtDayMonth(info.nextPeriod)}`),
        stat(info.ovulationFromLH ? 'Ovulation (test LH)' : 'Ovulation', `${info.ovulationFromLH ? '' : '~'}${fmtDayMonth(info.ovulation)}`),
        stat('Fenêtre fertile', `${fmtDayMonth(info.fertileStart)} – ${fmtDayMonth(info.fertileEnd)}`),
      ),
      legendRow(),
      h('p', { class: 'small muted' }, 'Dates estimées d’après tes cycles notés : chaque cycle peut varier.'),
    ], 'bal-dates', 'Replier'),
    disclosure('Assiette, régulation et sport pour ta phase', () => [tabsSlot, tabSlot], 'bal-cyc-tabs', 'Replier'),
  );

  if (info.phase === 'retard') {
    const late = h('div');
    const paintLate = () => late.replaceChildren(lateBlock(date, info, paintLate));
    paintLate();
    card.append(late);
  }

  const posTest = Object.values(store.state.days).some((d) => d.date >= info.cycleStart && d.date <= date && d.cycle?.pregnancyTest === 'pos');
  if (posTest) card.append(pregnancyOffer(date));

  if (cs.ttc) {
    card.append(disclosure('Essai bébé : les repères', () => h('ul', { class: 'bal-list small' }, TTC_TIPS.map((x) => h('li', null, x))), 'bal-ttc', 'Replier'));
  }

  card.append(
    h('div', { class: 'row wrap', style: 'gap:8px' },
      h('button', { class: 'btn sm', type: 'button', onclick: () => openFeelSheet(date) }, 'Noter un symptôme'),
      h('button', { class: 'dc-link', type: 'button', onclick: () => openPeriodSheet(date, false) }, 'Début de règles un autre jour'),
    ),
  );
  return card;
}

function stat(label: string, value: string): HTMLElement {
  return h('div', { class: 'stat' }, h('span', { class: 'label' }, label), h('span', { class: 'num small', style: 'font-weight:500' }, value));
}

function legendRow(): HTMLElement {
  return h('div', { class: 'w-legend' },
    legend('ph-regles', 'Règles'), legend('ph-fertile', 'Fertile'), legend('ph-luteale', 'Lutéale'), legend('ph-premenstruel', 'Avant les règles'),
    h('span', null, h('i', { class: 'bal-cell bal-key ph-luteale fut' }), 'Plus clair : estimé'),
  );
}

function legend(cls: string, label: string): HTMLElement {
  return h('span', null, h('i', { class: `bal-cell bal-key ${cls}` }), label);
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

  return h('section', { class: 'card ux solo bal-pillars' },
    h('div', { class: 'bal-score' },
      h('span', { class: 'num' }, `${score}/${HABITS.length}`),
      h('span', { class: 'italic muted' }, 'aujourd’hui · pas besoin de tout cocher'),
    ),
    rowList(...HABITS.map((hb) => checkRow({
      title: hb.label, on: !!day.habits?.[hb.key], cls: popCls(`hb-${hb.key}`).trim(),
      onToggle: () => toggleHabit(date, hb.key),
      onOpen: () => openSheet(hb.label, h('p', null, hb.why)),
    }))),
    h('div', { class: 'bal-week', 'aria-label': 'Piliers cette semaine' },
      week.days.map((d, i) => h('div', { class: 'bal-week-day' + (d.date === date ? ' today' : '') },
        h('div', { class: 'bal-week-bar' }, h('span', { style: `height:${Math.round((d.done / HABITS.length) * 100)}%` })),
        h('span', { class: 'week-letter' }, WEEK_LETTERS[i]),
      )),
    ),
  );
}

// ---------- 3. breathing ----------

function breathingRow(date: string): HTMLElement {
  const n = store.getDay(date).wellbeing?.breathing ?? 0;
  return (
    h('div', { class: 'bal-breathe-row info-row' },
      iconCircle(ICON.wave),
      h('span', { class: 'info-main' },
        h('span', { class: 'info-title' }, 'Cohérence cardiaque'),
        h('span', { class: 'info-detail' },
          n ? `${Math.min(n, 99)} séance${n > 1 ? 's' : ''} aujourd’hui${n < COHERENCE_TARGET ? ` sur ${COHERENCE_TARGET}` : ''}` : '5 min · idéal matin, midi et fin d’après-midi')),
      h('button', { class: 'btn sm ink', type: 'button', onclick: () => openBreathing(date) }, 'Commencer'))
  );
}

// ---------- 4. recovery: Garmin numbers + what they say ----------

const fmtSlope = (kgWeek: number) => {
  const r = Math.round(kgWeek * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg/sem.`;
};

function recoveryCard(date: string): HTMLElement {
  const days = store.state.days;
  const wb = store.getDay(date).wellbeing ?? {};
  const lvl = recoveryLevel(date, days);
  const shown = GFIELDS.filter((f) => wb[f.key] !== undefined);

  const week = recentWellbeing(days, date, 7);
  const sleeps = week.map((x) => x.wb?.sleepH).filter((v): v is number => typeof v === 'number');
  const stresses = week.map((x) => x.wb?.stress).filter((v): v is number => typeof v === 'number');
  const sw = sleepWeightInsight(days, date);
  const rows: HTMLElement[] = [];
  if (sleeps.length >= 3) {
    const short = sleeps.filter((v) => v < 6).length;
    rows.push(insight(ICON.moon, short ? `${short} nuit${short > 1 ? 's' : ''} sous 6 h sur 7 jours.` : 'Aucune nuit sous 6 h sur 7 jours.',
      short >= 2 ? 'Viser un coucher un peu plus tôt aide souvent plus que tout le reste.' : undefined));
  }
  if (stresses.length >= 3) {
    const high = stresses.filter((v) => v >= 50).length;
    rows.push(insight(ICON.spark, high ? `${high} jour${high > 1 ? 's' : ''} de stress haut (50 ou plus) sur 7.` : 'Pas de journée de stress haut sur 7 jours.',
      high >= 2 ? 'Ces jours-là, marche et respiration valent mieux qu’une séance intense.' : undefined));
  }
  // Only when the gap says something (more than 0,2 kg/week).
  if (sw && Math.abs(sw.goodSlope - sw.shortSlope) > 0.2) {
    rows.push(insight(ICON.scale, `Tendance du poids : ${fmtSlope(sw.goodSlope)} les semaines à 7 h de sommeil ou plus, ${fmtSlope(sw.shortSlope)} sinon.`,
      `Estimation sur ${sw.goodWeeks + sw.shortWeeks} semaines : un lien, pas une preuve.`));
  }

  return h('section', { class: 'card ux solo' },
    infoRow({
      icon: ICON.battery,
      title: lvl ? RECOVERY_LABEL[lvl] : 'Tes chiffres Garmin',
      detail: lvl
        ? [recoveryLine(date, days), ...shown.filter((f) => f.key === 'restingHr' || f.key === 'steps').map((f) => `${f.label} ${fmtGVal(f, wb[f.key] as number)}${f.unit ? ' ' + f.unit : ''}`)].filter(Boolean).join(' · ')
        : 'Sommeil, Body Battery, stress… de la nuit et d’hier',
    }),
    rows.length ? rowList(...rows) : h('p', { class: 'small muted' }, lvl ? 'Encore quelques jours de chiffres et tes nuits courtes, tes jours de stress et leur lien avec ton poids apparaîtront ici.' : 'Pas de chiffres Garmin aujourd’hui.'),
    disclosure(shown.length ? 'Modifier mes chiffres' : 'Saisir à la main', () => garminForm(date, () => toast('Chiffres enregistrés')), 'bal-garmin', 'Replier'),
  );
}

function insight(icon: string, text: string, sub?: string): HTMLElement {
  return infoRow({ icon, title: text, detail: sub, cls: 'bal-insight' });
}

// ---------- 6. cortisol ----------

function cortisolRow(): HTMLElement {
  const open = () => openSheet('Stress et cortisol', h('div', { class: 'stack' },
    h('p', null, 'Le cortisol pousse à stocker et donne faim. Voici ce qui aide.'),
    h('h3', null, 'Ce qui fait baisser le stress'),
    h('ul', { class: 'bal-list small' },
      h('li', null, 'Des nuits de 7 h ou plus, à heures régulières'),
      h('li', null, 'La lumière du jour le matin'),
      h('li', null, 'La cohérence cardiaque'),
      h('li', null, 'Marcher dehors'),
      h('li', null, 'Lever le pied quand tu es épuisée'),
      h('li', null, 'Ne pas sauter de repas'),
      h('li', null, 'Moins de thé l’après-midi (théine), plutôt des tisanes'),
      h('li', null, 'Peu ou pas d’alcool'),
    ),
    h('h3', null, 'Ce qui le fait grimper'),
    h('ul', { class: 'bal-list small' },
      h('li', null, 'Les nuits courtes'),
      h('li', null, 'Les gros déficits caloriques'),
      h('li', null, 'Les séances intenses enchaînées'),
      h('li', null, 'Les écrans tard le soir'),
    ),
    h('p', { class: 'small muted' }, 'Pas de complément « anti-cortisol » (ashwagandha…) en essai bébé ou grossesse : demande à ton médecin.'),
  ));
  return infoRow({ icon: ICON.leaf, title: 'Stress et cortisol', detail: 'Ce qui le fait baisser, ce qui le fait grimper', onClick: open });
}
