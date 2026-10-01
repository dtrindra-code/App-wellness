// "Coach du jour" content for the cycle: what the phase means, what to put on
// the plate (with real food ideas from lib/foods.ts) and 2–4 small actions to
// regulate stress, sleep and energy, picked from the phase, the moment of the
// day and the Garmin / symptom data. Pure functions + static content only.
//
// Wording rules (checked by scripts/check-cycle-guide.mjs):
// - gentle and modest ("souvent", "peut aider"), never "il faut", "tu devrais",
//   "rattraper", "compenser";
// - no supplement except "acide folique : demande à ton médecin ou ta sage-femme";
//   never ashwagandha;
// - weight-loss compatible, but no weight talk in pregnancy, late period or
//   during the TTC wait (second half of the cycle).

import type { AppState, DayLog, Profile } from '../types';
import type { CoachSlot } from './coach';
import { adviceFor, cycleOn, cycleSettings, phaseLabel, type CycleInfo, type CyclePhase } from './cycle';
import { addDays, daysBetween, weekday } from './dates';
import { getFood, nutrientsFor } from './foods';
import { phaseOn, targets, totals } from './nutrition';

// ---------- types ----------

export type Moment = 'matin' | 'journee' | 'soir';
export type GuidePhase = CyclePhase | 'grossesse';

/** Coach slot → moment of the day (midi + aprem = journée, bilan = soir). */
export const momentOf = (slot: CoachSlot): Moment =>
  slot === 'matin' ? 'matin' : slot === 'soir' || slot === 'bilan' ? 'soir' : 'journee';

/** Moment for a local hour (same cut-offs as coach slotAt: 11:30, 18:00). */
export const momentAt = (hour: number): Moment => (hour < 11.5 ? 'matin' : hour < 18 ? 'journee' : 'soir');

type IdeaSlot = 'petit-dej' | 'dejeuner' | 'collation' | 'diner';

/** A food idea made of bundled foods (ids from lib/foods.ts). */
export interface FoodIdeaDef {
  id: string;
  label: string;
  foodIds: string[];
  /** Grams per food (same order); default = the food's first portion. */
  grams?: number[];
  slot?: IdeaSlot;
  /** ≤ 60 chars. */
  why?: string;
  /** Fits the lavage (≤ ~100 g carbs/day). */
  lavageOk: boolean;
  /** No raw / unpasteurised / smoked fish / liver. */
  pregnancySafe: boolean;
}

export interface PlateDef {
  title: string;
  /** One line; `{cycleExtra}` is replaced by the real extra kcal of the day. */
  focus: string;
  /** Used instead of `focus` when the real extra is 0 (floor, TTC cap…). */
  focusNoExtra?: string;
  favour: string[];
  limit: string[];
  ideas: FoodIdeaDef[];
  weight?: string;
  ttc?: string;
  /** Note shown when not TTC (late period only). */
  notTtc?: string;
}

export interface Conditions {
  /** Last night < 6.5 h. */
  shortSleep: boolean;
  /** Body Battery at wake-up < 30. */
  lowBattery: boolean;
  /** Average stress ≥ 50. */
  highStress: boolean;
  /** Morning mood ≤ 2 or "humeur basse" noted. */
  lowMood: boolean;
  /** Symptoms noted today (SYMPTOMS wording from cycle-calendar). */
  symptoms: string[];
  ttc: boolean;
  pregnant: boolean;
  basketDay: boolean;
  lavage: boolean;
}

type CondKey = 'shortSleep' | 'lowBattery' | 'highStress' | 'lowMood' | 'ttc' | 'pregnant' | 'basketDay' | 'notPregnant' | 'notLowRecovery';

export type RegulateAction = 'breathing' | `habit:${string}` | 'walk' | 'sleep' | 'water' | 'plate' | 'mobility' | 'test';

export interface RegulationTipDef {
  id: string;
  /** ≤ 40 chars, soft imperative. */
  title: string;
  /** ≤ 70 chars. */
  detail: string;
  why: string;
  moments: Moment[];
  phases: GuidePhase[] | 'all';
  /** All must hold for the tip to qualify. */
  only?: CondKey[];
  /** Each one that holds adds 10 to the score. */
  boost?: CondKey[];
  /** Symptoms that add 10 to the score. */
  boostSymptoms?: string[];
  /** Phases that add 5 to the score (for tips open to every phase). */
  boostPhases?: GuidePhase[];
  /** Ticking the tip ticks this pillar (lib/habits.ts key). */
  habitKey?: string;
  action?: RegulateAction;
  /** 0–10. */
  priority: number;
}

export interface GuideIdea {
  id: string;
  /** Display name, e.g. « Patate douce, poulet, brocoli ». */
  name: string;
  /** First food of the idea (the main one). */
  foodId?: string;
  foodIds: string[];
  /** Grams per food, same order as foodIds. */
  grams: number[];
  kcal?: number;
  protein?: number;
  slot?: IdeaSlot;
  why?: string;
}

export interface GuideTip {
  id: string;
  /** « Titre · détail », ≤ 90 chars. */
  text: string;
  title: string;
  detail: string;
  why?: string;
  action?: RegulateAction;
  habitKey?: string;
  /** Its pillar is already ticked today. */
  done: boolean;
}

export interface CycleGuide {
  phase: GuidePhase;
  /** « Phase lutéale », « Grossesse »… */
  label: string;
  /** « J23 sur ~28 », « J30 · retard 2 j », « 12 sem. et 3 j ». */
  dayLabel: string;
  /** One sentence: what this phase means today. */
  meaning: string;
  moment: Moment | null;
  info: CycleInfo | null;
  /** Days until the estimated next period (cycle phases only, ≥ 0). */
  daysToPeriod: number | null;
  conditions: Conditions;
  nutrition: {
    title: string;
    /** One line: the focus of the day, with the real extra kcal. */
    why: string;
    favour: string[];
    limit: string[];
    ideas: GuideIdea[];
    /** Weight-loss note (absent in pregnancy, late period and TTC wait). */
    weight?: string;
    ttcNote?: string;
    /** Real extra kcal granted by the phase today (after floor / caps). */
    cycleExtra: number;
  };
  regulate: GuideTip[];
}

export interface GuideOptions {
  /** Moment of the day; without it tips are picked across the whole day. */
  moment?: Moment;
  /** Number of food ideas (default 3). */
  ideas?: number;
  /** Number of regulation actions (default 3, max 4). */
  tips?: number;
  /** kcal left today; computed from the day's meals in the evening when absent. */
  kcalLeft?: number;
}

// ---------- content: plates ----------

const idea = (id: string, label: string, foodIds: string[], o: Partial<FoodIdeaDef> = {}): FoodIdeaDef =>
  ({ id, label, foodIds, lavageOk: false, pregnancySafe: true, ...o });

export const PLATES: Record<GuidePhase, PlateDef> = {
  regles: {
    title: 'Recharge en fer',
    focus: 'Tu perds du fer : on le remplace, avec des repas chauds qui calent.',
    favour: [
      'Fer (lentilles, viande rouge maigre, sardines, épinards) avec de la vitamine C au même repas (kiwi, orange, poivron)',
      'Magnésium (chocolat noir 70 %, amandes, banane)',
      'Oméga-3 (sardines, saumon)',
      'Boissons chaudes : tisane, bouillon',
    ],
    limit: [
      'Thé pendant les repas riches en fer : il freine son absorption, prends-le 1 h après (les tisanes sont ok)',
      'Alcool',
      'Plats très salés, souvent synonymes de ballonnements',
    ],
    ideas: [
      idea('dahl-kiwi', 'Dahl de lentilles + 1 kiwi', ['dahl-de-lentilles', 'kiwi'], { grams: [250, 75], slot: 'dejeuner', why: 'Fer + vitamine C dans le même repas', lavageOk: true }),
      idea('steak-epinards', 'Steak haché 5 %, épinards, poivron', ['steak-hache-5-pct-cuit', 'epinards-cuits', 'poivron'], { grams: [100, 150, 75], slot: 'diner', why: 'Le fer le mieux absorbé, avec sa vitamine C', lavageOk: true }),
      idea('sardines-pain', 'Sardines sur pain complet + salade', ['sardines-a-l-huile', 'pain-complet', 'salade-verte'], { grams: [90, 50, 50], slot: 'dejeuner', why: 'Fer et oméga-3, prêt en 3 minutes' }),
      idea('choco-amandes', '2 carrés de chocolat noir + 10 amandes', ['chocolat-noir-70-pct', 'amandes'], { grams: [10, 12], slot: 'collation', why: 'Magnésium : peut aider contre les crampes', lavageOk: true }),
    ],
    ttc: 'Les folates comptent dès maintenant : lentilles et épinards en sont riches. Acide folique : demande à ton médecin ou ta sage-femme.',
    weight: 'Pas de bonus calorique ces jours-ci : les plats chauds riches en protéines calent sans dépasser.',
  },
  folliculaire: {
    title: 'Énergie en hausse',
    focus: 'La période où le déficit se tient le mieux : protéines à chaque repas, féculents autour des séances.',
    favour: [
      'Protéines maigres (poulet, œufs, skyr, poisson)',
      'Féculents complets avant ou après la séance (flocons d’avoine, quinoa, riz complet)',
      'Légumes à volonté',
      'Ferments (kéfir, yaourt)',
    ],
    limit: ['Sucres rapides seuls (jus, sodas)', 'Sauter le repas après la séance', 'Alcool'],
    ideas: [
      idea('skyr-avoine', 'Skyr, flocons d’avoine, myrtilles', ['skyr-nature', 'flocons-d-avoine', 'myrtilles'], { grams: [150, 40, 80], slot: 'petit-dej', why: 'Parfait avant une séance' }),
      idea('poulet-quinoa', 'Poulet, quinoa, brocoli', ['blanc-de-poulet-cuit', 'quinoa-cuit', 'brocoli-cuit'], { grams: [130, 80, 150], slot: 'dejeuner', why: 'Le repas qui recharge après le sport', lavageOk: true }),
      idea('omelette-epinards', 'Omelette 2 œufs aux épinards', ['oeuf', 'epinards-cuits'], { grams: [110, 150], slot: 'diner', why: 'Protéines en 5 minutes', lavageOk: true }),
      idea('skyr-fruits-rouges', 'Skyr nature + fruits rouges', ['skyr-nature', 'fruits-rouges-melanges'], { grams: [150, 80], slot: 'collation', why: 'Protéines faciles, peu de sucre', lavageOk: true }),
      idea('saumon-patate', 'Saumon, patate douce, haricots verts', ['saumon-cuit', 'patate-douce-cuite', 'haricots-verts-cuits'], { grams: [125, 150, 150], slot: 'diner', why: 'Oméga-3 et féculent complet' }),
    ],
    ttc: 'Prépare le terrain : folates (lentilles, pois chiches, brocoli, avocat) et oméga-3 (sardines, saumon, noix). Thé : 4 tasses max par jour (la théine compte comme la caféine), tisanes à volonté.',
    weight: 'C’est souvent ta meilleure fenêtre : garde le budget du jour, sans couper plus.',
  },
  fertile: {
    title: 'Léger et coloré',
    focus: 'Énergie souvent au top : repas simples et réguliers, garde ton petit-déj.',
    favour: [
      'Folates (épinards, asperges, avocat, pois chiches, orange)',
      'Oméga-3 (saumon, sardines, noix)',
      'Fruits et légumes colorés (fruits rouges, poivron, kiwi)',
      'De l’eau, régulièrement',
    ],
    limit: ['Alcool', 'Plus de 4 tasses de thé (théine)', 'Une journée trop basse en calories'],
    ideas: [
      idea('salade-pois-chiches', 'Salade pois chiches, avocat, tomate', ['pois-chiches-cuits', 'avocat', 'tomate'], { grams: [150, 75, 120], slot: 'dejeuner', why: 'Folates et fibres', lavageOk: true }),
      idea('saumon-asperges', 'Saumon, asperges, riz complet', ['saumon-cuit', 'asperges', 'riz-complet-cuit'], { grams: [125, 100, 120], slot: 'diner', why: 'Oméga-3 et folates' }),
      idea('grec-fruits-rouges', 'Yaourt grec, fruits rouges, noix', ['yaourt-a-la-grecque', 'fruits-rouges-melanges', 'noix'], { grams: [150, 80, 15], slot: 'collation', why: 'Oméga-3 et antioxydants', lavageOk: true }),
      idea('omelette-poivron', 'Omelette 2 œufs, poivron, salade', ['oeuf', 'poivron', 'salade-verte'], { grams: [110, 75, 50], slot: 'diner', why: 'Simple, coloré, protéiné', lavageOk: true }),
    ],
    ttc: 'Le corps a besoin d’être bien nourri ces jours-ci : pas de journée sous ton budget. Folates en priorité. Alcool : idéalement zéro dès maintenant.',
    weight: 'Budget normal. Une légère variation d’eau sur la balance est possible.',
  },
  luteale: {
    title: 'Plus faim : on anticipe',
    focus: 'Le corps dépense un peu plus (+{cycleExtra} kcal prévus) : une collation prévue évite le craquage de 17 h.',
    focusNoExtra: 'La faim monte souvent ces jours-ci : une collation prévue évite le craquage de 17 h.',
    favour: [
      'Protéines + fibres à chaque repas (légumineuses, légumes, œufs)',
      'Glucides complets en portion (patate douce, flocons d’avoine)',
      'Magnésium (amandes, chocolat noir, banane)',
      '+0,5 L d’eau',
    ],
    limit: ['Sel, qui favorise la rétention', 'Thé après 14 h : le sommeil est souvent plus léger en fin de cycle, passe aux tisanes', 'Alcool'],
    ideas: [
      idea('skyr-chia', 'Collation 16 h : skyr + 1 c. à soupe de chia', ['skyr-nature', 'graines-de-chia'], { grams: [150, 12], slot: 'collation', why: 'Protéines + fibres : tient jusqu’au dîner', lavageOk: true }),
      idea('patate-poulet', 'Patate douce, poulet, brocoli', ['patate-douce-cuite', 'blanc-de-poulet-cuit', 'brocoli-cuit'], { grams: [150, 130, 150], slot: 'dejeuner', why: 'Glucides complets qui calent', lavageOk: true }),
      idea('veloute-oeuf', 'Velouté de potiron, œuf, pain complet', ['veloute-de-potiron', 'oeuf', 'pain-complet'], { grams: [300, 55, 35], slot: 'diner', why: 'Chaud, léger, rassasiant' }),
      idea('lentilles-oeuf', 'Lentilles, carottes, œuf dur', ['lentilles-cuites', 'carottes-cuites', 'oeuf'], { grams: [150, 150, 55], slot: 'dejeuner', why: 'Fibres et protéines végétales', lavageOk: true }),
    ],
    ttc: 'Zéro alcool tant que tu ne sais pas. Thé : 4 tasses max, tisanes à volonté. Pas de sauna ni de bain très chaud. Les folates continuent.',
    weight: 'La balance peut monter avec l’eau : on regarde la moyenne 7 j. Le bonus est déjà dans ton budget.',
  },
  premenstruel: {
    title: 'Envies de sucre : on les prévoit',
    focus: 'Fringales fréquentes (+{cycleExtra} kcal prévus) : un carré de chocolat noir prévu vaut mieux qu’une tablette subie.',
    focusNoExtra: 'Les fringales sont fréquentes ces jours-ci : un carré de chocolat noir prévu vaut mieux qu’une tablette subie.',
    favour: [
      'Magnésium et vitamine B6 (banane, amandes, pois chiches, chocolat noir)',
      'Calcium (skyr, fromage blanc, yaourt)',
      'Aliments riches en eau (concombre, soupe)',
      'Protéines au goûter',
    ],
    limit: ['Sel (plats préparés, charcuterie, chips)', 'Le sucré en libre-service : sors ta portion', 'Alcool', 'Trop de thé (théine)'],
    ideas: [
      idea('banane-amandes', 'Banane + 10 amandes', ['banane', 'amandes'], { grams: [120, 12], slot: 'collation', why: 'Magnésium et B6 pour la fringale' }),
      idea('fromage-blanc-choco', 'Fromage blanc 0 %, cannelle, 1 carré de chocolat noir', ['fromage-blanc-0-pct', 'chocolat-noir-70-pct'], { grams: [150, 5], slot: 'collation', why: 'Le goût du dessert, avec du calcium', lavageOk: true }),
      idea('houmous-crudites', 'Houmous et crudités', ['houmous', 'concombre', 'carotte-crue'], { grams: [40, 150, 100], slot: 'collation', why: 'Croquant et salé, sans chips', lavageOk: true }),
      idea('soupe-oeuf', 'Soupe de légumes + œuf', ['soupe-de-legumes', 'oeuf'], { grams: [300, 110], slot: 'diner', why: 'Riche en eau, contre la rétention', lavageOk: true }),
    ],
    ttc: 'Pas d’alcool tant que tu ne sais pas. Si tes règles ne viennent pas, un test est fiable dès le jour attendu.',
    weight: 'Le bonus est déjà dans ton budget. Ignore la balance ces jours-ci : c’est souvent de l’eau.',
  },
  retard: {
    title: 'En attendant de savoir',
    focus: 'On mange à l’équilibre, sans gros déficit, et zéro alcool.',
    favour: ['Folates (lentilles, épinards, orange)', 'Repas réguliers', 'Protéines à chaque repas', 'De l’eau'],
    limit: [
      'Alcool',
      'Un déficit agressif',
      'Plus de 3–4 tasses de thé',
      'Par précaution : cru et lait cru (sushis, saumon fumé, huîtres, fromages au lait cru)',
    ],
    ideas: [
      idea('lentilles-epinards', 'Lentilles, épinards, œuf dur', ['lentilles-cuites', 'epinards-cuits', 'oeuf'], { grams: [150, 150, 55], slot: 'dejeuner', why: 'Folates et fer', lavageOk: true }),
      idea('cabillaud-riz', 'Cabillaud, riz complet, brocoli', ['cabillaud-cuit', 'riz-complet-cuit', 'brocoli-cuit'], { grams: [150, 120, 150], slot: 'diner', why: 'Léger, complet, bien cuit' }),
      idea('orange-yaourt', 'Orange + yaourt nature', ['orange', 'yaourt-nature'], { grams: [150, 125], slot: 'collation', why: 'Folates et calcium', lavageOk: true }),
      idea('omelette-epinards-r', 'Omelette bien cuite aux épinards', ['oeuf', 'epinards-cuits'], { grams: [110, 150], slot: 'diner', why: 'Folates, protéines, prêt en 5 minutes', lavageOk: true }),
    ],
    ttc: 'Un test urinaire est fiable dès le jour des règles attendues, de préférence le matin. On met la perte de poids en pause le temps de savoir.',
    notTtc: 'Stress, gros déficit ou beaucoup de sport peuvent décaler un cycle : ce n’est pas le moment de serrer.',
  },
  grossesse: {
    title: 'Bien nourrir, sans compter',
    focus: 'Pas de déficit : des repas réguliers et complets. À valider avec ta sage-femme ou ton médecin.',
    favour: [
      'Folates (lentilles, épinards, brocoli)',
      'Fer et calcium (viande bien cuite, laitages pasteurisés)',
      'Petits poissons gras bien cuits, 2 fois par semaine',
      'Fibres et eau',
    ],
    limit: [
      'Alcool : zéro',
      'Lait cru et fromages au lait cru',
      'Viande, poisson et œufs crus ou peu cuits ; saumon fumé, sushis, huîtres, charcuterie crue, foie',
      'Thé : 3–4 tasses max (théine), tisanes ok sauf réglisse et grandes quantités de sauge ; gros poissons prédateurs (espadon, thon frais)',
    ],
    ideas: [
      idea('g-saumon-quinoa', 'Saumon bien cuit, quinoa, brocoli', ['saumon-cuit', 'quinoa-cuit', 'brocoli-cuit'], { grams: [125, 150, 150], slot: 'diner', why: 'Oméga-3, bien cuit', lavageOk: true }),
      idea('g-lentilles-oeuf', 'Lentilles, carottes, œuf dur bien cuit', ['lentilles-cuites', 'carottes-cuites', 'oeuf'], { grams: [150, 150, 55], slot: 'dejeuner', why: 'Folates et fer', lavageOk: true }),
      idea('g-yaourt-fraises', 'Yaourt nature + fraises bien lavées', ['yaourt-nature', 'fraises'], { grams: [125, 150], slot: 'collation', why: 'Calcium et vitamine C', lavageOk: true }),
      idea('g-poulet-patate', 'Poulet bien cuit, patate douce, haricots verts', ['blanc-de-poulet-cuit', 'patate-douce-cuite', 'haricots-verts-cuits'], { grams: [130, 200, 150], slot: 'dejeuner', why: 'Complet et rassasiant' }),
    ],
  },
};

// ---------- content: regulation ----------

const ALL: 'all' = 'all';

export const REGULATION: RegulationTipDef[] = [
  { id: 'light-am', title: '10 min de lumière dehors', detail: 'avant 10 h, même nuageux', moments: ['matin'], phases: ALL, boost: ['shortSleep'], habitKey: 'light', action: 'habit:light', priority: 5,
    why: 'La lumière du jour tôt le matin aide à caler l’horloge interne : l’endormissement du soir est souvent plus facile.' },
  { id: 'coffee-cap', title: 'Thé avant 14 h', detail: 'ensuite, tisanes à volonté', moments: ['matin'], phases: ALL, boost: ['shortSleep', 'ttc'], habitKey: 'coffee', action: 'habit:coffee', priority: 4,
    why: 'La théine du thé, c’est de la caféine : elle reste longtemps dans le corps. La garder pour le matin protège ta nuit. En essai bébé, environ 4 tasses de thé max par jour.' },
  { id: 'breakfast-prot', title: 'Petit-déj protéiné', detail: 'la faim monte souvent après une nuit courte', moments: ['matin'], phases: ALL, boost: ['shortSleep'], habitKey: 'breakfast', action: 'habit:breakfast', priority: 2,
    why: 'Des protéines le matin aident à tenir jusqu’au midi et limitent les fringales de l’après-midi.' },
  { id: 'breathe', title: 'Respirer 5 min', detail: 'cohérence cardiaque, 6 respirations par minute', moments: ['matin', 'journee'], phases: ALL, boost: ['highStress'], boostPhases: ['luteale', 'premenstruel'], habitKey: 'coherence', action: 'breathing', priority: 8,
    why: 'Respirer lentement active le « frein » du système nerveux ; plusieurs études montrent une baisse du stress ressenti.' },
  { id: 'walk-lunch', title: 'Marche 15 min après le déjeuner', detail: 'ça remplace la séance si besoin', moments: ['journee'], phases: ALL, boost: ['lowBattery'], boostPhases: ['luteale'], habitKey: 'walk', action: 'walk', priority: 6,
    why: 'Une marche après le repas aide souvent la glycémie et le stress, sans puiser dans une récup déjà basse.' },
  { id: 'nap', title: 'Pause de 20 min avant 15 h', detail: 'allongée, sans écran', moments: ['journee'], phases: ALL, only: ['lowBattery'], boost: ['lowBattery'], action: 'sleep', priority: 7,
    why: 'Une pause courte en début d’après-midi peut recharger sans gêner la nuit ; plus tard ou plus longue, elle la décale souvent.' },
  { id: 'key-am', title: 'Séance clé plutôt avant midi', detail: 'ton énergie est souvent haute ces jours-ci', moments: ['matin'], phases: ['folliculaire', 'fertile'], only: ['notLowRecovery', 'notPregnant'], priority: 5,
    why: 'En première moitié de cycle, la récupération est souvent meilleure : c’est le bon moment pour la séance qui compte.' },
  { id: 'water-plus', title: '+0,5 L d’eau', detail: 'la gourde sur le bureau', moments: ['journee'], phases: ['luteale', 'premenstruel', 'regles'], action: 'water', priority: 4,
    why: 'Boire plus aide souvent à limiter la rétention et les maux de tête de fin de cycle.' },
  { id: 'snack-plan', title: 'Prévois ta collation de 16 h', detail: 'une idée t’attend dans ton assiette', moments: ['journee'], phases: ['luteale', 'premenstruel'], boost: ['shortSleep'], boostSymptoms: ['fringales'], action: 'plate', priority: 6,
    why: 'Une collation prévue, avec protéines et fibres, évite d’arriver affamée au dîner : la fringale de 17 h est très fréquente en fin de cycle.' },
  { id: 'salt-down', title: 'Dîner peu salé', detail: 'moins de rétention demain', moments: ['soir'], phases: ['premenstruel'], priority: 5,
    why: 'Avant les règles, le corps retient plus d’eau ; moins de sel le soir peut aider à se sentir moins gonflée.' },
  { id: 'heat', title: 'Bouillotte 15 min sur le ventre', detail: 'la chaleur détend souvent les crampes', moments: ['soir'], phases: ['regles', 'premenstruel'], boostSymptoms: ['crampes'], priority: 4,
    why: 'La chaleur locale soulage beaucoup de femmes, aussi bien qu’un antidouleur léger selon certaines études.' },
  { id: 'mobility', title: 'Mobilité douce 10 min', detail: 'bascule du bassin, chat-vache', moments: ['journee'], phases: ['regles'], boostSymptoms: ['crampes'], action: 'mobility', priority: 5,
    why: 'Bouger doucement le bassin peut soulager les crampes et le bas du dos ; ça compte comme une séance mini.' },
  { id: 'cool-room', title: 'Chambre fraîche, douche tiède', detail: 'le corps est plus chaud ces jours-ci', moments: ['soir'], phases: ['luteale', 'premenstruel'], boost: ['shortSleep'], priority: 5,
    why: 'En fin de cycle la température monte un peu : une chambre vers 18–19 °C aide souvent à s’endormir.' },
  { id: 'no-sauna', title: 'Pas de sauna ni de bain très chaud', detail: 'le temps de l’attente', moments: ['soir'], phases: ['luteale', 'premenstruel', 'retard'], only: ['ttc'], priority: 3,
    why: 'Par précaution en début de grossesse possible, on évite de trop faire monter la température du corps.' },
  { id: 'bed-early', title: 'Au lit 30 min plus tôt', detail: 'la meilleure récup, c’est la nuit', moments: ['soir'], phases: ALL, boost: ['shortSleep', 'lowBattery'], habitKey: 'sleep', action: 'sleep', priority: 6,
    why: 'Après une nuit courte, la faim et l’envie de sucre montent souvent le lendemain ; se coucher un peu plus tôt est le levier le plus simple.' },
  { id: 'screens', title: 'Écrans off 30 min avant', detail: 'un livre, une tisane', moments: ['soir'], phases: ALL, boost: ['highStress'], habitKey: 'screens', action: 'habit:screens', priority: 5,
    why: 'Lumière et notifications retardent souvent l’endormissement ; une demi-heure calme aide beaucoup de gens à mieux dormir.' },
  { id: 'me-time', title: '10 min pour toi', detail: 'rien à faire, c’est le but', moments: ['journee', 'soir'], phases: ALL, boost: ['lowMood', 'highStress'], boostSymptoms: ['humeur basse'], boostPhases: ['premenstruel'], habitKey: 'me', action: 'habit:me', priority: 3,
    why: 'Dix minutes sans objectif, c’est une vraie pause pour le système nerveux, pas du temps perdu.' },
  { id: 'no-pressure', title: 'Garde de la légèreté', detail: 'tous les 1 à 2 jours suffit, sans calendrier strict', moments: ['journee'], phases: ['fertile'], only: ['ttc'], priority: 5,
    why: 'Des rapports tous les 1 à 2 jours pendant la fenêtre fertile suffisent ; la pression du calendrier ajoute souvent du stress sans aider.' },
  { id: 'test-am', title: 'Test demain matin', detail: 'avec les premières urines', moments: ['matin', 'soir'], phases: ['retard'], only: ['ttc'], boost: ['ttc'], action: 'test', priority: 10,
    why: 'Un test urinaire est fiable dès le jour des règles attendues ; le matin, il est plus concentré.' },
  { id: 'basket-fuel', title: 'Basket ce soir : gourde pleine', detail: 'et une collation 1 h avant le match', moments: ['journee'], phases: ALL, only: ['basketDay'], action: 'water', priority: 5,
    why: 'Arriver hydratée et pas à jeun au basket limite le coup de fatigue et la grosse faim d’après match.' },
  { id: 'preg-walk', title: 'Marche douce 20–30 min', detail: 'à ton rythme, à valider avec ta sage-femme', moments: ['journee'], phases: ['grossesse'], habitKey: 'walk', action: 'walk', priority: 7,
    why: 'Le sport modéré est en général conseillé pendant la grossesse quand tout va bien ; la marche est le plus simple.' },
];

// ---------- helpers ----------

/** Small stable string hash (rotation by date). */
function hash(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
}

function latestWeight(days: Record<string, DayLog>, date: string, fallback: number): number {
  let best: { date: string; w: number } | null = null;
  for (const d of Object.values(days)) {
    if (typeof d.weight === 'number' && Number.isFinite(d.weight) && d.date <= date && (!best || d.date > best.date)) best = { date: d.date, w: d.weight };
  }
  return best?.w ?? fallback;
}

/** Wellbeing / symptom conditions for `date` (sleep and stress fall back to the day before). */
export function conditionsOn(date: string, state: AppState): Conditions {
  const p = state.profile;
  const cs = cycleSettings(p);
  const t = state.days[date];
  const y = state.days[addDays(date, -1)];
  const sleep = t?.wellbeing?.sleepH ?? y?.wellbeing?.sleepH;
  const stress = t?.wellbeing?.stress ?? y?.wellbeing?.stress;
  const bb = t?.wellbeing?.bodyBattery;
  const symptoms = t?.cycle?.symptoms ?? [];
  const mood = t?.checkin?.morningMood;
  return {
    shortSleep: sleep !== undefined && sleep < 6.5,
    lowBattery: bb !== undefined && bb < 30,
    highStress: stress !== undefined && stress >= 50,
    lowMood: (mood !== undefined && mood <= 2) || symptoms.includes('humeur basse'),
    symptoms,
    ttc: cs.ttc && !cs.pregnant,
    pregnant: cs.pregnant,
    basketDay: (p.basketDays ?? []).includes(weekday(date)),
    lavage: !cs.pregnant && phaseOn(date, p).id === 'lavage',
  };
}

function holds(k: CondKey, c: Conditions): boolean {
  switch (k) {
    case 'notPregnant': return !c.pregnant;
    case 'notLowRecovery': return !(c.shortSleep || c.lowBattery || c.highStress);
    default: return c[k];
  }
}

/** Real extra kcal of the phase today, after the floor and the TTC / pregnancy rules. */
function realCycleExtra(date: string, p: Profile, days: Record<string, DayLog>, info: CycleInfo | null): number {
  const cs = cycleSettings(p);
  if (!info || cs.pregnant) return 0;
  const adj = adviceFor(info, p, date).kcalAdjust;
  if (!adj) return 0;
  const w = latestWeight(days, date, p.startWeight);
  return Math.max(0, targets(date, p, w, days[date], adj).kcal - targets(date, p, w, days[date], 0).kcal);
}

function kcalLeftOn(date: string, state: AppState, extra: number): number {
  const p = state.profile;
  const day = state.days[date];
  const w = latestWeight(state.days, date, p.startWeight);
  const t = targets(date, p, w, day, 0);
  const eaten = day ? totals(day).kcal : 0;
  return t.budget + extra - eaten;
}

function toIdea(d: FoodIdeaDef): GuideIdea {
  const grams: number[] = [];
  let kcal = 0;
  let protein = 0;
  let ok = true;
  d.foodIds.forEach((id, i) => {
    const f = getFood(id);
    const g = d.grams?.[i] ?? f?.portions[0]?.grams ?? 100;
    grams.push(g);
    if (!f) { ok = false; return; }
    const n = nutrientsFor(f, g);
    kcal += n.kcal;
    protein += n.protein;
  });
  return {
    id: d.id, name: d.label, foodId: d.foodIds[0], foodIds: d.foodIds, grams,
    kcal: ok ? Math.round(kcal / 10) * 10 : undefined,
    protein: ok ? Math.round(protein) : undefined,
    slot: d.slot, why: d.why,
  };
}

/** Pick `n` ideas: pregnancy-safe, lavage-friendly, fitting the evening budget, stable rotation by date. */
export function pickIdeas(plate: PlateDef, date: string, c: Conditions, moment: Moment | null, n: number, kcalLeft?: number): GuideIdea[] {
  let pool = plate.ideas;
  if (c.pregnant) pool = pool.filter((i) => i.pregnancySafe);
  if (c.lavage) {
    const ok = pool.filter((i) => i.lavageOk);
    if (ok.length >= Math.min(n, 2)) pool = ok;
  }
  let ideas = pool.map(toIdea);
  // Stable rotation by date.
  const r = ideas.length ? hash(date) % ideas.length : 0;
  ideas = [...ideas.slice(r), ...ideas.slice(0, r)];
  if (moment === 'soir') {
    if (kcalLeft !== undefined) {
      const fit = ideas.filter((i) => i.kcal === undefined || i.kcal <= Math.max(0, kcalLeft));
      if (fit.length) ideas = fit;
    }
    ideas = [...ideas].sort((a, b) => (b.protein ?? 0) - (a.protein ?? 0));
  } else if (moment === 'matin') {
    // Breakfast and lunch ideas first in the morning.
    const rank = (s?: IdeaSlot) => (s === 'petit-dej' ? 0 : s === 'dejeuner' ? 1 : 2);
    ideas = [...ideas].sort((a, b) => rank(a.slot) - rank(b.slot));
  }
  return ideas.slice(0, n);
}

/** Regulation actions: ≤ max, one per pillar, ticked pillars sink to the bottom as « fait ». */
export function pickTips(phase: GuidePhase, c: Conditions, moment: Moment | null, habits: Record<string, boolean> | undefined, max = 3): GuideTip[] {
  const scored: { t: RegulationTipDef; score: number; done: boolean }[] = [];
  for (const t of REGULATION) {
    if (t.phases !== 'all' && !t.phases.includes(phase)) continue;
    if (moment && !t.moments.includes(moment)) continue;
    if (t.only && !t.only.every((k) => holds(k, c))) continue;
    if (c.pregnant && t.id === 'key-am') continue;
    let score = t.priority;
    for (const k of t.boost ?? []) if (holds(k, c)) score += 10;
    for (const s of t.boostSymptoms ?? []) if (c.symptoms.includes(s)) score += 10;
    if (t.boostPhases?.includes(phase)) score += 5;
    if (moment) score += 5;
    const done = !!(t.habitKey && habits?.[t.habitKey]);
    scored.push({ t, score, done });
  }
  scored.sort((a, b) => Number(a.done) - Number(b.done) || b.score - a.score);
  const out: GuideTip[] = [];
  const keys = new Set<string>();
  for (const { t, done } of scored) {
    if (out.length >= Math.min(max, 4)) break;
    const key = t.habitKey ?? t.action ?? t.id;
    if (keys.has(key)) continue;
    keys.add(key);
    out.push({ id: t.id, text: `${t.title} · ${t.detail}`, title: t.title, detail: t.detail, why: t.why, action: t.action, habitKey: t.habitKey, done });
  }
  return out;
}

function meaningFor(phase: GuidePhase, info: CycleInfo | null, ttc: boolean, date: string): string {
  switch (phase) {
    case 'regles': return 'Règles : l’énergie est souvent plus basse, on y va en douceur.';
    case 'folliculaire': return 'Énergie en hausse : le bon moment pour les séances clés.';
    case 'fertile':
      if (!ttc) return 'Fenêtre fertile : l’énergie est souvent au top.';
      return info && date === info.ovulation
        ? 'Ovulation estimée aujourd’hui : chances au plus haut, sans pression.'
        : 'Fenêtre fertile : les chances sont au plus haut ces jours-ci.';
    case 'luteale': return ttc ? 'Période d’attente : douceur, zéro alcool, sport modéré.' : 'Plus chaud, plus faim : c’est normal, on anticipe.';
    case 'premenstruel': return ttc ? 'Avant les règles : douceur avec toi en attendant de savoir.' : 'Avant les règles : si la balance monte, c’est de l’eau.';
    case 'retard': {
      const n = info?.lateBy ?? 0;
      if (ttc) return n >= 1 ? `Règles en retard de ${n} j : un test peut se faire.` : 'Règles attendues aujourd’hui : un test est fiable dès ce matin.';
      return n >= 1 ? `Règles en retard de ${n} j : le stress peut décaler un cycle.` : 'Règles attendues aujourd’hui (date estimée).';
    }
    case 'grossesse': return 'Grossesse : on nourrit bien, sans compter, à ton rythme.';
  }
}

function dayLabelFor(phase: GuidePhase, info: CycleInfo | null, p: Profile, date: string): string {
  if (phase === 'grossesse') {
    const since = cycleSettings(p).pregnantSince ?? date;
    const n = Math.max(0, daysBetween(since, date));
    return `${Math.floor(n / 7)} sem. et ${n % 7} j`;
  }
  if (!info) return '';
  if (phase === 'retard') return info.lateBy >= 1 ? `J${info.day} · retard ${info.lateBy} j` : `J${info.day} · règles attendues`;
  return `J${info.day} sur ~${info.length}`;
}

/** Phase used by the guide: pregnancy first, then the logged cycle. Null when tracking is off or nothing is logged. */
export function guidePhaseOn(date: string, p: Profile, days: Record<string, DayLog>): { phase: GuidePhase; info: CycleInfo | null } | null {
  const cs = cycleSettings(p);
  if (cs.pregnant) return { phase: 'grossesse', info: null };
  if (!cs.tracking) return null;
  const info = cycleOn(date, p, days);
  return info ? { phase: info.phase, info } : null;
}

/**
 * Everything the "coach du jour" needs about the cycle on `date`.
 * Null when cycle tracking is off (and not pregnant) or no period is logged yet:
 * the UI then shows « Note le 1er jour de tes dernières règles ».
 */
export function guideFor(date: string, state: AppState, opts: GuideOptions = {}): CycleGuide | null {
  const p = state.profile;
  const gp = guidePhaseOn(date, p, state.days);
  if (!gp) return null;
  const { phase, info } = gp;
  const c = conditionsOn(date, state);
  const moment = opts.moment ?? null;
  const plate = PLATES[phase];
  const cycleExtra = realCycleExtra(date, p, state.days, info);
  const focus = (cycleExtra > 0 || !plate.focusNoExtra ? plate.focus : plate.focusNoExtra).replace('{cycleExtra}', String(cycleExtra));
  const kcalLeft = opts.kcalLeft ?? (moment === 'soir' && !c.pregnant ? kcalLeftOn(date, state, cycleExtra) : undefined);
  const ttcWait = c.ttc && (phase === 'luteale' || phase === 'premenstruel');
  const noWeight = c.pregnant || phase === 'retard' || ttcWait;
  const label = phase === 'grossesse' ? 'Grossesse' : phaseLabel(phase);
  return {
    phase,
    label,
    dayLabel: dayLabelFor(phase, info, p, date),
    meaning: meaningFor(phase, info, c.ttc, date),
    moment,
    info,
    daysToPeriod: info && phase !== 'retard' ? Math.max(0, daysBetween(date, info.nextPeriod)) : null,
    conditions: c,
    nutrition: {
      title: plate.title,
      why: focus,
      favour: plate.favour,
      limit: plate.limit,
      ideas: pickIdeas(plate, date, c, moment, opts.ideas ?? 3, kcalLeft),
      weight: noWeight ? undefined : plate.weight,
      ttcNote: c.ttc ? plate.ttc : plate.notTtc,
      cycleExtra,
    },
    regulate: pickTips(phase, c, moment, state.days[date]?.habits, opts.tips ?? 3),
  };
}
