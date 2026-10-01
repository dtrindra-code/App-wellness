// "Équilibre": the reference page for the cycle and lifestyle (sleep, stress, cortisol).
// The daily actions (pillars, breathing, recovery, symptoms) live on Aujourd'hui; here:
// TON CYCLE (same ring as the Today hero, then Assiette · Régulation · Sport for the phase)
// · TES PILIERS (full list + why) · TA RÉCUP (Garmin + what the numbers say) · RESPIRER
// · TON SUIVI (calendar) · STRESS ET CORTISOL.

import type { Screen, ScreenCtx } from './types';
import type { Profile } from '../types';
import { store } from '../store';
import {
  h, gearIcon, screenTitle, heartSticker, toast, segmented,
  sectionTitle, infoRow, iconCircle, disclosure, keyBubble, ICON,
} from '../lib/ui';
import { today, daysBetween, fmtDayMonth, fmtLong, mondayOf } from '../lib/dates';
import { cycleOn, cycleSettings, adviceFor, phaseLabel, TTC_TIPS, PREGNANCY_NOTE } from '../lib/cycle';
import type { CycleInfo } from '../lib/cycle';
import { cycleLog, hereSentence, openPeriodSheet, trackCard } from './cycle-calendar';
import {
  HABITS, habitScore, weekHabitStats, sleepWeightInsight, recentWellbeing,
  COHERENCE_TARGET,
} from '../lib/habits';
import { openBreathing } from './breathing';
import { slotForNow } from './food-search';
import { cycleRing } from './today-ring';
import { guideSafe, openIdeaSheet } from './today-guide';
import {
  garminForm, lateBlock, toggleHabit, popCls, recoveryLevel, recoveryLine, RECOVERY_LABEL, GFIELDS, fmtGVal,
} from './today-shared';

// ---------- transient UI state ----------
/** Habit keys whose "why" is unfolded. */
const whyOpen = new Set<string>();
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
  if (cs.tracking) {
    root.append(sectionTitle(cs.pregnant ? 'Ta grossesse' : 'Ton cycle'), cs.pregnant ? pregnancyCard(date) : cycleCard(date, p, info, ctx));
  }
  root.append(
    sectionTitle('Tes piliers'), pillarsCard(date),
    sectionTitle('Ta récup'), recoveryCard(date),
    sectionTitle('Respirer'), breathingCard(date),
  );
  if (cs.tracking && !cs.pregnant) root.append(sectionTitle('Ton suivi'), trackCard(date));
  root.append(sectionTitle('Stress et cortisol'), cortisolCard());
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

function cycleCard(date: string, p: Profile, info: CycleInfo | null, ctx: ScreenCtx): HTMLElement {
  const cs = cycleSettings(p);

  if (!info) {
    return h('section', { class: 'card ux solo' },
      infoRow({ icon: ICON.cycle, title: 'Ton cycle', detail: 'Note le 1er jour de tes dernières règles : l’app estimera ta phase, ton ovulation et tes prochaines règles.' }),
      h('button', { class: 'btn primary block bal-big', type: 'button', onclick: () => openPeriodSheet(date, true) }, 'Noter mes dernières règles'),
      disclosure('Noter aujourd’hui', () => cycleLog(date, { title: null, explicit: false }), 'bal-log', 'Fermer le suivi du jour'),
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
          ? h('div', { class: 'stack', style: 'gap:6px' },
              h('span', { class: 'eyebrow' }, 'Des idées'),
              h('div', { class: 'dc-ideas' }, n.ideas.map((i) => h('button', { class: 'dc-idea', type: 'button', 'aria-label': `Ajouter ${i.name}`, onclick: () => openIdeaSheet(date, i, slotForNow()) },
                h('span', { class: 'dc-idea-main' }, h('span', { class: 'dc-idea-name' }, i.name),
                  i.kcal !== undefined ? h('span', { class: 'dc-idea-sub num' }, `${Math.round(i.kcal)} kcal${i.protein !== undefined ? ` · ${Math.round(i.protein)} g prot.` : ''}`) : null),
                h('span', { class: 'dc-idea-add', 'aria-hidden': 'true' }, '+')))))
          : null,
        n.ttcNote ? h('p', { class: 'small' }, h('strong', null, cs.ttc ? 'Essai bébé : ' : 'Bon à savoir : '), n.ttcNote) : null,
        n.weight ? h('p', { class: 'small muted' }, n.weight) : null,
      );
    }
    if (cycTab === 'reg') {
      const tips = guide?.regulate ?? [];
      if (!tips.length) return h('p', { class: 'small' }, adv.body);
      return h('div', { class: 'stack', style: 'gap:10px' },
        tips.map((tp) => infoRow({ icon: tp.action === 'breathing' ? ICON.wave : tp.action === 'sleep' ? ICON.moon : ICON.leaf, title: tp.title, detail: tp.why ?? tp.detail })),
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

  const card = h('section', { class: 'card ux paper bal-cyc' },
    // Same ring as the Today hero, bigger: one marker for "tu es ici".
    h('div', { class: 'bal-cyc-top' },
      cycleRing(info, { size: 150, periodLength: cs.periodLength, label: here, legend: true }),
      h('div', { class: 'bal-here-text' },
        h('span', { class: 'eyebrow' }, 'Tu es ici'),
        h('h2', null, guide?.label ?? phaseLabel(info.phase)),
        h('p', { class: 'italic' }, guide?.dayLabel ?? `J${info.day} sur ~${info.length}`),
      ),
    ),
    h('p', { class: 'small' }, here),
    h('p', { class: 'bal-cyc-meaning' }, guide?.meaning ?? adv.headline),
    disclosure('Voir les dates', () => [
      h('div', { class: 'grid-3 bal-dates' },
        stat('Prochaines règles', `~${fmtDayMonth(info.nextPeriod)}`),
        stat(info.ovulationFromLH ? 'Ovulation (test LH)' : 'Ovulation', `${info.ovulationFromLH ? '' : '~'}${fmtDayMonth(info.ovulation)}`),
        stat('Fenêtre fertile', `${fmtDayMonth(info.fertileStart)} – ${fmtDayMonth(info.fertileEnd)}`),
      ),
      legendRow(),
      h('p', { class: 'small muted' }, 'Dates estimées d’après tes cycles notés : chaque cycle peut varier.'),
    ], 'bal-dates', 'Replier'),
    tabsSlot,
    tabSlot,
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
    disclosure('Noter aujourd’hui', () => cycleLog(date, { title: null, explicit: false }), 'bal-log', 'Fermer le suivi du jour'),
    h('div', { class: 'row between' },
      h('button', { class: 'dc-link', type: 'button', onclick: () => openPeriodSheet(date, false) }, 'Début de règles un autre jour'),
      h('button', { class: 'dc-link', type: 'button', onclick: () => ctx.go('today') }, 'Mes actions du jour ›'),
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

  const toggle = (key: string) => toggleHabit(date, key);

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
          h('button', { class: 'bal-check' + (on ? ' on' : '') + popCls(`hb-${hb.key}`), type: 'button', 'aria-pressed': on ? 'true' : 'false', 'aria-label': hb.label, onclick: () => toggle(hb.key) }, on ? '✓' : ''),
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
    rows.length ? h('div', { class: 'stack', style: 'gap:8px' }, rows) : h('p', { class: 'small muted' }, 'Note ton sommeil et ton stress quelques jours : ici apparaîtront tes nuits courtes, tes jours de stress et leur lien avec ton poids.'),
    disclosure(shown.length ? 'Modifier mes chiffres' : 'Saisir mes chiffres', () => garminForm(date, () => toast('Chiffres enregistrés')), 'bal-garmin', 'Replier'),
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
      h('li', null, 'Moins de thé l’après-midi (théine), plutôt des tisanes'),
      h('li', null, 'Peu ou pas d’alcool'),
    ), 'bal-cort-down', 'Replier'),
    disclosure('Ce qui le fait grimper', () => h('ul', { class: 'bal-list small' },
      h('li', null, 'Les nuits courtes'),
      h('li', null, 'Les gros déficits caloriques'),
      h('li', null, 'Les séances intenses enchaînées'),
      h('li', null, 'Les écrans tard le soir'),
    ), 'bal-cort-up', 'Replier'),
    h('p', { class: 'small muted' }, 'Pas de complément « anti-cortisol » (ashwagandha…) en essai bébé ou grossesse : demande à ton médecin.'),
  );
}
