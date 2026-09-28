// Menstrual cycle model + phase-aware advice (sport, food, weight), with a
// trying-to-conceive (TTC) mode and a pregnancy mode. Pure functions only.
//
// Model: cycle day 1 = first day of period. Ovulation ≈ next period − luteal
// length (default 14 days). A positive LH test overrides the estimate
// (ovulation ≈ the day after the LH peak). Fertile window = ovulation −5 … +1.
// Predictions are estimates; the app says so wherever it shows them.

import type { CycleSettings, DayLog, Profile } from '../types';
import { addDays, daysBetween } from './dates';

export const DEFAULT_CYCLE: CycleSettings = {
  tracking: true,
  avgLength: 28,
  periodLength: 5,
  lutealLength: 14,
  ttc: true,
  pregnant: false,
};

export function cycleSettings(p: Profile): CycleSettings {
  return { ...DEFAULT_CYCLE, ...(p.cycle ?? {}) };
}

export type CyclePhase = 'regles' | 'folliculaire' | 'fertile' | 'luteale' | 'premenstruel' | 'retard';

export interface CycleInfo {
  /** Cycle day, 1-based. */
  day: number;
  /** Length used for this cycle (average of recent cycles or the setting). */
  length: number;
  phase: CyclePhase;
  cycleStart: string;
  ovulation: string;
  fertileStart: string;
  fertileEnd: string;
  nextPeriod: string;
  /** True when ovulation comes from a positive LH test. */
  ovulationFromLH: boolean;
  /** Days past the expected period (only when phase is 'retard'). */
  lateBy: number;
}

/**
 * Dates marked as first day of period, ascending. Starts logged within 10 days
 * of a kept start (same bleed logged twice, e.g. from onboarding and the
 * "other day" sheet) are merged into the earliest one.
 */
export function periodStarts(days: Record<string, DayLog>): string[] {
  const all = Object.values(days)
    .filter((d) => d.cycle?.period === 'start')
    .map((d) => d.date)
    .sort();
  const out: string[] = [];
  for (const d of all) {
    if (out.length && daysBetween(out[out.length - 1], d) < 10) continue;
    out.push(d);
  }
  return out;
}

/** Average of the last 6 plausible cycle lengths (21–40 days), else the setting. */
export function averageLength(starts: string[], fallback: number): number {
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const g = daysBetween(starts[i - 1], starts[i]);
    if (g >= 21 && g <= 40) gaps.push(g);
  }
  const recent = gaps.slice(-6);
  if (!recent.length) return fallback;
  return Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
}

/** Cycle position on `date`, or null when no period start is logged on or before it. */
export function cycleOn(date: string, p: Profile, days: Record<string, DayLog>): CycleInfo | null {
  const cs = cycleSettings(p);
  const starts = periodStarts(days).filter((d) => d <= date);
  if (!starts.length) return null;
  const cycleStart = starts[starts.length - 1];
  const length = averageLength(periodStarts(days), cs.avgLength);
  const day = daysBetween(cycleStart, date) + 1;
  const expected = addDays(cycleStart, length);

  // Positive LH test inside this cycle → ovulation the next day, and the next
  // period is re-estimated from it (ovulation + luteal length).
  const lh = Object.values(days)
    .filter((d) => d.cycle?.lh === 'pos' && d.date >= cycleStart && d.date < expected)
    .map((d) => d.date)
    .sort()[0];
  const ovulation = lh ? addDays(lh, 1) : addDays(expected, -cs.lutealLength);
  const nextPeriod = lh ? addDays(ovulation, cs.lutealLength) : expected;
  const fertileStart = addDays(ovulation, -5);
  const fertileEnd = addDays(ovulation, 1);

  let phase: CyclePhase;
  let lateBy = 0;
  if (date >= nextPeriod) {
    phase = 'retard';
    lateBy = daysBetween(nextPeriod, date);
  } else if (day <= cs.periodLength) phase = 'regles';
  else if (date >= fertileStart && date <= fertileEnd) phase = 'fertile';
  else if (date < fertileStart) phase = 'folliculaire';
  else if (daysBetween(date, nextPeriod) <= 5) phase = 'premenstruel';
  else phase = 'luteale';

  return { day, length, phase, cycleStart, ovulation, fertileStart, fertileEnd, nextPeriod, ovulationFromLH: !!lh, lateBy };
}

export interface PhaseAdvice {
  label: string;
  /** One-line summary for the Today screen. */
  headline: string;
  body: string;
  sport: string;
  food: string;
  weight: string;
  /** Extra kcal allowed today on top of the base target. */
  kcalAdjust: number;
  /** Suggested ceiling for session intensity. */
  intensityCap: 'facile' | 'modéré' | 'soutenu';
}

const LABEL: Record<CyclePhase, string> = {
  regles: 'Règles',
  folliculaire: 'Phase folliculaire',
  fertile: 'Fenêtre fertile',
  luteale: 'Phase lutéale',
  premenstruel: 'Avant les règles',
  retard: 'Règles en retard',
};

export function phaseLabel(ph: CyclePhase): string {
  return LABEL[ph];
}

/** Advice for a cycle position. Wording stays gentle: every body reacts differently. */
export function adviceFor(info: CycleInfo, p: Profile, date: string): PhaseAdvice {
  const { ttc } = cycleSettings(p);
  const ovToday = date === info.ovulation;
  switch (info.phase) {
    case 'regles':
      return {
        label: LABEL.regles,
        headline: 'Écoute ton énergie, la version mini compte.',
        body: 'Beaucoup de femmes ont moins d’énergie les premiers jours. Rien d’obligatoire : bouger doucement peut même soulager les crampes.',
        sport: 'Marche, vélo tranquille, mobilité. Nage si tu es à l’aise. Garde les séances dures pour la semaine prochaine.',
        food: 'Mise sur le fer (lentilles, viande rouge, sardines, épinards) avec de la vitamine C, et le magnésium (chocolat noir, amandes).',
        weight: 'Le poids peut encore être un peu haut les 1ers jours, il redescend souvent en fin de règles.',
        kcalAdjust: 0,
        intensityCap: 'modéré',
      };
    case 'folliculaire':
      return {
        label: LABEL.folliculaire,
        headline: 'Énergie en hausse : bon moment pour les séances clés.',
        body: 'Les hormones remontent, la récupération est souvent meilleure. C’est la période où le déficit se tient le plus facilement.',
        sport: 'Place ici les séances plus longues ou un peu plus intenses, et les nouveautés (1re sortie vélo, nage plus longue).',
        food: 'Plan normal. Protéines à chaque repas, légumes à volonté, féculents surtout autour des séances.',
        weight: 'Souvent la période où la balance est la plus « honnête ».',
        kcalAdjust: 0,
        intensityCap: 'soutenu',
      };
    case 'fertile':
      return {
        label: LABEL.fertile,
        headline: ttc
          ? ovToday ? 'Ovulation estimée aujourd’hui.' : 'Fenêtre fertile : c’est le moment.'
          : 'Fenêtre fertile.',
        body: ttc
          ? 'Les chances sont les plus hautes les 2–3 jours avant l’ovulation et le jour même. Des rapports tous les 1 à 2 jours suffisent, sans pression.'
          : 'Période d’ovulation estimée.',
        sport: 'Énergie souvent au top. Sport normal, en restant raisonnable : pas besoin de te mettre dans le rouge.',
        food: 'Plan normal. Pense à l’acide folique si ton médecin ou ta sage-femme te l’a conseillé.',
        weight: 'Légère variation possible autour de l’ovulation (eau).',
        kcalAdjust: 0,
        intensityCap: 'soutenu',
      };
    case 'luteale':
      return {
        label: LABEL.luteale,
        headline: ttc ? 'Attente : douceur, pas d’alcool, sport modéré.' : 'Plus chaud, plus faim : c’est normal.',
        body: 'La température monte un peu, la fatigue et la faim aussi. Le corps dépense un peu plus : +100 kcal sont prévus.' +
          (ttc ? ' En attendant de savoir, évite l’alcool, le sauna et les bains très chauds.' : ''),
        sport: 'Endurance tranquille plutôt qu’intensité. Hydrate-toi bien, surtout en salle ou au basket.',
        food: 'Protéines + fibres pour tenir la faim. Une collation prévue vaut mieux qu’un craquage.',
        weight: 'Rétention d’eau possible : regarde la moyenne sur 7 jours, pas la pesée du jour.',
        kcalAdjust: 100,
        intensityCap: 'modéré',
      };
    case 'premenstruel':
      return {
        label: LABEL.premenstruel,
        headline: 'Si la balance monte, c’est de l’eau.',
        body: 'Juste avant les règles, +0,5 à 2 kg d’eau sont fréquents. Ce n’est pas du gras et ça repart avec les règles.',
        sport: 'Version mini bienvenue. Marche, nage, mobilité : ce qui te fait du bien.',
        food: 'Envies de sucre : prévois un carré de chocolat noir ou un fruit. Moins de sel limite la rétention.',
        weight: 'Ne tire aucune conclusion de la balance ces jours-ci.',
        kcalAdjust: 150,
        intensityCap: 'modéré',
      };
    case 'retard':
      return {
        label: LABEL.retard,
        headline: ttc
          ? info.lateBy >= 1 ? `Règles en retard de ${info.lateBy} j : un test peut se faire.` : 'Règles attendues aujourd’hui.'
          : info.lateBy >= 1 ? `Règles en retard de ${info.lateBy} j.` : 'Règles attendues aujourd’hui.',
        body: ttc
          ? 'Un test urinaire est fiable à partir du jour des règles attendues. Le stress, un gros déficit ou beaucoup de sport peuvent aussi décaler un cycle.'
          : 'Le stress, un gros déficit ou beaucoup de sport peuvent décaler un cycle.',
        sport: 'Reste sur du facile à modéré en attendant.',
        food: 'Pas de déficit agressif en attendant de savoir. Pas d’alcool.',
        weight: 'Rétention probable, ignore la balance quelques jours.',
        kcalAdjust: 150,
        intensityCap: 'modéré',
      };
  }
}

/** Standing tips while trying to conceive. */
export const TTC_TIPS: string[] = [
  'Acide folique (vitamine B9) : il est recommandé de le commencer avant la grossesse. Demande à ton médecin ou ta sage-femme.',
  'Perdre 5 à 10 % de son poids quand l’IMC dépasse 30 améliore la fertilité. Un déficit trop fort peut au contraire perturber l’ovulation : on reste modéré.',
  'Alcool : zéro dans la 2e moitié du cycle, et idéalement le moins possible tout court.',
  'Café : 2 à 3 tasses par jour maximum.',
  'Le sport modéré est bénéfique. Ce sont les très gros volumes intenses qui peuvent gêner.',
];

/** Pregnancy mode: the app stops the weight-loss deficit. */
export const PREGNANCY_NOTE =
  'Mode grossesse : plus de déficit calorique, on mange à l’équilibre. Le sport continue si tout va bien, à valider avec ta sage-femme ou ton médecin (pas de sports à risque de chute ou de choc, pas d’effort à bout de souffle).';
