// Today, "coach du jour" building blocks:
//   cycleHero    — TON CYCLE first: ring "tu es ici", phase, meaning, next period, recovery pill
//   plateCard    — TON ASSIETTE: kcal bubble + Calories / Protéines bars + water, phase food
//                  focus, 3 ideas added in 2 taps, favour / limit folded
//   regulateCard — POUR TE RÉGULER: ≤ 3 actions picked for the moment (tick = pillar),
//                  breathing shortcut, the 8 pillars as one-tap chips
// Content comes from lib/cycle-guide (guideFor); this file only lays it out.

import type { Meal, MealSlot } from '../types';
import type { ScreenCtx } from './types';
import { store, uid } from '../store';
import {
  h, bar, fmtInt, fmtKg, openSheet, toast, keyBubble, disclosure, actionLink, infoRow, iconCircle, segmented, ICON,
} from '../lib/ui';
import { addDays, daysBetween, fmtDayMonth } from '../lib/dates';
import { targets, totals } from '../lib/nutrition';
import { adviceFor, cycleOn, cycleSettings, phaseLabel } from '../lib/cycle';
import { HABITS, COHERENCE_TARGET } from '../lib/habits';
import { getFood, nutrientsFor } from '../lib/foods';
import type { Food } from '../lib/foods';
import { guideFor } from '../lib/cycle-guide';
import type { CycleGuide, GuideIdea, GuideOptions, GuideTip, Moment } from '../lib/cycle-guide';
import { cycleLog, hereSentence, openPeriodSheet } from './cycle-calendar';
import { openFoodSearch, slotForNow } from './food-search';
import { openBreathing } from './breathing';
import { cycleRing } from './today-ring';
import { openLogSheet } from './training';
import {
  toggleHabit, markDone, popCls, recoveryLevel, recoveryLine, recoveryNumbers, RECOVERY_LABEL, openGarminSheet, lateBlock,
} from './today-shared';

export type { Moment };
export type Guide = CycleGuide;

/** guideFor() guarded: a content bug must never blank the Today screen. */
export function guideSafe(date: string, opts: GuideOptions = {}): Guide | null {
  try { return guideFor(date, store.state, opts); } catch { return null; }
}

// ---------- TON CYCLE (hero) ----------

const PREG_SHORT = 'Pas de déficit : repas réguliers et complets, sport doux. À valider avec ta sage-femme.';

/** Recovery line of the full hero: dot + level + numbers, tap = "Tes chiffres". */
export function recoveryRow(date: string): HTMLElement {
  const days = store.state.days;
  const lvl = recoveryLevel(date, days);
  if (!lvl) {
    return h('button', { class: 'dc-rec', type: 'button', onclick: () => openGarminSheet(date) },
      h('span', { class: 'dc-rec-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'dc-rec-main' }, h('span', { class: 'dc-rec-detail' }, 'Ajoute ton sommeil pour des conseils sur mesure')),
      h('span', { class: 'info-chev', 'aria-hidden': 'true' }, '›'));
  }
  const src = recoveryNumbers(date, days).source === 'garmin' ? ' · Garmin' : '';
  return h('button', { class: `dc-rec lvl-${lvl}`, type: 'button', onclick: () => openGarminSheet(date), 'aria-label': `${RECOVERY_LABEL[lvl]} : ${recoveryLine(date, days)}. Voir tes chiffres` },
    h('span', { class: 'dc-rec-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'dc-rec-main' },
      h('span', { class: 'dc-rec-title' }, RECOVERY_LABEL[lvl]),
      h('span', { class: 'dc-rec-detail num' }, recoveryLine(date, days) + src)),
    h('span', { class: 'info-chev', 'aria-hidden': 'true' }, '›'));
}

/** Small recovery pill (compact hero). Null without numbers. */
function recoveryPill(date: string): HTMLElement | null {
  const lvl = recoveryLevel(date, store.state.days);
  if (!lvl) return null;
  return h('button', { class: `dc-pill lvl-${lvl}`, type: 'button', onclick: () => openGarminSheet(date), 'aria-label': `${RECOVERY_LABEL[lvl]}. Voir tes chiffres` },
    h('span', { class: 'dc-rec-dot', 'aria-hidden': 'true' }), RECOVERY_LABEL[lvl]);
}

/** "Comment tu te sens ?": energy + symptoms of today, in a sheet. */
export function openFeelSheet(date: string) {
  const body = h('div', { class: 'stack' });
  const paint = () => body.replaceChildren(
    h('p', { class: 'small muted' }, 'Ton énergie et ce que tu ressens : le coach en tient compte pour tes conseils.'),
    cycleLog(date, { title: null, explicit: false, after: paint }),
  );
  paint();
  openSheet('Comment tu te sens ?', body);
}

function openTestSheet(date: string) {
  const info = cycleOn(date, store.profile, store.state.days);
  if (!info) return;
  const body = h('div', { class: 'stack' });
  const paint = () => body.replaceChildren(lateBlock(date, info, paint));
  paint();
  openSheet('Faire un test', body);
}

/**
 * TON CYCLE: full in the morning (ring 112 px, meaning, next period, recovery, "Comment tu te sens ?"),
 * compact later (mini ring row + recovery pill). Null when cycle tracking is off.
 */
export function cycleHero(date: string, moment: Moment, ctx: ScreenCtx, guide: Guide | null): HTMLElement | null {
  const p = store.profile;
  const cs = cycleSettings(p);
  if (!cs.tracking) return null;

  if (cs.pregnant) {
    const since = cs.pregnantSince ?? date;
    const n = Math.max(0, daysBetween(since, date));
    const weeks = Math.floor(n / 7);
    return h('section', { class: 'card ux paper dc-hero', 'aria-label': 'Ta grossesse' },
      h('div', { class: 'dc-hero-top' },
        weeks ? keyBubble(String(weeks), 'sem.', n % 7 ? `et ${n % 7} j` : undefined) : keyBubble(String(n), 'j'),
        h('div', { class: 'dc-hero-text' },
          h('span', { class: 'eyebrow' }, 'Mode grossesse'),
          h('h2', null, 'Ta grossesse'),
          h('p', { class: 'small' }, PREG_SHORT),
        ),
      ),
      recoveryRow(date),
      actionLink('Voir mon suivi', () => ctx.go('balance')),
    );
  }

  const info = cycleOn(date, p, store.state.days);
  if (!info) {
    return h('section', { class: 'card ux paper dc-hero solo' },
      infoRow({ icon: ICON.cycle, title: 'Ton cycle', detail: 'Note le 1er jour de tes dernières règles : chaque jour, tu sauras où tu en es.' }),
      h('button', { class: 'btn primary block', type: 'button', onclick: () => openPeriodSheet(date, true) }, 'Noter mes dernières règles'),
    );
  }

  const adv = adviceFor(info, p, date);
  const label = guide?.label ?? phaseLabel(info.phase);
  const meaning = guide?.meaning ?? adv.headline;
  const here = hereSentence(date, info);

  if (moment === 'matin') {
    const n = daysBetween(date, info.nextPeriod);
    const late = info.phase === 'retard';
    const when = late
      ? `règles estimées le ${fmtDayMonth(info.nextPeriod)}`
      : `règles ~${fmtDayMonth(info.nextPeriod)}\u00a0· ${n <= 0 ? 'aujourd’hui' : n === 1 ? 'demain' : `dans\u00a0${n}\u00a0j`}`;
    const testBtn = late && cs.ttc
      ? h('button', { class: 'chip dc-chip-btn', type: 'button', onclick: () => openTestSheet(date) }, 'Faire un test')
      : null;
    return h('section', { class: 'card ux paper dc-hero', 'aria-label': 'Ton cycle' },
      h('div', { class: 'dc-hero-top' },
        cycleRing(info, { size: 112, periodLength: cs.periodLength, label: here, legend: true }),
        h('div', { class: 'dc-hero-text' },
          h('span', { class: 'eyebrow' }, 'Tu es ici'),
          h('h2', null, label),
          h('p', { class: 'italic dc-hero-day' }, when.charAt(0).toUpperCase() + when.slice(1)),
        ),
      ),
      h('p', { class: 'dc-hero-meaning' }, meaning),
      testBtn,
      recoveryRow(date),
      h('div', { class: 'dc-hero-foot' },
        h('button', { class: 'btn sm', type: 'button', onclick: () => openFeelSheet(date) }, 'Comment tu te sens ?'),
        h('button', { class: 'dc-link', type: 'button', onclick: () => ctx.go('balance') }, 'Voir mon cycle ›'),
      ),
    );
  }

  // Compact (journée / soir).
  let tomorrow: string | null = null;
  if (moment === 'soir') {
    const t = cycleOn(addDays(date, 1), p, store.state.days);
    if (t && t.phase !== info.phase) tomorrow = `Demain : J${t.day} · ${phaseLabel(t.phase)}`;
  }
  return h('section', { class: 'card ux paper dc-hero compact', 'aria-label': 'Ton cycle' },
    h('div', { class: 'dc-hero-row' },
      h('button', { class: 'dc-hero-main', type: 'button', onclick: () => ctx.go('balance'), 'aria-label': `${here} Voir mon cycle` },
        cycleRing(info, { size: 56, periodLength: cs.periodLength, label: here }),
        h('span', { class: 'info-main' },
          h('span', { class: 'info-title' }, info.phase === 'retard' ? label : `J${info.day} · ${label}`),
          h('span', { class: 'info-detail' }, meaning),
        ),
      ),
      recoveryPill(date),
    ),
    tomorrow ? h('p', { class: 'small dc-hero-tomorrow' }, tomorrow) : null,
  );
}

// ---------- TON ASSIETTE ----------

/** Extra kcal the cycle phase allows today (0 when unknown, off or pregnant). */
function cycleAdjustOn(date: string): number {
  const p = store.profile;
  const cs = cycleSettings(p);
  if (!cs.tracking || cs.pregnant) return 0;
  const info = cycleOn(date, p, store.state.days);
  return info ? adviceFor(info, p, date).kcalAdjust : 0;
}

/** Budget figures of the day (same maths as the Repas screen). */
export function budgetOn(date: string) {
  const p = store.profile;
  const day = store.getDay(date);
  const weight = store.weightOn(date);
  const adjust = cycleAdjustOn(date);
  const t = targets(date, p, weight, day, adjust);
  const cycleExtra = adjust > 0 ? t.kcal - targets(date, p, weight, day).kcal : 0;
  const eaten = totals(day);
  return { t, eaten, cycleExtra, left: t.budget - eaten.kcal, protLeft: Math.max(0, t.protein - eaten.protein) };
}

function slotFor(moment: Moment): MealSlot {
  return moment === 'soir' ? 'diner' : slotForNow();
}

const SLOT_WORD: Record<MealSlot, string> = { 'petit-dej': 'petit-déj', dejeuner: 'déjeuner', collation: 'collation', diner: 'dîner' };
const SLOT_LABEL: Record<MealSlot, string> = { 'petit-dej': 'Petit-déj', dejeuner: 'Déjeuner', collation: 'Collation', diner: 'Dîner' };

/**
 * Coach idea → "Ajouter" (2 taps): every food of the idea with its suggested grams,
 * each one can be left out; the moment can be changed. Unknown foods: the food search.
 */
export function openIdeaSheet(date: string, idea: GuideIdea, slot: MealSlot) {
  const foods = idea.foodIds
    .map((id, i) => ({ food: getFood(id), g: idea.grams[i] }))
    .filter((x): x is { food: Food; g: number } => !!x.food)
    .map((x) => ({ food: x.food, grams: x.g || x.food.portions[0]?.grams || 100, on: true }));
  if (!foods.length) { openFoodSearch(date, slot); return; }
  let cur: MealSlot = slot;
  const body = h('div', { class: 'stack' });
  const paint = () => {
    const picked = foods.filter((f) => f.on);
    const sum = picked.reduce((acc, f) => {
      const n = nutrientsFor(f.food, f.grams);
      return { kcal: acc.kcal + n.kcal, protein: acc.protein + n.protein };
    }, { kcal: 0, protein: 0 });
    body.replaceChildren(
      idea.why ? h('p', { class: 'small muted' }, idea.why) : '',
      h('div', { class: 'row', style: 'justify-content:center' }, keyBubble(fmtInt(sum.kcal), 'kcal', `${fmtKg(sum.protein)} g de protéines`)),
      h('div', { class: 'stack dc-idea-foods', style: 'gap:8px' },
        foods.map((f) => h('button', {
          class: 'dc-act tap' + (f.on ? ' on' : ''), type: 'button', 'aria-pressed': f.on ? 'true' : 'false',
          onclick: () => { f.on = !f.on; paint(); },
        },
          h('span', { class: 'dc-box' + (f.on ? ' on' : ''), 'aria-hidden': 'true' }, f.on ? '✓' : ''),
          h('span', { class: 'dc-act-main' },
            h('span', { class: 'dc-act-title' }, f.food.name),
            h('span', { class: 'dc-act-detail num' }, `${fmtInt(f.grams)} ${f.food.liquid ? 'ml' : 'g'} · ${fmtInt(nutrientsFor(f.food, f.grams).kcal)} kcal`)),
        ))),
      segmented((['petit-dej', 'dejeuner', 'collation', 'diner'] as MealSlot[]).map((v) => ({ value: v, label: SLOT_LABEL[v] })), cur, (v) => { cur = v; paint(); }),
      h('button', {
        class: 'btn primary block', type: 'button', disabled: !picked.length,
        onclick: () => {
          const meals: Meal[] = picked.map((f) => ({ id: uid(), slot: cur, source: 'aliment', name: f.food.name, grams: Math.round(f.grams), foodId: f.food.id, ...nutrientsFor(f.food, f.grams) }));
          void store.updateDay(date, (d) => { d.meals.push(...meals); });
          sheet.close();
          toast(`Ajouté à ton ${SLOT_WORD[cur]} · ${fmtInt(sum.kcal)} kcal`);
        },
      }, 'Ajouter'),
      h('button', { class: 'btn ghost block', type: 'button', onclick: () => { sheet.close(); openFoodSearch(date, cur); } }, 'Chercher autre chose'),
    );
  };
  paint();
  const sheet = openSheet(idea.name, body);
}

export function plateCard(date: string, moment: Moment, ctx: ScreenCtx, guide: Guide | null): HTMLElement {
  const p = store.profile;
  const pregnant = cycleSettings(p).pregnant;
  const day = store.getDay(date);
  const { t, eaten, cycleExtra, left, protLeft } = budgetOn(date);
  const over = left < 0;
  const water = day.water ?? 0;
  const setWater = (v: number) => {
    markDone('water');
    const next = Math.max(0, Math.round(v * 4) / 4);
    void store.updateDay(date, (d) => { d.water = next; });
  };

  const macro = (label: string, value: number, target: number, unit: string, ceiling = false) => {
    const r = target ? value / target : 0;
    const tone = ceiling ? (r > 1 ? 'warn' : 'accent') : r >= 1 ? 'good' : 'accent';
    return h('div', { class: 'td-mini' },
      h('div', { class: 'td-mini-top' },
        h('span', { style: 'font-weight:700' }, label),
        h('span', { class: 'num muted' }, `${fmtInt(value)} / ${fmtInt(target)} ${unit}${ceiling ? ' max' : ''}`),
      ),
      bar(r, tone),
    );
  };

  const bubble = pregnant
    ? keyBubble(fmtInt(protLeft), 'g', 'protéines restantes', 'pink')
    : keyBubble(fmtInt(Math.abs(left)), 'kcal', over ? 'en plus' : 'restantes', over ? 'warn' : 'pink');

  const card = h('section', { class: 'card ux dc-plate' });
  const add = (...nodes: (Node | null)[]) => card.append(...nodes.filter((x): x is Node => !!x));
  if (moment === 'soir' && !pregnant && !over) {
    add(h('p', { class: 'dc-plate-lead' }, `${fmtInt(left)} kcal pour ton dîner`, protLeft ? h('span', { class: 'muted' }, ` · ${fmtInt(protLeft)} g de protéines` ) : null));
  }
  add(
    h('div', { class: 'td-energy' },
      bubble,
      h('div', { class: 'td-energy-side' },
        macro('Calories', eaten.kcal, t.budget, 'kcal'),
        macro('Protéines', eaten.protein, t.protein, 'g'),
        h('div', { class: 'td-water' },
          h('div', { class: 'td-mini' },
            h('span', { class: 'small', style: 'font-weight:700' }, 'Eau'),
            h('span', { class: 'num small muted' + popCls('water') }, `${fmtKg(water)} / ${fmtKg(t.waterL)} L`),
          ),
          h('div', { class: 'row', style: 'gap:6px' },
            h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Retirer 0,25 L', disabled: water <= 0, onclick: () => setWater(water - 0.25) }, '−'),
            h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Ajouter 0,25 L', onclick: () => setWater(water + 0.25) }, '+'),
          ),
        ),
      ),
    ),
    over ? h('p', { class: 'small muted', style: 'text-align:center' }, 'Pas grave, c’est une journée parmi d’autres. Demain on reprend.') : null,
  );

  if (guide) {
    const n = guide.nutrition;
    const ideas = n.ideas;
    const slot = slotFor(moment);
    add(
      h('div', { class: 'dc-plate-guide' },
        h('span', { class: 'eyebrow' }, `Selon ton cycle · ${guide.label}`),
        h('h3', null, n.title),
        n.why ? h('p', { class: 'small' }, n.why) : null,
      ),
      ideas.length
        ? h('div', { class: 'dc-ideas', role: 'list', 'aria-label': moment === 'soir' ? 'Idées pour ton dîner' : 'Idées du coach' },
            ideas.map((i) => h('button', {
              class: 'dc-idea', type: 'button', role: 'listitem',
              'aria-label': `Ajouter ${i.name}`,
              onclick: () => openIdeaSheet(date, i, slot),
            },
              h('span', { class: 'dc-idea-main' },
                h('span', { class: 'dc-idea-name' }, i.name),
                i.kcal !== undefined || i.protein !== undefined
                  ? h('span', { class: 'dc-idea-sub num' }, [i.kcal !== undefined ? `${fmtInt(i.kcal)} kcal` : null, i.protein !== undefined ? `${fmtInt(i.protein)} g prot.` : null].filter(Boolean).join(' · '))
                  : null),
              h('span', { class: 'dc-idea-add', 'aria-hidden': 'true' }, '+'),
            )))
        : null,
      disclosure('À privilégier, à limiter, budget', () => [
        n.favour.length ? h('div', { class: 'stack', style: 'gap:6px' }, h('h3', null, 'À privilégier'), h('ul', { class: 'bal-list small' }, n.favour.map((x) => h('li', null, x)))) : null,
        n.limit.length ? h('div', { class: 'stack', style: 'gap:6px' }, h('h3', null, 'À limiter'), h('ul', { class: 'bal-list small' }, n.limit.map((x) => h('li', null, x)))) : null,
        n.ttcNote ? h('div', { class: 'stack', style: 'gap:6px' }, h('h3', null, cycleSettings(p).ttc ? 'Essai bébé' : 'Bon à savoir'), h('p', { class: 'small' }, n.ttcNote)) : null,
        n.weight ? h('div', { class: 'stack', style: 'gap:6px' }, h('h3', null, 'Et la balance ?'), h('p', { class: 'small' }, n.weight)) : null,
        budgetDetail(),
      ], `dc-plate-more-${date}`, 'Replier'),
    );
  } else {
    add(disclosure('Détail du budget', budgetDetail, 'td-energy', 'Replier'));
  }
  add(actionLink('Voir mes repas', () => ctx.go('food')));
  return card;

  function budgetDetail() {
    return h('div', { class: 'stack', style: 'gap:6px' },
      h('h3', null, 'Ton budget'),
      h('p', { class: 'small muted num' },
        (t.sportBonus ? `objectif ${fmtInt(t.kcal)} + ${fmtInt(t.sportBonus)} sport` : `objectif ${fmtInt(t.kcal)} kcal`) +
        (cycleExtra > 0 ? ` · dont +${fmtInt(cycleExtra)} kcal (cycle)` : '')),
      h('p', { class: 'small muted num' }, `${fmtInt(eaten.kcal)} kcal mangées sur ${fmtInt(t.budget)}`),
      t.carbsMax !== undefined ? macro('Glucides', eaten.carbs, t.carbsMax, 'g', true) : null,
    );
  }
}

// ---------- POUR TE RÉGULER ----------

const HABIT_KEYS = new Set(HABITS.map((x) => x.key));

/** Without cycle content: three pillars that fit the moment. */
function fallbackTips(moment: Moment, hb: Record<string, boolean>): GuideTip[] {
  const list: Record<Moment, [string, string, string][]> = {
    matin: [['light', '10 min de lumière dehors', 'avant 10 h, même nuageux'], ['breakfast', 'Petit-déj protéiné', 'pour tenir jusqu’à midi'], ['coffee', 'Café avant 14 h', '2 tasses max aujourd’hui']],
    journee: [['walk', 'Marche 15 min', 'après le déjeuner, ça compte'], ['me', '10 min pour toi', 'rien à faire, c’est le but'], ['coffee', 'Pas de café après 14 h', 'le sommeil sera souvent meilleur']],
    soir: [['screens', 'Écrans off 30 min avant', 'un livre, une tisane'], ['sleep', 'Au lit à heure régulière', 'la meilleure récup, c’est la nuit'], ['me', '10 min pour toi', 'rien à faire, c’est le but']],
  };
  return list[moment].map(([key, title, detail]) => ({
    id: `fb-${key}`, text: `${title} · ${detail}`, title, detail, why: HABITS.find((x) => x.key === key)?.why,
    action: `habit:${key}` as const, habitKey: key, done: !!hb[key],
  }));
}

const SHORT: Record<string, string> = {
  sleep: 'Sommeil', light: 'Lumière', coherence: 'Respirer', walk: 'Marche',
  coffee: 'Café < 14 h', screens: 'Écrans off', breakfast: 'Petit-déj', me: 'Moi',
};
const CHIP_ORDER: Record<Moment, string[]> = {
  matin: ['light', 'breakfast', 'coffee', 'coherence', 'walk', 'me', 'screens', 'sleep'],
  journee: ['walk', 'coherence', 'me', 'coffee', 'breakfast', 'light', 'screens', 'sleep'],
  soir: ['screens', 'sleep', 'me', 'coherence', 'walk', 'coffee', 'breakfast', 'light'],
};

const checkMark = () => h('span', { class: 'dc-check-mark', 'aria-hidden': 'true' }, '✓');

function openPillarsWhy(date: string) {
  const body = h('div', { class: 'stack' });
  const paint = () => {
    const hb = store.getDay(date).habits ?? {};
    body.replaceChildren(
      h('p', { class: 'small muted' }, 'Pas besoin de tout cocher : un pilier, c’est déjà une bonne journée.'),
      ...HABITS.map((x) => h('div', { class: 'bal-habit' + (hb[x.key] ? ' on' : '') },
        h('button', { class: 'bal-check' + (hb[x.key] ? ' on' : ''), type: 'button', 'aria-pressed': hb[x.key] ? 'true' : 'false', 'aria-label': x.label, onclick: () => { toggleHabit(date, x.key); paint(); } }, hb[x.key] ? '✓' : ''),
        h('div', { class: 'main' }, h('span', { class: 'bal-label', style: 'cursor:default' }, x.label), h('p', { class: 'sub' }, x.why)),
      )),
    );
  };
  paint();
  openSheet('Tes piliers', body);
}

/** The 8 pillars as one-tap chips, ordered for the moment. */
export function pillarChips(date: string, moment: Moment): HTMLElement {
  const hb = store.getDay(date).habits ?? {};
  const done = HABITS.filter((x) => hb[x.key]).length;
  return h('div', { class: 'dc-pillars' },
    h('div', { class: 'dc-pillars-head' },
      h('span', { class: 'eyebrow' }, 'Tes piliers'),
      h('span', { class: 'num small muted' }, `${done}/${HABITS.length}`),
      h('button', { class: 'dc-link', type: 'button', onclick: () => openPillarsWhy(date) }, 'Pourquoi ?'),
    ),
    h('div', { class: 'dc-chips', role: 'group', 'aria-label': 'Tes piliers du jour' },
      CHIP_ORDER[moment].filter((k) => HABIT_KEYS.has(k)).map((k) => {
        const on = !!hb[k];
        const full = HABITS.find((x) => x.key === k)?.label ?? k;
        return h('button', {
          class: 'dc-chip' + (on ? ' on' : '') + popCls(`hb-${k}`), type: 'button',
          'aria-pressed': on ? 'true' : 'false', 'aria-label': full, title: full,
          onclick: () => toggleHabit(date, k),
        }, on ? checkMark() : null, SHORT[k] ?? k);
      }),
    ),
  );
}

function breathingRow(date: string, title = 'Respirer 5 min'): HTMLElement {
  const n = store.getDay(date).wellbeing?.breathing ?? 0;
  return h('div', { class: 'dc-act' },
    iconCircle(ICON.wave, 'dc-act-ic'),
    h('span', { class: 'dc-act-main' },
      h('span', { class: 'dc-act-title' }, title),
      h('span', { class: 'dc-act-detail' },
        h('span', { class: 'dc-dots', 'aria-label': `${Math.min(n, COHERENCE_TARGET)} sur ${COHERENCE_TARGET} aujourd’hui` },
          Array.from({ length: COHERENCE_TARGET }, (_, i) => h('i', { class: i < n ? 'on' : '' }))),
        ` ${Math.min(n, 99)}/${COHERENCE_TARGET} aujourd’hui`),
    ),
    h('button', { class: 'btn sm primary', type: 'button', onclick: () => openBreathing(date) }, 'Commencer'),
  );
}

export function regulateCard(date: string, moment: Moment, guide: Guide | null): HTMLElement {
  const day = store.getDay(date);
  const hb = day.habits ?? {};
  const tips = guide?.regulate?.length ? guide.regulate : fallbackTips(moment, hb);

  const main = (tip: GuideTip) => h('span', { class: 'dc-act-main' },
    h('span', { class: 'dc-act-title' }, tip.title),
    tip.detail ? h('span', { class: 'dc-act-detail' }, tip.detail) : null,
  );
  const why = (tip: GuideTip) => tip.why
    ? h('button', { class: 'dc-why', type: 'button', 'aria-label': `Pourquoi : ${tip.title}`, onclick: () => openSheet(tip.title, h('p', null, tip.why ?? '')) }, 'i')
    : null;

  const rows: HTMLElement[] = [];
  let breathing = false;
  for (const tip of tips) {
    if (tip.action === 'breathing') {
      breathing = true;
      rows.push(breathingRow(date, tip.title));
      continue;
    }
    const fromAction = tip.action === 'walk' ? 'walk' : tip.action === 'sleep' ? 'sleep' : tip.action?.startsWith('habit:') ? tip.action.slice(6) : undefined;
    const hk = [tip.habitKey, fromAction].find((k): k is string => !!k && HABIT_KEYS.has(k)) ?? null;
    if (hk) {
      const on = !!hb[hk];
      rows.push(h('div', { class: 'dc-act-wrap' },
        h('button', {
          class: 'dc-act tap' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
          onclick: () => toggleHabit(date, hk),
        }, h('span', { class: 'dc-box' + (on ? ' on' : '') + popCls(`hb-${hk}`), 'aria-hidden': 'true' }, on ? '✓' : ''), main(tip)),
        why(tip)));
      continue;
    }
    let btn: HTMLElement | null = null;
    if (tip.action === 'water') {
      const w = day.water ?? 0;
      btn = h('button', {
        class: 'btn sm' + popCls('water-tip'), type: 'button', 'aria-label': 'Ajouter 0,25 L d’eau',
        onclick: () => { markDone('water-tip'); void store.updateDay(date, (d) => { d.water = Math.round(((d.water ?? 0) + 0.25) * 4) / 4; }); },
      }, `+ 0,25 L · ${fmtKg(w)}`);
    } else if (tip.action === 'plate') {
      btn = h('button', { class: 'btn sm', type: 'button', onclick: () => document.querySelector('.dc-plate')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 'Voir');
    } else if (tip.action === 'mobility') {
      btn = h('button', { class: 'btn sm', type: 'button', onclick: () => openLogSheet({ sport: 'mobility', minutes: 10 }) }, 'Noter');
    } else if (tip.action === 'test') {
      btn = h('button', { class: 'btn sm', type: 'button', onclick: () => openTestSheet(date) }, 'Le test');
    }
    if (!btn) {
      // No pillar and no action: still a one-tap tick, kept for the day.
      const on = !!day.tips?.[tip.id];
      rows.push(h('div', { class: 'dc-act-wrap' },
        h('button', {
          class: 'dc-act tap' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
          onclick: () => { markDone(`tip-${tip.id}`); void store.updateDay(date, (d) => { d.tips = { ...(d.tips ?? {}), [tip.id]: !on }; }); },
        }, h('span', { class: 'dc-box' + (on ? ' on' : '') + popCls(`tip-${tip.id}`), 'aria-hidden': 'true' }, on ? '✓' : ''), main(tip)),
        why(tip)));
      continue;
    }
    rows.push(h('div', { class: 'dc-act-wrap' },
      h('div', { class: 'dc-act' }, h('span', { class: 'dc-box tip', 'aria-hidden': 'true' }), main(tip), btn),
      why(tip)));
  }
  if (!breathing) rows.push(breathingRow(date));

  return h('section', { class: 'card ux dc-reg' },
    h('div', { class: 'dc-reg-head' },
      h('h3', null, moment === 'soir' ? 'Pour bien dormir' : 'Pour te réguler'),
      guide ? h('span', { class: 'small muted' }, guide.label) : null),
    h('div', { class: 'dc-reg-list' }, rows),
    pillarChips(date, moment),
  );
}
