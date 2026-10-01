// "Mon reset du dimanche": 5 short guided steps in a sheet (progress dots, back / next),
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
import { h, openSheet, toast, iconCircle, ICON, SPORT_GLYPH } from '../lib/ui';
import { addDays, dayShort, fmtDayMonth, today } from '../lib/dates';
import { cycleSettings, phaseLabel } from '../lib/cycle';
import { adaptedSessionsOn, cycleForecast } from '../data/plan';
import { SUNDAY_RESET } from '../data/journey';
import { resetSunday, resetDone, resetWeek, saveResetStep, finishReset, besoinDe } from '../lib/journey';
import { energyBars, entryView } from './journey';

/** Open the reset of the week `sunday` belongs to (default: this week's / Monday → yesterday's). */
export function openSundayReset(date: string = today()) {
  const sunday = resetSunday(date);
  const saved = store.getDay(sunday).journeyReset ?? {};
  const steps = SUNDAY_RESET;
  const drafts = steps.map((st) => ({ chips: new Set(saved[st.key]?.chips ?? []), text: saved[st.key]?.text ?? '' }));
  let i = 0;
  const body = h('div', { class: 'stack sr-body' });

  const saveStep = (k: number) => {
    const st = steps[k];
    if (!st) return;
    saveResetStep(sunday, st.key, { chips: [...drafts[k].chips], text: drafts[k].text });
  };

  const paint = () => {
    const st = steps[i];
    const d = drafts[i];
    const dots = h('div', { class: 'sr-dots', 'aria-label': `Étape ${i + 1} sur ${steps.length}` },
      steps.map((_, k) => h('i', { class: k < i ? 'done' : k === i ? 'on' : '' })));
    const chips = st.chips?.length
      ? h('div', { class: 'jr-chips', role: 'group', 'aria-label': st.title },
          st.chips.map((c) => {
            const btn = h('button', {
              class: 'jr-chip' + (d.chips.has(c) ? ' on' : ''), type: 'button', 'aria-pressed': d.chips.has(c) ? 'true' : 'false',
              onclick: () => {
                if (d.chips.has(c)) d.chips.delete(c); else d.chips.add(c);
                const on = d.chips.has(c);
                btn.classList.toggle('on', on);
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
              },
            }, c);
            return btn;
          }))
      : null;
    const ta = h('textarea', {
      class: 'input jr-text', rows: i === 3 ? 4 : 3, 'aria-label': st.prompt,
      placeholder: i === 3 ? '1. …\n2. …\n3. …' : 'Quelques mots, si tu veux…',
      value: d.text, oninput: (e: Event) => { d.text = (e.target as HTMLTextAreaElement).value; },
    });
    const last = i === steps.length - 1;
    body.replaceChildren(...[
      h('div', { class: 'sr-top' }, dots, h('span', { class: 'small muted num' }, `Étape ${i + 1}/${steps.length}`)),
      h('h3', { class: 'jr-title' }, st.title),
      h('p', { class: 'jr-q' }, st.prompt),
      i === 0 ? reviewBlock(sunday) : null,
      i === 2 ? weekAheadBlock(sunday) : null,
      chips,
      ta,
      h('div', { class: 'sr-nav' },
        i > 0
          ? h('button', { class: 'btn', type: 'button', onclick: () => { saveStep(i); i--; paint(); } }, 'Retour')
          : h('span'),
        h('button', {
          class: 'btn primary', type: 'button',
          onclick: () => {
            saveStep(i);
            if (last) {
              finishReset(sunday);
              sheet.close();
              toast('Ton reset est fait. Belle semaine à toi.');
              return;
            }
            i++;
            paint();
          },
        }, last ? 'Terminer' : 'Suivant'),
      ),
    ].filter((x): x is HTMLElement => !!x));
    body.closest('.sheet-body')?.scrollTo({ top: 0 });
  };
  paint();
  const sheet = openSheet(`Mon reset · semaine du ${fmtDayMonth(addDays(sunday, -6))}`, body);
}

/** Step 1: energy & needs of the week, days réussies, 3 highlights. */
function reviewBlock(sunday: string): HTMLElement {
  const w = resetWeek(sunday);
  const letters = w.dates.map((d) => dayShort(d).charAt(0).toUpperCase());
  return h('div', { class: 'stack sr-review', style: 'gap:10px' },
    w.journeyDays
      ? h('p', { class: 'small' }, `${w.success} jour${w.success > 1 ? 's' : ''} réussi${w.success > 1 ? 's' : ''} sur ${w.journeyDays}. Chacun compte.`)
      : h('p', { class: 'small muted' }, 'Pas encore de jour du parcours cette semaine.'),
    w.energy.some((v) => v !== null)
      ? h('div', { class: 'stack', style: 'gap:4px' }, h('span', { class: 'eyebrow' }, 'Ton énergie'), energyBars(w.energy, letters))
      : null,
    w.needs.length
      ? h('div', { class: 'stack', style: 'gap:6px' },
          h('span', { class: 'eyebrow' }, 'Tes besoins'),
          h('div', { class: 'jr-chips' }, w.needs.slice(0, 5).map((x) => h('span', { class: 'jr-chip static' }, `${x.label} · ${x.count}`))),
          w.needs[0].count >= 3 ? h('p', { class: 'small' }, `Tu as noté ${w.needs[0].count} fois ${besoinDe(w.needs[0].key)}. On en tient compte pour la semaine qui vient ?`) : null)
      : null,
    w.highlights.length
      ? h('div', { class: 'stack', style: 'gap:8px' }, h('span', { class: 'eyebrow' }, 'Tes pages de la semaine'), w.highlights.map(entryView))
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
      sessions.length ? iconCircle(glyph) : iconCircle(ICON.leaf),
      h('span', { class: 'sr-day-main' },
        h('span', { class: 'sr-day-s' }, sessions.length ? sessions.join(' · ') : 'Repos'),
        phase ? h('span', { class: 'sr-day-ph' }, phase) : null),
    );
  });
  return h('div', { class: 'stack', style: 'gap:6px' },
    h('span', { class: 'eyebrow' }, cs.pregnant ? 'Ta semaine' : 'Ta semaine (phases estimées)'),
    h('div', { class: 'sr-week' }, rows),
  );
}

/** Today card (CE SOIR on Sunday from 17 h, CE MATIN on Monday while not done). */
export function sundayResetCard(date: string, monday = false): HTMLElement {
  const sunday = resetSunday(date);
  return h('section', { class: 'card ux solo jr-card sr-card paper', 'aria-label': 'Ton reset du dimanche' },
    h('span', { class: 'eyebrow' }, monday ? 'Reset de la semaine' : 'Reset du dimanche'),
    h('h3', { class: 'jr-title' }, monday ? 'On prépare ta semaine ?' : 'Ton moment du dimanche'),
    h('p', { class: 'small' }, '5 petites étapes : relire ta semaine, ce qui t’a fait du bien, préparer la suivante, alléger ta charge mentale, un plaisir prévu.'),
    h('button', { class: 'btn primary block', type: 'button', onclick: () => openSundayReset(date) }, resetDone(sunday) ? 'Revoir mon reset' : 'Faire mon reset'),
  );
}
