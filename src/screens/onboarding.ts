// First-run sheet ("Bienvenue") and the profile editor ("Profil"). Same form, the editor adds the timeline
// and the pregnancy mode. Welcome fields start empty (placeholders only): nothing personal is baked in.

import type { CycleSettings, Profile, Sex } from '../types';
import { store } from '../store';
import { h, field, openSheet, parseNum, segmented, fmtKg } from '../lib/ui';
import { addDays, daysBetween, today } from '../lib/dates';
import { DEFAULT_CYCLE, PREGNANCY_NOTE, cycleSettings, periodStarts } from '../lib/cycle';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const ACTIVITY: { value: string; label: string }[] = [
  { value: '1.2', label: 'Plutôt assis·e' },
  { value: '1.3', label: 'Un peu actif·ve' },
  { value: '1.45', label: 'Debout souvent' },
];

/** Closest activity option to a stored factor. */
function activityKey(a: number): string {
  let best = ACTIVITY[0].value;
  for (const o of ACTIVITY) if (Math.abs(Number(o.value) - a) < Math.abs(Number(best) - a)) best = o.value;
  return best;
}

const num = (value: number | null | undefined, placeholder: string, decimal = true) =>
  h('input', {
    type: 'text',
    inputMode: decimal ? 'decimal' : 'numeric',
    autocomplete: 'off',
    placeholder,
    value: value === null || value === undefined ? '' : String(value).replace('.', ','),
  });

const date = (value: string, max?: string) => h('input', { type: 'date', value, max });

/** Labelled on/off switch (native checkbox). Shared with the Plus screen. */
export function toggleRow(label: string, checked: boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement {
  const input = h('input', { type: 'checkbox', class: 'ob-switch', checked });
  // Blur first: the app defers re-renders while an input has focus.
  input.addEventListener('change', () => { input.blur(); onChange(input.checked); });
  return h('label', { class: 'ob-toggle' },
    h('span', { class: 'ob-toggle-text' }, h('span', null, label), hint ? h('span', { class: 'field-hint' }, hint) : null),
    input,
  );
}

/** Live pace note: kg to the milestone over the weeks left. */
export function paceNote(current: number | undefined, goal: number | undefined, from: string, to: string): string {
  if (current === undefined || goal === undefined || !from || !to) return '';
  const kg = current - goal;
  if (kg <= 0) return 'Palier déjà atteint sur le papier. On pourra viser le maintien, ou l’objectif final.';
  const weeks = daysBetween(from, to) / 7;
  if (weeks <= 0) return 'La date du palier doit être après le début du plan.';
  const perWeek = kg / weeks;
  const base = `${fmtKg(kg)} kg en ${fmtKg(weeks)} semaines, soit ${fmtKg(perWeek)} kg par semaine.`;
  if (perWeek > 1) {
    return `${base} C’est au-dessus de 1 kg par semaine. L’app ne descendra pas les calories sous ton plancher : on vise ce qui est tenable, et le palier peut glisser un peu, sans souci.`;
  }
  if (perWeek >= 0.8) return `${base} Ambitieux : le reste viendra du mouvement (pas, basket, séances).`;
  return `${base} C’est un rythme raisonnable.`;
}

function openForm(mode: 'welcome' | 'profile'): void {
  const p: Profile = store.profile;
  const fresh = mode === 'welcome' && !p.onboarded;
  const t = today();
  let sex: Sex | null = p.sex;
  let activity = activityKey(p.activity);
  const basket = new Set<number>(p.basketDays);
  const cs: CycleSettings = cycleSettings(p);
  let tracking = cs.tracking;
  let ttc = cs.ttc;
  let pregnant = cs.pregnant;

  const hasWeights = store.weights().length > 0;
  const currentW = hasWeights ? store.weightOn(t) : undefined;

  const age = num(fresh ? null : p.age, 'ex. 35', false);
  const height = num(fresh ? null : p.heightCm, 'ex. 165');
  // Welcome: "poids actuel" (becomes the start weight). Profile: the plan's start weight.
  const startW = num(fresh ? null : mode === 'welcome' ? currentW ?? p.startWeight : p.startWeight, 'ex. 68,5');
  const goalW = num(fresh ? null : p.goalWeight, 'ex. 64');
  const finalW = num(fresh ? null : p.finalGoalWeight, 'ex. 60');
  const goalDate = date(p.goalDate);
  const startDate = date(p.startDate);
  const lavageEnd = date(p.lavageEnd);
  const vacStart = date(p.vacationStart);
  const vacEnd = date(p.vacationEnd);
  const prepStart = date(p.prepStart);
  const raceDate = date(p.raceDate);
  const raceName = h('input', { type: 'text', value: p.raceName });

  // Cycle inputs.
  const starts = periodStarts(store.state.days);
  const lastPeriod = date(starts[starts.length - 1] ?? '', t);
  const cycleLen = num(cs.avgLength, '28', false);

  // Sex segmented (rebuilt in place on change).
  const sexSlot = h('div');
  const renderSex = () =>
    sexSlot.replaceChildren(
      segmented<string>(
        [{ value: 'f', label: 'Femme' }, { value: 'm', label: 'Homme' }],
        sex ?? '',
        (v) => { sex = v as Sex; renderSex(); renderCycle(); },
      ),
    );

  const actSlot = h('div');
  const renderAct = () =>
    actSlot.replaceChildren(segmented<string>(ACTIVITY, activity, (v) => { activity = v; renderAct(); }));
  renderAct();

  const daysSlot = h('div', { class: 'ob-days' });
  const renderDays = () =>
    daysSlot.replaceChildren(
      ...DAY_LABELS.map((label, i) =>
        h('button', {
          type: 'button',
          class: 'ob-day' + (basket.has(i) ? ' on' : ''),
          'aria-pressed': basket.has(i) ? 'true' : 'false',
          onclick: () => { basket.has(i) ? basket.delete(i) : basket.add(i); renderDays(); },
        }, label),
      ),
    );
  renderDays();

  // Cycle section, only for women.
  const cycleSlot = h('div');
  const renderCycle = () => {
    if (sex !== 'f') { cycleSlot.replaceChildren(); return; }
    cycleSlot.replaceChildren(h('div', { class: 'stack' },
      h('h3', null, 'Cycle'),
      toggleRow('Suivre mon cycle', tracking, (v) => { tracking = v; renderCycle(); },
        'Pour adapter le sport, la faim et lire la balance sans stress.'),
      tracking
        ? [
            h('div', { class: 'grid-2' },
              field('Dernières règles', lastPeriod, '1er jour'),
              field('Durée habituelle (j)', cycleLen, 'entre 21 et 35 j est courant'),
            ),
            toggleRow('Essai bébé', ttc, (v) => { ttc = v; },
              'Déficit plus doux, fenêtre fertile mise en avant.'),
          ]
        : null,
      mode === 'profile'
        ? [
            toggleRow('Mode grossesse', pregnant, (v) => { pregnant = v; renderCycle(); }, 'Plus de déficit : on mange à l’équilibre.'),
            pregnant ? h('p', { class: 'small muted' }, PREGNANCY_NOTE) : null,
          ]
        : null,
    ));
  };
  renderSex();
  renderCycle();

  const note = h('p', { class: 'small muted' });
  const updateNote = () => {
    // Pace from today's weight (or the start) to the milestone.
    const from = startDate.value && startDate.value > t ? startDate.value : t;
    const cur = mode === 'profile' && currentW !== undefined ? currentW : parseNum(startW.value);
    note.textContent = paceNote(cur, parseNum(goalW.value), from, goalDate.value);
  };
  for (const el of [startW, goalW, startDate, goalDate]) el.addEventListener('input', updateNote);
  updateNote();

  const error = h('p', { class: 'small tone-bad', role: 'alert' });

  const save = () => {
    const a = parseNum(age.value);
    const hc = parseNum(height.value);
    const sw = parseNum(startW.value);
    const gw = parseNum(goalW.value);
    const fw = parseNum(finalW.value);
    const len = parseNum(cycleLen.value);
    if (a !== undefined && (a < 14 || a > 99)) return void (error.textContent = 'Ton âge semble bizarre, vérifie-le.');
    if (hc === undefined || hc < 120 || hc > 220) return void (error.textContent = 'Indique ta taille en cm (ex. 165).');
    if (sw === undefined || sw < 35 || sw > 250) return void (error.textContent = 'Indique ton poids en kg (ex. 68,5).');
    if (gw === undefined || gw < 35 || gw > 250) return void (error.textContent = 'Indique ton palier en kg.');
    if (fw !== undefined && (fw < 35 || fw > gw)) return void (error.textContent = 'L’objectif final se place au niveau du palier ou en dessous.');
    if (!startDate.value || !goalDate.value) return void (error.textContent = 'Il manque une date.');
    if (goalDate.value <= startDate.value) return void (error.textContent = 'La date du palier doit être après le début du plan.');
    if (sex === 'f' && tracking && len !== undefined && (len < 18 || len > 45)) {
      return void (error.textContent = 'La durée du cycle semble inhabituelle, vérifie-la (souvent entre 21 et 35 j).');
    }
    if (lastPeriod.value && lastPeriod.value > t) return void (error.textContent = 'La date des dernières règles est dans le futur.');

    const cycle: CycleSettings = {
      ...DEFAULT_CYCLE,
      ...(p.cycle ?? {}),
      tracking: sex === 'f' && tracking,
      ttc: sex === 'f' && ttc,
      pregnant: sex === 'f' && pregnant,
      avgLength: len !== undefined ? Math.round(len) : cs.avgLength,
    };
    if (cycle.pregnant && !cycle.pregnantSince) cycle.pregnantSince = t;
    if (!cycle.pregnant) delete cycle.pregnantSince;

    const patch: Partial<Profile> = {
      sex,
      age: a === undefined ? null : Math.round(a),
      heightCm: Math.round(hc),
      startWeight: Math.round(sw * 10) / 10,
      goalWeight: Math.round(gw * 10) / 10,
      finalGoalWeight: fw === undefined ? undefined : Math.round(fw * 10) / 10,
      startDate: startDate.value,
      goalDate: goalDate.value,
      activity: Number(activity),
      basketDays: [...basket].sort((x, y) => x - y),
      cycle,
      onboarded: true,
    };
    if (mode === 'profile') {
      const dates = { lavageEnd, vacationStart: vacStart, vacationEnd: vacEnd, prepStart, raceDate };
      for (const [k, el] of Object.entries(dates)) {
        if (!el.value) return void (error.textContent = 'Il manque une date.');
        (patch as Record<string, unknown>)[k] = el.value;
      }
      if (!(startDate.value <= lavageEnd.value && lavageEnd.value < vacStart.value && vacStart.value <= vacEnd.value && vacEnd.value < prepStart.value && prepStart.value < raceDate.value)) {
        return void (error.textContent = 'Les dates doivent se suivre : départ, fin du lavage, vacances, prépa, course.');
      }
      patch.raceName = raceName.value.trim() || 'Half Ironman';
    } else if (startDate.value > p.lavageEnd) {
      // Welcome form has no timeline fields: a later start moves the 3-week lavage with it.
      const lavEnd = addDays(startDate.value, 20);
      patch.lavageEnd = lavEnd < goalDate.value ? lavEnd : addDays(goalDate.value, -1);
    }
    error.textContent = '';
    sheet.close();
    const period = sex === 'f' && tracking ? lastPeriod.value : '';
    const logToday = mode === 'welcome' && store.getDay(t).weight === undefined;
    void (async () => {
      await store.saveProfile(patch);
      // "Poids actuel" at first run doubles as today's weigh-in.
      if (logToday) await store.updateDay(t, (d) => { d.weight = Math.round(sw * 10) / 10; });
      if (period && store.getDay(period).cycle?.period !== 'start') {
        await store.updateDay(period, (d) => { d.cycle = { ...(d.cycle ?? {}), period: 'start' }; });
      }
    })();
  };

  const form = h('div', { class: 'stack' },
    mode === 'welcome'
      ? h('p', { class: 'muted' }, 'Quelques infos pour caler tes repères. Tout reste modifiable dans Plus.')
      : null,
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Sexe'),
      sexSlot,
      h('span', { class: 'field-hint' }, 'Sert au calcul des calories (formule Mifflin-St Jeor) et au suivi du cycle.'),
    ),
    h('div', { class: 'grid-2' },
      field('Âge', age),
      field('Taille (cm)', height),
    ),
    h('div', { class: 'grid-2' },
      field(mode === 'welcome' ? 'Poids actuel (kg)' : 'Poids de départ (kg)', startW),
      field('Début du plan', startDate),
    ),
    h('div', { class: 'grid-2' },
      field('Palier avant les vacances (kg)', goalW),
      field('Date du palier', goalDate),
    ),
    note,
    field('Objectif final (kg)', finalW, 'Après les vacances, tranquillement (environ 0,5 kg par semaine).'),
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Jours de basket'),
      daysSlot,
    ),
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Activité hors sport'),
      actSlot,
    ),
    cycleSlot,
    mode === 'profile'
      ? [
          h('h3', null, 'Calendrier'),
          h('div', { class: 'grid-2' },
            field('Fin du lavage', lavageEnd),
            field('Début prépa half', prepStart),
          ),
          h('div', { class: 'grid-2' },
            field('Début vacances', vacStart),
            field('Fin vacances', vacEnd),
          ),
          h('div', { class: 'grid-2' },
            field('Date de la course', raceDate),
            field('Nom de la course', raceName),
          ),
        ]
      : null,
    error,
    h('button', { type: 'button', class: 'btn primary block', onclick: save }, mode === 'welcome' ? 'C’est parti' : 'Enregistrer'),
  );

  const sheet = openSheet(mode === 'welcome' ? 'Bienvenue' : 'Profil', form);
}

/** First-run sheet: sex, age, height, current weight, milestone + final goal, basket days, cycle. */
export function openOnboarding(): void {
  openForm('welcome');
}

/** Same form titled "Profil", plus the timeline dates, race name and pregnancy mode. */
export function openProfileEditor(): void {
  openForm('profile');
}
