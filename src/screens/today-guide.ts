// Today, "coach du jour" building blocks (direction B "Évoluer"):
//   cycleHero     — TON CYCLE as one compact row: 52 px ring, phase, next period, recovery chip
//   plateRow      — the plate as one hairline row: kcal left (22), thin bar, "Ajouter"
//   cycleFoodCard — phase food focus + ideas + favour / limit (lives on Repas now)
//   regulateRows  — the moment's tips as check rows (tick = pillar) + breathingRow
// Content comes from lib/cycle-guide (guideFor); this file only lays it out.

import type { Meal, MealSlot } from '../types';
import type { ScreenCtx } from './types';
import { store, uid } from '../store';
import {
  h, bar, fmtInt, fmtKg, openSheet, toast, keyBubble, disclosure, iconCircle, segmented, checkRow, ICON,
} from '../lib/ui';
import { addDays, daysBetween } from '../lib/dates';
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

/** Recovery chip of the cycle row (its own 44 px button). Null without numbers. */
function recoveryPill(date: string): HTMLElement | null {
  const lvl = recoveryLevel(date, store.state.days);
  if (!lvl) return null;
  return h('button', { class: `dc-pill lvl-${lvl}`, type: 'button', onclick: () => openGarminSheet(date), 'aria-label': `${RECOVERY_LABEL[lvl]}. Voir tes chiffres` },
    RECOVERY_LABEL[lvl]);
}

/** "Comment tu te sens ?": energy + symptoms of today, in a sheet (opened from Équilibre). */
export function openFeelSheet(date: string) {
  const body = h('div', { class: 'stack' });
  const paint = () => body.replaceChildren(
    h('p', { class: 'small muted' }, 'Ton énergie, un symptôme, ce que tu ressens : le coach en tient compte pour tes conseils.'),
    cycleLog(date, { title: null, explicit: false, after: paint }),
  );
  paint();
  openSheet('Noter un symptôme', body);
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
 * TON CYCLE: one compact row at every moment (52 px ring, phase 18, one detail line 14,
 * the recovery chip as its own button). The whole row opens Équilibre. Null when tracking is off.
 */
export function cycleHero(date: string, moment: Moment, ctx: ScreenCtx, guide: Guide | null): HTMLElement | null {
  const p = store.profile;
  const cs = cycleSettings(p);
  if (!cs.tracking) return null;

  if (cs.pregnant) {
    const since = cs.pregnantSince ?? date;
    const n = Math.max(0, daysBetween(since, date));
    const weeks = Math.floor(n / 7);
    return h('section', { class: 'card ux dc-hero cyc-row', 'aria-label': 'Ta grossesse' },
      h('div', { class: 'dc-hero-row' },
        h('button', { class: 'dc-hero-main', type: 'button', onclick: () => ctx.go('balance') },
          h('span', { class: 'icon-circle', 'aria-hidden': 'true' }, h('span', { class: 'icon-glyph num' }, weeks ? `${weeks}s` : `${n}j`)),
          h('span', { class: 'info-main' },
            h('span', { class: 'info-title' }, weeks ? `${weeks} sem.${n % 7 ? ` et ${n % 7} j` : ''}` : `${n} j`),
            h('span', { class: 'info-detail' }, PREG_SHORT)),
        ),
        recoveryPill(date),
      ),
    );
  }

  const info = cycleOn(date, p, store.state.days);
  if (!info) {
    return h('section', { class: 'card ux dc-hero cyc-row' },
      h('div', { class: 'dc-hero-row' },
        h('button', { class: 'dc-hero-main', type: 'button', onclick: () => openPeriodSheet(date, true) },
          iconCircle(ICON.cycle),
          h('span', { class: 'info-main' },
            h('span', { class: 'info-title' }, 'Ton cycle'),
            h('span', { class: 'info-detail' }, 'Note le 1er jour de tes dernières règles')),
        ),
      ),
    );
  }

  const label = guide?.label ?? phaseLabel(info.phase);
  const here = hereSentence(date, info);
  const late = info.phase === 'retard';
  const n = daysBetween(date, info.nextPeriod);
  let detail = late
    ? (info.lateBy >= 1 ? `Règles en retard de ${info.lateBy} j` : 'Règles attendues aujourd’hui')
    : info.phase === 'regles'
      ? `Jour ${info.day} des règles`
      : n <= 0 ? 'Règles attendues aujourd’hui' : n === 1 ? 'Règles demain' : `Règles dans ~${n} j`;
  if (moment === 'soir') {
    const t = cycleOn(addDays(date, 1), p, store.state.days);
    if (t && t.phase !== info.phase) detail = `Demain : J${t.day} · ${phaseLabel(t.phase).replace(/^Phase /, '')}`;
  }
  const testBtn = late && cs.ttc
    ? h('button', { class: 'chip dc-pill', type: 'button', onclick: () => openTestSheet(date) }, 'Faire un test')
    : null;
  return h('section', { class: 'card ux dc-hero cyc-row', 'aria-label': 'Ton cycle' },
    h('div', { class: 'dc-hero-row' },
      h('button', { class: 'dc-hero-main', type: 'button', onclick: () => ctx.go('balance'), 'aria-label': `${here} Voir mon cycle` },
        cycleRing(info, { size: 52, periodLength: p.cycle?.periodLength ?? 5, label: here }),
        h('span', { class: 'info-main' },
          h('span', { class: 'info-title' }, label),
          h('span', { class: 'info-detail' }, detail),
        ),
      ),
      testBtn ?? recoveryPill(date),
    ),
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

/**
 * The plate as one row: "1 500" (22) kcal left, a thin bar and "Ajouter" (food search on the
 * slot of the moment, recent foods first). Evening: "660 kcal pour ton dîner".
 */
export function plateRow(date: string, moment: Moment, ctx: ScreenCtx): HTMLElement {
  const pregnant = cycleSettings(store.profile).pregnant;
  const { t, eaten, left, protLeft } = budgetOn(date);
  const over = left < 0;
  const slot = slotFor(moment);
  let fig: string, lbl: string;
  if (pregnant) { fig = fmtInt(protLeft); lbl = 'g de protéines restantes'; }
  else if (over) { fig = fmtInt(-left); lbl = 'kcal en plus, ce n’est pas grave'; }
  else if (moment === 'soir') { fig = fmtInt(left); lbl = 'kcal pour ton dîner'; }
  else { fig = fmtInt(left); lbl = 'kcal restantes'; }
  const ratio = pregnant ? (t.protein ? eaten.protein / t.protein : 0) : t.budget ? eaten.kcal / t.budget : 0;
  return h('div', { class: 'dc-plate-row dc-plate' },
    h('div', { class: 'dc-plate-top' },
      iconCircle(ICON.fork),
      h('button', {
        class: 'dc-plate-fig', type: 'button', style: 'background:none;border:0;padding:0;font:inherit;color:inherit;text-align:left;cursor:pointer',
        onclick: () => ctx.go('food'), 'aria-label': `${fig} ${lbl}. Voir mes repas`,
      },
        h('span', { class: 'num' }, fig),
        h('span', { class: 'kcal-l' }, lbl)),
      h('button', { class: 'btn sm', type: 'button', onclick: () => openFoodSearch(date, slot) }, 'Ajouter'),
    ),
    bar(ratio, over ? 'warn' : 'accent'),
    !pregnant && protLeft > 0 && moment !== 'matin'
      ? h('p', { class: 'dc-plate-sub' }, `encore ${fmtInt(protLeft)} g de protéines`)
      : null,
  );
}

/** "Selon ton cycle": the phase food focus, ideas in 2 taps, favour / limit folded (Repas). */
export function cycleFoodCard(date: string, guide: Guide | null): HTMLElement | null {
  if (!guide) return null;
  const p = store.profile;
  const n = guide.nutrition;
  const slot = slotForNow();
  return h('section', { class: 'card ux solo dc-plate-guide-card' },
    h('div', { class: 'stack', style: 'gap:4px' },
      h('span', { class: 'eyebrow' }, guide.label),
      h('h3', null, n.title),
      n.why ? h('p', { class: 'small muted' }, n.why) : null,
    ),
    n.ideas.length
      ? h('div', { class: 'row-list', role: 'list', 'aria-label': 'Idées du coach' },
          n.ideas.map((i) => h('button', {
            class: 'dc-idea', type: 'button', role: 'listitem', 'aria-label': `Ajouter ${i.name}`,
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
    disclosure('À privilégier, à limiter', () => [
      n.favour.length ? h('div', { class: 'stack', style: 'gap:6px' }, h('h3', null, 'À privilégier'), h('ul', { class: 'bal-list small' }, n.favour.map((x) => h('li', null, x)))) : null,
      n.limit.length ? h('div', { class: 'stack', style: 'gap:6px' }, h('h3', null, 'À limiter'), h('ul', { class: 'bal-list small' }, n.limit.map((x) => h('li', null, x)))) : null,
      n.ttcNote ? h('div', { class: 'stack', style: 'gap:6px' }, h('h3', null, cycleSettings(p).ttc ? 'Essai bébé' : 'Bon à savoir'), h('p', { class: 'small' }, n.ttcNote)) : null,
      n.weight ? h('div', { class: 'stack', style: 'gap:6px' }, h('h3', null, 'Et la balance ?'), h('p', { class: 'small' }, n.weight)) : null,
    ], `food-cycle-more-${date}`, 'Replier'),
  );
}

// ---------- POUR TE RÉGULER ----------

const HABIT_KEYS = new Set(HABITS.map((x) => x.key));

/** Without cycle content: three pillars that fit the moment. */
function fallbackTips(moment: Moment, hb: Record<string, boolean>): GuideTip[] {
  const list: Record<Moment, [string, string, string][]> = {
    matin: [['light', '10 min de lumière dehors', 'avant 10 h, même nuageux'], ['breakfast', 'Petit-déj protéiné', 'pour tenir jusqu’à midi'], ['coffee', 'Thé avant 14 h', 'après, tisanes à volonté']],
    journee: [['walk', 'Marche 15 min', 'après le déjeuner, ça compte'], ['me', '10 min pour toi', 'rien à faire, c’est le but'], ['coffee', 'Pas de thé après 14 h', 'une tisane à la place']],
    soir: [['screens', 'Écrans off 30 min avant', 'un livre, une tisane'], ['sleep', 'Au lit à heure régulière', 'la meilleure récup, c’est la nuit'], ['me', '10 min pour toi', 'rien à faire, c’est le but']],
  };
  return list[moment].map(([key, title, detail]) => ({
    id: `fb-${key}`, text: `${title} · ${detail}`, title, detail, why: HABITS.find((x) => x.key === key)?.why,
    action: `habit:${key}` as const, habitKey: key, done: !!hb[key],
  }));
}

/** "Respirer 5 min" as one row: dots of the day + "Commencer". */
export function breathingRow(date: string, title = 'Respirer 5 min'): HTMLElement {
  const n = store.getDay(date).wellbeing?.breathing ?? 0;
  return h('div', { class: 'dc-breath-row' },
    iconCircle(ICON.wave),
    h('span', { class: 'info-main' },
      h('span', { class: 'info-title' }, title),
      h('span', { class: 'info-detail' },
        h('span', { class: 'dc-dots', 'aria-label': `${Math.min(n, COHERENCE_TARGET)} sur ${COHERENCE_TARGET} aujourd’hui` },
          Array.from({ length: COHERENCE_TARGET }, (_, i) => h('i', { class: i < n ? 'on' : '' }))),
        ` ${Math.min(n, 99)}/${COHERENCE_TARGET} aujourd’hui`),
    ),
    h('button', { class: 'btn sm', type: 'button', onclick: () => openBreathing(date) }, 'Commencer'),
  );
}

/**
 * The moment's tips as check rows (one tap = the pillar ticked), at most `max`.
 * A tip with a "why" opens it on a tap on its text. Breathing tips are skipped:
 * the caller adds one breathingRow().
 */
export function regulateRows(date: string, moment: Moment, guide: Guide | null, max = 3): HTMLElement[] {
  const day = store.getDay(date);
  const hb = day.habits ?? {};
  const tips = (guide?.regulate?.length ? guide.regulate : fallbackTips(moment, hb)).filter((t) => t.action !== 'breathing');
  const why = (tip: GuideTip) => tip.why ? () => openSheet(tip.title, h('p', null, tip.why ?? '')) : undefined;

  const rows: HTMLElement[] = [];
  for (const tip of tips) {
    if (rows.length >= max) break;
    const fromAction = tip.action === 'walk' ? 'walk' : tip.action === 'sleep' ? 'sleep' : tip.action?.startsWith('habit:') ? tip.action.slice(6) : undefined;
    const hk = [tip.habitKey, fromAction].find((k): k is string => !!k && HABIT_KEYS.has(k)) ?? null;
    if (hk) {
      rows.push(checkRow({
        title: tip.title, detail: tip.detail, on: !!hb[hk], cls: popCls(`hb-${hk}`).trim(),
        onToggle: () => toggleHabit(date, hk), onOpen: why(tip),
      }));
      continue;
    }
    let btn: HTMLElement | null = null;
    if (tip.action === 'water') {
      const w = day.water ?? 0;
      btn = h('button', {
        class: 'btn sm' + popCls('water-tip'), type: 'button', 'aria-label': 'Ajouter 0,25 L d’eau',
        onclick: () => { markDone('water-tip'); void store.updateDay(date, (d) => { d.water = Math.round(((d.water ?? 0) + 0.25) * 4) / 4; }); },
      }, `+ 0,25 L · ${fmtKg(w)}`);
    } else if (tip.action === 'mobility') {
      btn = h('button', { class: 'btn sm', type: 'button', onclick: () => openLogSheet({ sport: 'mobility', minutes: 10 }) }, 'Noter');
    } else if (tip.action === 'test') {
      btn = h('button', { class: 'btn sm', type: 'button', onclick: () => openTestSheet(date) }, 'Le test');
    }
    if (btn) {
      rows.push(h('div', { class: 'check-row' },
        h('span', { class: 'check', 'aria-hidden': 'true', style: 'cursor:default' }, iconCircle(tip.action === 'water' ? ICON.drop : ICON.leaf)),
        h('span', { class: 'check-main', style: 'cursor:default' },
          h('span', { class: 'check-title' }, tip.title),
          tip.detail ? h('span', { class: 'check-detail' }, tip.detail) : null),
        btn));
      continue;
    }
    // No pillar and no action: still a one-tap tick, kept for the day.
    const on = !!day.tips?.[tip.id];
    rows.push(checkRow({
      title: tip.title, detail: tip.detail, on, onOpen: why(tip),
      onToggle: () => { markDone(`tip-${tip.id}`); void store.updateDay(date, (d) => { d.tips = { ...(d.tips ?? {}), [tip.id]: !on }; }); },
    }));
  }
  return rows;
}
