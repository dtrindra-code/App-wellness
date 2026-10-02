// "Mon reset du dimanche": 5 short guided steps in the journal page template (ink cover
// with 5 step dots, cream page, "Retour" / "Suivant", "Garder mon reset"),
// saved per week in the Sunday's DayLog.journeyReset (so export and backup carry it).
//   1 relire ta semaine (energy & needs, days réussies, 3 highlights)
//   2 ce qui t'a fait du bien / ce qui t'a vidée
//   3 préparer la semaine (cycle phases + planned sessions, 1 intention)
//   4 charge mentale : 3 choses à lâcher ou déléguer
//   5 un petit plaisir planifié
// Steps come from data/journey SUNDAY_RESET (key, title, prompt, chips); this file adds
// the computed parts of steps 1 and 3. Shown on Today on Sunday from 17 h and Monday
// morning while not done; openable any day from Équilibre.

import { store } from '../store';
import { h, toast, disclosure, SPORT_GLYPH } from '../lib/ui';
import { addDays, dayShort, fmtDayMonth, today } from '../lib/dates';
import { cycleSettings, phaseLabel } from '../lib/cycle';
import { adaptedSessionsOn, cycleForecast } from '../data/plan';
import { SUNDAY_RESET } from '../data/journey';
import { resetSunday, resetWeek, saveResetStep, finishReset, besoinDe } from '../lib/journey';
import { energyBars, entryView } from './journey';
import { openJournalPage, stepPath, whisper } from './journal-shell';
import { jnChips, savingTextarea } from './journal-page';

/** Open the reset of the week `sunday` belongs to (default: this week's / Monday → yesterday's). */
export function openSundayReset(date: string = today()) {
  const sunday = resetSunday(date);
  const saved = store.getDay(sunday).journeyReset ?? {};
  const steps = SUNDAY_RESET;
  const drafts = steps.map((st) => ({ chips: new Set(saved[st.key]?.chips ?? []), text: saved[st.key]?.text ?? '' }));
  let i = 0;

  const saveStep = (k: number) => {
    const st = steps[k];
    if (!st) return;
    saveResetStep(sunday, st.key, { chips: [...drafts[k].chips], text: drafts[k].text });
  };
  const blur = () => (document.activeElement as HTMLElement | null)?.blur();
  const go = (n: number) => { blur(); saveStep(i); i = n; paint(); page.toTop(); };

  const paint = () => {
    const st = steps[i];
    const d = drafts[i];
    const last = i === steps.length - 1;
    const ta = savingTextarea({
      value: d.text, label: st.prompt, rows: i === 3 ? 4 : 3, cls: i === 3 ? '' : 'short',
      placeholder: i === 3 ? '1. …\n2. …\n3. …' : 'Quelques mots, si tu veux…',
      save: (v) => { d.text = v; },
    });
    // Keep the draft in sync while typing too (the step is saved on Suivant / Retour).
    ta.addEventListener('input', () => { d.text = ta.value; });
    page.update({
      path: stepPath(i, steps.length),
      meta: [`Étape ${i + 1}/${steps.length}`, '5 min'],
      body: [
        h('h2', { class: 'jn-theme' }, st.title),
        h('p', { class: 'jn-q' }, st.prompt),
        i === 0 ? reviewBlock(sunday) : null,
        i === 2 ? weekAheadBlock(sunday) : null,
        st.chips?.length ? jnChips(st.chips, (c) => d.chips.has(c), (c, on) => { if (on) d.chips.add(c); else d.chips.delete(c); }, st.title) : null,
        ta,
        last ? whisper('Un plaisir prévu compte autant qu’un rendez-vous.') : null,
      ],
      primary: last
        ? {
            label: 'Garder mon reset',
            run: () => {
              blur();
              saveStep(i);
              finishReset(sunday);
              toast('Ton reset est gardé. Belle semaine à toi.');
              void page.celebrate().then(() => page.close());
            },
          }
        : { label: 'Suivant', run: () => go(i + 1) },
      secondary: i > 0 ? { label: 'Retour', run: () => go(i - 1) } : { label: 'Plus tard', run: () => { blur(); saveStep(i); page.close(); } },
    });
  };

  const page = openJournalPage({
    eyebrow: 'Revenir à moi · Reset du dimanche',
    title: 'Mon reset',
    sub: `Semaine du ${fmtDayMonth(addDays(sunday, -6))}`,
    path: stepPath(0, steps.length),
    body: [],
    onClose: () => { blur(); saveStep(i); },
  });
  paint();
}

/** Step 1: one summary line, energy bars, top needs, and the week's pages folded. */
function reviewBlock(sunday: string): HTMLElement {
  const w = resetWeek(sunday);
  const letters = w.dates.map((d) => dayShort(d).charAt(0).toUpperCase());
  return h('div', { class: 'sr-review' },
    w.journeyDays
      ? h('p', { class: 'jn-text' }, `${w.success} jour${w.success > 1 ? 's' : ''} en fleur sur ${w.journeyDays}. Chacun compte.`)
      : h('p', { class: 'jn-text' }, 'Pas encore de jour du parcours cette semaine.'),
    w.energy.some((v) => v !== null)
      ? h('div', { class: 'sr-sub' }, h('span', { class: 'jn-meta-l' }, 'Ton énergie'), energyBars(w.energy, letters))
      : null,
    w.needs.length
      ? h('div', { class: 'sr-sub' },
          h('span', { class: 'jn-meta-l' }, 'Tes besoins'),
          h('p', { class: 'jn-text' }, w.needs.slice(0, 3).map((x) => `${x.label} ×${x.count}`).join(' · ')),
          w.needs[0].count >= 3 ? h('p', { class: 'jn-text' }, `Tu as noté ${w.needs[0].count} fois ${besoinDe(w.needs[0].key)}. On en tient compte pour la semaine qui vient ?`) : null)
      : null,
    w.highlights.length
      ? disclosure(`Relire mes ${w.highlights.length} page${w.highlights.length > 1 ? 's' : ''}`, () => h('div', { class: 'jr-pages' }, w.highlights.map(entryView)), `sr-pages-${sunday}`, 'Replier mes pages')
      : null,
  );
}

/** Step 3: the next 7 days, cycle phase (estimate) and planned sessions. */
function weekAheadBlock(sunday: string): HTMLElement {
  const p = store.profile;
  const days = store.state.days;
  const cs = cycleSettings(p);
  const start = addDays(sunday, 1);
  const rows = Array.from({ length: 7 }, (_, k) => {
    const d = addDays(start, k);
    let phase: string | null = null;
    if (cs.tracking && !cs.pregnant) {
      try { const info = cycleForecast(d, p, days); phase = info ? phaseLabel(info.phase) : null; } catch { phase = null; }
    }
    let sessions: string[] = [];
    let glyph = '··';
    try {
      const list = adaptedSessionsOn(d, p, days).filter((a) => !a.session.optional).map((a) => a.session);
      sessions = list.map((s) => `${s.title} ${s.minutes} min`);
      if (list[0]) glyph = SPORT_GLYPH[list[0].sport] ?? '··';
    } catch { sessions = []; }
    if (p.basketDays.includes(k)) { sessions.push('Basket'); if (glyph === '··') glyph = SPORT_GLYPH.basket ?? '··'; }
    return h('div', { class: 'sr-day' },
      h('span', { class: 'sr-day-name' }, `${dayShort(d)} ${fmtDayMonth(d).split(' ')[0]}`),
      h('span', { class: 'sr-day-g', 'aria-hidden': 'true' }, sessions.length ? glyph : '·'),
      h('span', { class: 'sr-day-main' },
        h('span', { class: 'sr-day-s' }, sessions.length ? sessions.join(' · ') : 'Repos'),
        phase ? h('span', { class: 'sr-day-ph' }, phase) : null),
    );
  });
  return h('div', { class: 'sr-sub' },
    h('span', { class: 'jn-meta-l' }, cs.pregnant ? 'Ta semaine' : 'Ta semaine (phases estimées)'),
    h('div', { class: 'sr-week' }, rows),
  );
}

/** @deprecated The ink entry card (journey.ts journeyEntryCard) opens the reset on Today. */
export function sundayResetCard(_date: string, _monday = false): HTMLElement | null {
  return null;
}
