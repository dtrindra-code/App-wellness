// Training plan generator: pré-prépa (general triathlon prep from zero) then half-ironman prep.
// Pure and deterministic from the Profile; memoized on the fields that matter.

import type { DayLog, Intensity, PhaseId, PlannedSession, PlanWeek, Profile, SeasonBlock, Sport } from '../types';
import { addDays, mondayOf, today, weekday } from '../lib/dates';
import { phaseOn } from '../lib/nutrition';
import { adviceFor, cycleOn, cycleSettings, phaseLabel } from '../lib/cycle';
import type { CycleInfo } from '../lib/cycle';

// ---------- public API ----------

/** Every week from the Monday of profile.startDate to the race week. */
export function planWeeks(p: Profile): PlanWeek[] {
  return build(p).weeks;
}

export function weekOf(date: string, p: Profile): PlanWeek | undefined {
  return planWeeks(p).find((w) => date >= w.start && date < addDays(w.start, 7));
}

export function sessionsOn(date: string, p: Profile): PlannedSession[] {
  return weekOf(date, p)?.sessions.filter((s) => s.date === date) ?? [];
}

/** Big blocks from the start to the race, for the season overview. */
export function season(p: Profile): SeasonBlock[] {
  return build(p).blocks;
}

/** The season block containing `date` (clamped to the plan), if any. */
export function blockOn(date: string, p: Profile): SeasonBlock | undefined {
  return season(p).find((b) => date >= b.start && date <= b.end);
}

// ---------- internals ----------

type BlockKey = 'reprise' | 'fondations' | 'consolidation' | 'vacances' | 'base' | 'construction' | 'specifique' | 'affutage';

interface Spec {
  sport: Sport;
  title: string;
  minutes: number;
  intensity: Intensity;
  details: string;
  mini?: string;
  optional?: boolean;
  /** Longest session of the week: goes on Saturday or Sunday. */
  long?: boolean;
}

interface Built { weeks: PlanWeek[]; blocks: SeasonBlock[] }

let memoKey = '';
let memoVal: Built = { weeks: [], blocks: [] };

function build(p: Profile): Built {
  const key = JSON.stringify([p.startDate, p.lavageEnd, p.vacationStart, p.vacationEnd, p.prepStart, p.raceDate, p.raceName, p.basketDays ?? []]);
  if (key === memoKey) return memoVal;
  memoVal = compute(p);
  memoKey = key;
  return memoVal;
}

const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const r100 = (n: number) => Math.round(n / 100) * 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
const minD = (a: string, b: string) => (a < b ? a : b);
const maxD = (a: string, b: string) => (a > b ? a : b);
const fmtM = (m: number) => `${m.toLocaleString('fr-FR')} m`;
const fmtH = (min: number) => {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return hh ? `${hh} h${mm ? String(mm).padStart(2, '0') : ''}` : `${mm} min`;
};

const MINI: Record<Sport, string> = {
  swim: '15 min de nage facile, la nage que tu veux, pauses autorisées.',
  bike: '10 min de vélo tranquille + 5 min d’étirements.',
  run: '5 min de marche, puis 5 × (1 min de course lente / 1 min de marche).',
  strength: '2 tours : 10 squats, 20 s de gainage, 8 pompes sur les genoux. Et c’est tout.',
  walk: '15 min de marche dehors, sans objectif.',
  mobility: '5 min de respiration calme + 10 min d’étirements doux.',
  basket: '15 min de shoots tranquilles.',
  other: '15 min de mouvement, ce qui te fait envie.',
};

interface Calendar {
  w1: string;
  fondStart: string;
  consStart: string;
  vacStart: string;
  prepStart: string;
  baseStart: string;
  buildStart: string;
  specStart: string;
  taperStart: string;
  race: string;
  consWeeks: number;
  vacEnd: string;
}

function calendar(p: Profile): Calendar {
  const w1 = mondayOf(p.startDate);
  const vacStart = p.vacationStart;
  const prepStart = p.prepStart;
  const race = p.raceDate;
  const fondStart = minD(addDays(w1, 21), vacStart);
  const consStart = minD(addDays(w1, 56), vacStart);
  let consWeeks = 0;
  for (let m = mondayOf(consStart); addDays(m, 3) < vacStart; m = addDays(m, 7)) if (addDays(m, 3) >= consStart) consWeeks++;

  const prepMon = mondayOf(prepStart);
  const raceMon = mondayOf(race);
  const taperStart = maxD(prepStart, addDays(raceMon, -7));
  const specStart = maxD(prepStart, addDays(raceMon, -35));
  const remWeeks = Math.max(0, Math.round(dayDiff(prepMon, mondayOf(specStart)) / 7));
  const buildStart = maxD(prepStart, addDays(prepMon, Math.ceil(remWeeks / 2) * 7));
  return { w1, fondStart, consStart, vacStart, prepStart, baseStart: prepStart, buildStart, specStart, taperStart, race, consWeeks, vacEnd: p.vacationEnd };
}

function dayDiff(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

function blockKeyOn(date: string, c: Calendar): BlockKey {
  if (date < c.fondStart) return 'reprise';
  if (date < c.consStart) return 'fondations';
  if (date < c.vacStart) return 'consolidation';
  if (date < c.prepStart) return 'vacances';
  if (date < c.buildStart) return 'base';
  if (date < c.specStart) return 'construction';
  if (date < c.taperStart) return 'specifique';
  return 'affutage';
}

type Major = 'pre' | 'vac' | 'prep';
const majorOf = (k: BlockKey): Major =>
  k === 'vacances' ? 'vac' : k === 'reprise' || k === 'fondations' || k === 'consolidation' ? 'pre' : 'prep';

function compute(p: Profile): Built {
  const c = calendar(p);
  const basket = new Set((p.basketDays ?? []).filter((d) => d >= 0 && d <= 6));
  const weeks: PlanWeek[] = [];
  if (c.w1 > c.race) return { weeks, blocks: [] };

  const raceMon = mondayOf(c.race);
  let index = 1;
  for (let mon = c.w1; mon <= raceMon; mon = addDays(mon, 7), index++) {
    const thu = maxD(addDays(mon, 3), p.startDate);
    const key = blockKeyOn(minD(thu, c.race), c);
    const phase: PhaseId = phaseOn(maxD(mon, p.startDate), p).id;

    // Race week: fixed layout relative to race day.
    if (mon === raceMon) {
      weeks.push({ index, start: mon, phase, focus: 'Semaine de course. Tu as fait le travail : repose-toi et fais-toi confiance.', sessions: raceWeek(p, c, basket) });
      continue;
    }

    const { specs, focus } = weekSpecs(key, mon, c);
    const available: number[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(mon, d);
      if (date < p.startDate || date > c.race || basket.has(d)) continue;
      if (majorOf(blockKeyOn(date, c)) !== majorOf(key)) continue;
      available.push(d);
    }
    // Pré-prépa and holidays build a habit: never two sessions on one day.
    weeks.push({ index, start: mon, phase, focus, sessions: schedule(mon, specs, available, basket, majorOf(key) === 'prep') });
  }

  return { weeks, blocks: blocks(p, c) };
}

// ---------- week templates ----------

function weekSpecs(key: BlockKey, mon: string, c: Calendar): { specs: Spec[]; focus: string } {
  switch (key) {
    case 'reprise': return reprise(Math.round(dayDiff(c.w1, mon) / 7));
    case 'fondations': return fondations(Math.round(dayDiff(mondayOf(c.fondStart), mon) / 7));
    case 'consolidation': {
      const j = Math.round(dayDiff(mondayOf(c.consStart), mon) / 7);
      return consolidation(j, c.consWeeks);
    }
    case 'vacances': return vacances(addDays(mon, 3) > c.vacEnd);
    default: return prepa(key, mon, c);
  }
}

function reprise(k: number): { specs: Spec[]; focus: string } {
  const focus = [
    'On installe l’habitude, pas la performance.',
    'Même heure, même sac prêt : le plus dur, c’est de partir.',
    'Trois semaines de suite, c’est déjà une routine. Bravo d’être là.',
  ][Math.min(k, 2)];
  const swim = [
    '10 × 25 m de crawl tranquille, 30 s de repos entre chaque. Souffle bien dans l’eau et relâche les épaules. Si le crawl coince, alterne avec la brasse.',
    '100 m pour t’échauffer, la nage que tu veux. 8 × 25 m d’éducatifs (battements avec planche, un bras) puis 6 × 50 m de crawl souple, 30 s de repos.',
    '200 m d’échauffement. 4 × 100 m de crawl tranquille, 30 s de repos. Pense à expirer longuement dans l’eau.',
  ][Math.min(k, 2)];
  const run = [
    '8 × (1 min de course très lente / 2 min de marche). Tu dois pouvoir parler en courant.',
    '8 × (1 min 30 de course lente / 1 min 30 de marche). Même allure que la semaine dernière, juste un peu plus longtemps.',
    '6 × (2 min de course lente / 1 min de marche). Si c’est trop, reviens à la version de la semaine 2 sans scrupule.',
  ][Math.min(k, 2)];
  const bikeMin = [30, 30, 35][Math.min(k, 2)];
  const specs: Spec[] = [
    { sport: 'swim', title: 'Natation technique', minutes: [25, 30, 30][Math.min(k, 2)], intensity: 'facile', details: swim, mini: '10 min de nage facile + 5 min de battements avec planche.' },
    { sport: 'bike', title: 'Vélo tranquille', minutes: bikeMin, intensity: 'facile', long: true, details: `${bikeMin} min à une allure où tu peux discuter. Home trainer, vélo dehors ou marche rapide : c’est pareil pour cette semaine.`, mini: MINI.bike },
    { sport: 'run', title: 'Course-marche', minutes: [25, 30, 30][Math.min(k, 2)], intensity: 'facile', details: `5 min de marche pour démarrer. ${run}`, mini: MINI.run },
    k === 1
      ? { sport: 'strength', title: 'Renfo doux', minutes: 20, intensity: 'facile', optional: true, details: '2 tours : 12 squats, 20 s de gainage, 8 pompes sur les genoux, 10 ponts fessiers. Lent et propre.', mini: MINI.strength }
      : { sport: 'mobility', title: 'Mobilité', minutes: 15, intensity: 'facile', optional: true, details: 'Hanches, dos, épaules : 5 mouvements lents, 1 min chacun, puis 5 min de respiration allongée.', mini: '5 min de respiration calme + 5 min d’étirements.' },
  ];
  return { specs, focus };
}

function fondations(k: number): { specs: Spec[]; focus: string } {
  const i = Math.min(k, 4);
  const focus = [
    'On pose les fondations : un peu plus long, toujours facile.',
    'Régulière plutôt que forte. Tu construis quelque chose de solide.',
    'Tu nages plus longtemps sans t’arrêter : c’est ça, le progrès.',
    'Écoute ton corps. Une mini vaut mieux qu’une séance sautée.',
    'Fin des fondations. Regarde d’où tu pars : c’est déjà beaucoup.',
  ][i];
  const cont = [300, 400, 550, 700, 900][i];
  const bike = [45, 50, 55, 60, 60][i];
  const run = [
    { m: 30, t: '5 × (3 min de course / 1 min de marche).' },
    { m: 30, t: '4 × (5 min de course / 1 min de marche).' },
    { m: 30, t: '3 × (7 min de course / 1 min de marche).' },
    { m: 30, t: '20 min de course continue, très lente. Marcher 1 min si besoin, c’est permis.' },
    { m: 35, t: '25 min de course continue, allure conversation.' },
  ][i];
  const swimHard = i >= 1;
  const specs: Spec[] = [
    {
      sport: 'swim', title: swimHard ? 'Natation endurance' : 'Natation continue', minutes: [35, 40, 40, 45, 45][i], intensity: swimHard ? 'modéré' : 'facile',
      details: `200 m d’échauffement avec éducatifs. Puis ${fmtM(cont)} de crawl continu, tranquille : si besoin, 10 s au bord et tu repars.${swimHard ? ' Pour finir, 4 × 50 m un peu plus vite, 30 s de repos.' : ''}`,
      mini: '15 min de nage facile, en continu si possible.',
    },
    { sport: 'bike', title: 'Vélo endurance', minutes: bike, intensity: 'facile', long: true, details: `${bike} min en endurance : respiration calme, tu pédales rond, sans à-coups. Bois une gorgée toutes les 15 min.`, mini: MINI.bike },
    { sport: 'run', title: i >= 3 ? 'Course facile' : 'Course-marche', minutes: run.m, intensity: 'facile', details: `5 min de marche rapide pour démarrer. ${run.t}`, mini: MINI.run },
    {
      sport: 'strength', title: 'Renfo', minutes: 25, intensity: 'facile', optional: i === 0,
      details: '3 tours : 12 squats, 10 fentes par jambe, 30 s de gainage, 10 pompes sur les genoux, 12 tirages élastique. Bien placé, sans te presser.',
      mini: MINI.strength,
    },
  ];
  return { specs, focus };
}

function consolidation(j: number, n: number): { specs: Spec[]; focus: string } {
  const light = j % 4 === 3;
  const brick = j >= n - 2;
  const f = light ? 0.7 : 1;
  const step = Math.min(j, 3);
  const dist = r100((1200 + step * 100) * f);
  const bikeMin = Math.min(75, 60 + step * 5);
  const runMin = r5((30 + Math.min(step, 1) * 5) * f);
  const focus = light
    ? 'Semaine plus légère : le corps progresse pendant le repos.'
    : brick
      ? 'Premiers enchaînements vélo-course : découvre la sensation, sans chrono.'
      : ['On consolide. Tu es plus solide qu’il y a deux mois.', 'Un peu de rythme sur le vélo, le reste reste facile.', 'Garde de l’envie en réserve : on vise la régularité.'][j % 3];

  const specs: Spec[] = [
    {
      sport: 'swim', title: 'Natation', minutes: r5(45 * f), intensity: 'facile',
      details: `${fmtM(dist)} au total. 300 m d’échauffement, puis ${light ? '2' : '3'} × ${fmtM(r100((dist - 400) / (light ? 2 : 3)))} de crawl régulier, 30 s de repos. 100 m souples pour finir.`,
      mini: MINI.swim,
    },
  ];
  if (brick && !light) {
    specs.push({ sport: 'bike', title: 'Enchaînement vélo-course', minutes: 50, intensity: 'modéré', long: true, details: '40 min de vélo en endurance, puis tu changes de chaussures vite et tu cours 10 min très tranquille. Les jambes bizarres au début, c’est normal.', mini: '10 min de vélo + 5 min de course très lente.' });
    specs.push({ sport: 'bike', title: 'Vélo tranquille', minutes: 45, intensity: 'facile', optional: true, details: '45 min en endurance, pour le plaisir.', mini: MINI.bike });
  } else if (light) {
    const m = r5(bikeMin * f);
    specs.push({ sport: 'bike', title: 'Vélo endurance', minutes: m, intensity: 'facile', long: true, details: `${m} min tranquilles, sans bloc de rythme cette semaine.`, mini: MINI.bike });
  } else {
    specs.push({ sport: 'bike', title: 'Vélo avec du rythme', minutes: bikeMin, intensity: 'modéré', long: true, details: `15 min d’échauffement. 3 × 6 min à allure soutenue mais contrôlée, 4 min faciles entre. Le reste en endurance (${bikeMin} min au total).`, mini: MINI.bike });
  }
  specs.push({ sport: 'run', title: 'Course facile', minutes: runMin, intensity: 'facile', details: `${runMin - 5} min en aisance, tu peux parler. Puis 4 lignes droites de 20 s en accélérant doucement, retour en marchant.`, mini: MINI.run });
  specs.push({ sport: 'strength', title: 'Renfo', minutes: r5(30 * f), intensity: 'facile', details: '3 tours : 15 squats, 10 fentes sautées ou non, 40 s de gainage, 10 pompes, 12 tirages élastique, 15 ponts fessiers.', mini: MINI.strength });
  return { specs, focus };
}

function vacances(returning: boolean): { specs: Spec[]; focus: string } {
  if (returning) {
    return {
      focus: 'Retour en douceur. On reprend le fil sans rien rattraper.',
      specs: [
        { sport: 'swim', title: 'Natation tranquille', minutes: 30, intensity: 'facile', optional: true, details: '30 min de nage facile, avec quelques longueurs de battements.', mini: MINI.swim },
        { sport: 'bike', title: 'Vélo tranquille', minutes: 40, intensity: 'facile', optional: true, long: true, details: '40 min en endurance pour dérouiller les jambes.', mini: MINI.bike },
        { sport: 'mobility', title: 'Mobilité', minutes: 15, intensity: 'facile', optional: true, details: 'Hanches, dos, épaules : 5 mouvements lents, 1 min chacun.', mini: MINI.mobility },
      ],
    };
  }
  return {
    focus: 'Vacances : bouge pour le plaisir, rien n’est obligatoire.',
    specs: [
      { sport: 'swim', title: 'Nage dans le lagon', minutes: 25, intensity: 'facile', optional: true, details: '20 à 30 min de nage le long de la plage, tranquille. Reste près du bord, avec quelqu’un en vue, et de la crème solaire.', mini: '10 min de nage + 5 min à flotter.' },
      { sport: 'walk', title: 'Balade pieds nus', minutes: 45, intensity: 'facile', optional: true, long: true, details: 'Une marche ou une petite rando, au rythme des pauses photo.', mini: MINI.walk },
      { sport: 'mobility', title: 'Étirements face à la mer', minutes: 15, intensity: 'facile', optional: true, details: 'Au lever : hanches, dos, épaules, 1 min par mouvement, puis quelques respirations lentes.', mini: MINI.mobility },
    ],
  };
}

function prepa(key: BlockKey, mon: string, c: Calendar): { specs: Spec[]; focus: string } {
  const prepMon = mondayOf(c.prepStart);
  const q = Math.max(0, Math.round(dayDiff(prepMon, mon) / 7));
  const totalBuild = Math.max(1, Math.round(dayDiff(prepMon, mondayOf(c.taperStart)) / 7) - 1);
  const t = q / totalBuild;
  const recovery = key !== 'affutage' && (q + 1) % 4 === 0;
  const f = recovery ? 0.65 : 1;

  if (key === 'affutage') {
    return {
      focus: 'Affûtage : moins de volume, un peu de rythme. Tu gardes la fraîcheur pour le jour J.',
      specs: [
        { sport: 'swim', title: 'Natation allure course', minutes: 45, intensity: 'modéré', details: '2 000 m : 400 m souples, 4 × 200 m à allure course, 20 s de repos, le reste facile.', mini: MINI.swim },
        { sport: 'bike', title: 'Vélo rappel', minutes: 60, intensity: 'modéré', details: '60 min dont 3 × 5 min à allure course. Vérifie ton vélo et ton ravitaillement.', mini: MINI.bike },
        { sport: 'run', title: 'Course rappel', minutes: 40, intensity: 'modéré', details: '40 min faciles dont 3 × 3 min à allure half, 2 min trot entre.', mini: MINI.run },
        { sport: 'bike', title: 'Sortie vélo tranquille', minutes: 90, intensity: 'facile', long: true, details: '1 h 30 en endurance, sans forcer. Teste ta tenue de course.', mini: MINI.bike },
        { sport: 'run', title: 'Course facile', minutes: 45, intensity: 'facile', long: true, details: '45 min tranquilles, juste pour le plaisir.', mini: MINI.run },
      ],
    };
  }

  const specs: Spec[] = [];
  let focus: string;
  if (key === 'base') {
    const swim = r100(lerp(1500, 2200, t * 2) * f);
    const longBike = r5(lerp(90, 120, t * 2) * f);
    const longRun = r5(lerp(50, 70, t * 2) * f);
    const run = r5(lerp(35, 45, t * 2) * f);
    focus = recovery ? 'Semaine de récupération : on lève le pied, c’est prévu.' : ['Base : du volume facile, beaucoup de facile.', 'Tu construis le moteur. Patience, ça paie.', 'Facile aujourd’hui, fort en juin.'][q % 3];
    specs.push(
      { sport: 'swim', title: 'Natation endurance', minutes: r5(swim / 1000 * 25 + 10), intensity: 'facile', details: `${fmtM(swim)} : 300 m d’échauffement, séries de 200 à 400 m en crawl régulier, 20 s de repos.`, mini: MINI.swim },
      { sport: 'bike', title: 'Vélo endurance', minutes: r5(60 * f), intensity: 'facile', details: `${fmtH(r5(60 * f))} en endurance, cadence souple.`, mini: MINI.bike },
      { sport: 'bike', title: 'Sortie longue vélo', minutes: longBike, intensity: 'facile', long: true, details: `${fmtH(longBike)} en endurance. Mange un peu toutes les 30 min, bois régulièrement.`, mini: MINI.bike },
      { sport: 'run', title: 'Course facile', minutes: run, intensity: 'facile', details: `${run} min en aisance respiratoire, puis 4 lignes droites de 20 s.`, mini: MINI.run },
      { sport: 'run', title: 'Sortie longue course', minutes: longRun, intensity: 'facile', long: true, details: `${fmtH(longRun)} très tranquille. Marcher 1 min toutes les 10 min, c’est une stratégie, pas un échec.`, mini: MINI.run },
      { sport: 'strength', title: 'Renfo', minutes: 25, intensity: 'facile', optional: true, details: '3 tours : squats, fentes, gainage, pompes, tirages élastique, ponts fessiers.', mini: MINI.strength },
    );
  } else if (key === 'construction') {
    const tb = lerp(0, 1, (t - 0.5) * 2);
    const swim = r100(lerp(2000, 2500, tb) * f);
    const longBike = r5(lerp(120, 165, tb) * f);
    const longRun = r5(lerp(70, 90, tb) * f);
    const brick = !recovery && q % 2 === 1;
    focus = recovery ? 'Semaine de récupération : on lève le pied, c’est prévu.' : ['Construction : un peu de rythme, beaucoup de régularité.', 'Tu enchaînes. Tu deviens triathlète.', 'Les séances dures sont courtes ; le reste reste facile.'][q % 3];
    specs.push(
      { sport: 'swim', title: 'Natation rythme', minutes: r5(swim / 1000 * 22 + 10), intensity: recovery ? 'facile' : 'modéré', details: `${fmtM(swim)} : 400 m souples, ${recovery ? '4' : '6'} × 200 m à allure course, 20 s de repos, le reste facile.`, mini: MINI.swim },
      { sport: 'bike', title: 'Vélo tempo', minutes: r5(75 * f), intensity: recovery ? 'facile' : 'modéré', details: recovery ? `${fmtH(r5(75 * f))} en endurance.` : '20 min d’échauffement, 3 × 12 min à allure half, 5 min faciles entre, retour au calme.', mini: MINI.bike },
      { sport: 'bike', title: brick ? 'Sortie longue + course' : 'Sortie longue vélo', minutes: longBike + (brick ? 15 : 0), intensity: 'facile', long: true, details: `${fmtH(longBike)} en endurance, les 20 dernières minutes à allure half.${brick ? ' Enchaîne 15 min de course facile.' : ''} Mange toutes les 30 min.`, mini: MINI.bike },
      { sport: 'run', title: 'Course tempo', minutes: r5(45 * f), intensity: recovery ? 'facile' : 'modéré', details: recovery ? `${r5(45 * f)} min faciles.` : '15 min faciles, 3 × 8 min à allure half, 2 min trot entre, 5 min au calme.', mini: MINI.run },
      { sport: 'run', title: 'Sortie longue course', minutes: longRun, intensity: 'facile', long: true, details: `${fmtH(longRun)} en aisance. Teste ce que tu mangeras le jour J.`, mini: MINI.run },
    );
    if (!recovery) specs.push({ sport: 'strength', title: 'Renfo', minutes: 25, intensity: 'facile', details: '3 tours : squats, fentes, gainage, pompes, tirages élastique, ponts fessiers.', mini: MINI.strength });
  } else {
    const ts = key === 'specifique' ? lerp(0, 1, (t - 0.75) * 4) : 1;
    const longBike = r5(lerp(150, 180, ts) * f);
    const longRun = r5(lerp(90, 105, ts) * f);
    focus = recovery ? 'Semaine de récupération : on lève le pied, c’est prévu.' : ['Spécifique : tu répètes la course, à ton allure.', 'Allure half, ravito, transitions : tu fignoles.', 'Presque au bout. On garde l’envie intacte.'][q % 3];
    specs.push(
      { sport: 'swim', title: 'Natation allure course', minutes: r5(65 * f), intensity: recovery ? 'facile' : 'modéré', details: `${fmtM(r100(2500 * f))} : 400 m souples, 3 × 500 m à allure course, 30 s de repos, le reste facile. En eau libre si possible.`, mini: MINI.swim },
      { sport: 'swim', title: 'Natation facile', minutes: 40, intensity: 'facile', optional: recovery, details: '1 800 m tranquilles, technique et respiration des deux côtés.', mini: MINI.swim },
      { sport: 'bike', title: 'Vélo tempo', minutes: r5(90 * f), intensity: recovery ? 'facile' : 'modéré', details: recovery ? `${fmtH(r5(90 * f))} en endurance.` : '20 min d’échauffement, 3 × 15 min à allure half, 5 min faciles entre.', mini: MINI.bike },
      { sport: 'bike', title: 'Enchaînement long', minutes: longBike + 20, intensity: recovery ? 'facile' : 'modéré', long: true, details: `${fmtH(longBike)} de vélo dont 1 h à allure half, puis 20 min de course à allure half. Ravito comme le jour J.`, mini: MINI.bike },
      { sport: 'run', title: 'Sortie longue course', minutes: longRun, intensity: 'facile', long: true, details: `${fmtH(longRun)} en aisance, les 15 dernières minutes à allure half si tout va bien.`, mini: MINI.run },
      { sport: 'run', title: 'Course facile', minutes: r5(40 * f), intensity: 'facile', details: `${r5(40 * f)} min faciles + 6 lignes droites de 20 s.`, mini: MINI.run },
    );
  }
  return { specs, focus };
}

function raceWeek(p: Profile, c: Calendar, basket: Set<number>): PlannedSession[] {
  const race = c.race;
  const plan: { off: number; spec: Spec }[] = [
    { off: -5, spec: { sport: 'swim', title: 'Natation activation', minutes: 30, intensity: 'facile', details: '1 200 m faciles dont 4 × 100 m à allure course.', mini: MINI.swim } },
    { off: -4, spec: { sport: 'bike', title: 'Vélo activation', minutes: 40, intensity: 'facile', details: '40 min faciles dont 3 × 3 min à allure course.', mini: MINI.bike } },
    { off: -3, spec: { sport: 'run', title: 'Course activation', minutes: 25, intensity: 'facile', details: '20 min faciles + 4 lignes droites. Tu sors en te sentant bien.', mini: MINI.run } },
    { off: -1, spec: { sport: 'bike', title: 'Déblocage', minutes: 30, intensity: 'facile', details: '20 min de vélo tranquille + 10 min de course très lente. Prépare ton sac, dors tôt.', mini: '10 min de vélo, c’est suffisant.' } },
    {
      off: 0,
      spec: {
        sport: 'other', title: `Jour J : ${p.raceName || 'Half Ironman'}`, minutes: 420, intensity: 'soutenu',
        details: '1,9 km de nage, 90 km de vélo, 21,1 km de course. Pars plus doucement que tu le crois, mange et bois toutes les 20 min sur le vélo. Souris à l’arrivée.',
      },
    },
  ];
  const out: PlannedSession[] = [];
  const raceMon = mondayOf(race);
  for (const { off, spec } of plan) {
    const date = addDays(race, off);
    // Stay inside the race week (a mid-week race would spill into the taper week and clash with its sessions).
    if (date < raceMon || date < c.prepStart || date < p.startDate) continue;
    if (off !== 0 && basket.has(weekday(date))) continue;
    out.push(toSession(date, spec));
  }
  return out;
}

// ---------- scheduling ----------

const PREF = [1, 3, 5, 6, 2, 4, 0];
const isHard = (s: Spec) => s.intensity !== 'facile';

function schedule(mon: string, specs: Spec[], available: number[], basket: Set<number>, allowDouble: boolean): PlannedSession[] {
  const avail = new Set(available);
  const byDay = new Map<number, Spec[]>();
  const afterBasket = (d: number) => basket.has((d + 6) % 7);
  const circ = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));

  const main = specs.filter((s) => !s.optional);
  const opt = specs.filter((s) => s.optional);
  // Longest first (weekend), then hard, then the rest.
  const order = [
    ...main.filter((s) => s.long).sort((a, b) => b.minutes - a.minutes),
    ...main.filter((s) => !s.long && isHard(s)),
    ...main.filter((s) => !s.long && !isHard(s)),
    ...opt,
  ];

  const score = (d: number) => {
    const occupied = [...byDay.keys(), ...basket];
    return occupied.length ? Math.min(...occupied.map((u) => circ(d, u))) : 7;
  };
  const neighbours = (d: number) => [...byDay.keys(), ...basket].filter((u) => circ(d, u) === 1).length;
  // Days already carrying load (hard or long session, or basket): hard sessions keep away from them.
  const heavyGap = (d: number) => {
    const heavy = [...basket, ...[...byDay.entries()].filter(([, xs]) => xs.some((x) => isHard(x) || x.long)).map(([k]) => k)];
    return heavy.length ? Math.min(...heavy.map((u) => circ(d, u))) : 7;
  };
  const pick = (cands: number[], hard = false) =>
    [...cands].sort((a, b) =>
      (hard ? heavyGap(b) - heavyGap(a) : 0) || score(b) - score(a) || neighbours(a) - neighbours(b) || PREF.indexOf(a) - PREF.indexOf(b),
    )[0];

  for (const orig of order) {
    const s = { ...orig };
    const free = [...avail].filter((d) => !byDay.has(d));
    const okHard = (d: number) => !isHard(s) || !afterBasket(d);
    let day: number | undefined;

    if (s.long) {
      const wk = [5, 6].filter((d) => free.includes(d) && okHard(d));
      if (wk.length) day = wk[0];
    }
    if (day === undefined) {
      const cands = free.filter(okHard);
      if (cands.length) day = pick(cands, isHard(s));
    }
    if (day === undefined && free.length) {
      day = pick(free);
      if (isHard(s) && afterBasket(day)) s.intensity = 'facile';
    }
    if (day === undefined) {
      // Double up (prépa only, required sessions, max 2 a day) on the lightest day without the same sport.
      if (!allowDouble || s.optional) continue;
      const cands = [...byDay.keys()].filter((d) => byDay.get(d)!.length < 2 && !byDay.get(d)!.some((x) => x.sport === s.sport) && (!isHard(s) || !afterBasket(d)));
      if (!cands.length) continue;
      day = cands.sort((a, b) => sum(byDay.get(a)!) - sum(byDay.get(b)!) || a - b)[0];
    }
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(s);
  }

  const out: PlannedSession[] = [];
  for (const d of [...byDay.keys()].sort((a, b) => a - b)) {
    for (const s of byDay.get(d)!) out.push(toSession(addDays(mon, d), s));
  }
  return out;
}

const sum = (xs: Spec[]) => xs.reduce((a, s) => a + s.minutes, 0);

function toSession(date: string, s: Spec): PlannedSession {
  const out: PlannedSession = {
    id: `${date}-${s.sport}`,
    date,
    sport: s.sport,
    title: s.title,
    minutes: s.minutes,
    intensity: s.intensity,
    details: s.details,
  };
  if (s.mini) out.mini = s.mini;
  if (s.optional) out.optional = true;
  return out;
}

// ---------- cycle-aware sessions ----------

const INTENSITY_RANK: Record<Intensity, number> = { facile: 0, 'modéré': 1, soutenu: 2 };

/**
 * Lower a session's intensity to `cap` when it is above it.
 * `reason` prefixes the note (e.g. "Phase lutéale", "Mode grossesse").
 */
export function adaptSession(
  s: PlannedSession,
  cap: Intensity,
  reason = 'Cette phase',
): { session: PlannedSession; note?: string } {
  if (INTENSITY_RANK[s.intensity] <= INTENSITY_RANK[cap]) return { session: s };
  return {
    session: { ...s, intensity: cap },
    note: `${reason} : garde-la tranquille, en endurance.`,
  };
}

/**
 * Cycle position on `date`. For future dates past the expected period, the
 * cycle is projected forward (estimate). Null when tracking is off, in
 * pregnancy mode, or when no period is logged.
 */
export function cycleForecast(date: string, p: Profile, days: Record<string, DayLog>): CycleInfo | null {
  const cs = cycleSettings(p);
  if (!cs.tracking || cs.pregnant) return null;
  let info = cycleOn(date, p, days);
  if (!info || info.phase !== 'retard' || date <= today()) return info;
  // Project: pretend the next periods started on time, a few cycles at most.
  let projected = days;
  for (let i = 0; i < 6 && info && info.phase === 'retard'; i++) {
    const start = info.nextPeriod;
    projected = { ...projected, [start]: { date: start, meals: [], workouts: [], cycle: { period: 'start' } } };
    info = cycleOn(date, p, projected);
  }
  return info;
}

/** Intensity ceiling for `date` from the cycle (or pregnancy), with the note prefix. */
export function sessionCapOn(date: string, p: Profile, days: Record<string, DayLog>): { cap: Intensity; reason?: string } {
  const cs = cycleSettings(p);
  if (cs.pregnant) return { cap: 'modéré', reason: 'Mode grossesse' };
  const info = cycleForecast(date, p, days);
  if (!info) return { cap: 'soutenu' };
  return { cap: adviceFor(info, p, date).intensityCap, reason: phaseLabel(info.phase) };
}

/** Planned sessions on `date`, adapted to the cycle cap. */
export function adaptedSessionsOn(date: string, p: Profile, days: Record<string, DayLog>): { session: PlannedSession; note?: string }[] {
  const { cap, reason } = sessionCapOn(date, p, days);
  return sessionsOn(date, p).map((s) => adaptSession(s, cap, reason));
}

/** Days of the week starting `weekStart` in follicular/fertile phase: good days for key sessions (estimate). */
export function goodDays(weekStart: string, p: Profile, days: Record<string, DayLog>): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const info = cycleForecast(d, p, days);
    if (info && (info.phase === 'folliculaire' || info.phase === 'fertile')) out.push(d);
  }
  return out;
}

// ---------- season ----------

function blocks(p: Profile, c: Calendar): SeasonBlock[] {
  const raw: SeasonBlock[] = [
    { name: 'Reprise', start: p.startDate, end: addDays(c.fondStart, -1), goal: 'Retrouver le plaisir de bouger, 3 petites séances par semaine.' },
    { name: 'Fondations', start: c.fondStart, end: addDays(c.consStart, -1), goal: 'Nager 800 à 1 000 m sans t’arrêter, courir 25 min en continu.' },
    { name: 'Consolidation', start: c.consStart, end: addDays(c.vacStart, -1), goal: '4 séances par semaine, premiers enchaînements vélo-course.' },
    { name: 'Maldives', start: c.vacStart, end: addDays(c.prepStart, -1), goal: 'Nager dans le lagon, marcher, profiter. Puis reprendre en douceur.' },
    { name: 'Base', start: c.baseStart, end: addDays(c.buildStart, -1), goal: 'Du volume facile : vélo jusqu’à 2 h, course jusqu’à 1 h 10.' },
    { name: 'Construction', start: c.buildStart, end: addDays(c.specStart, -1), goal: 'Allure half sur les trois sports, sorties longues qui grandissent.' },
    { name: 'Spécifique', start: c.specStart, end: addDays(c.taperStart, -1), goal: 'Répéter la course : vélo 3 h, course 1 h 45, nage 2 500 m.' },
    { name: 'Affûtage', start: c.taperStart, end: addDays(c.race, -1), goal: 'Moins de volume, un peu de rythme : arriver reposé·e.' },
    { name: 'Course', start: c.race, end: c.race, goal: '1,9 km · 90 km · 21,1 km. Profite de chaque kilomètre.' },
  ];
  return raw
    .map((b) => ({ ...b, start: maxD(b.start, p.startDate), end: minD(b.end, c.race) }))
    .filter((b) => b.start <= b.end);
}
