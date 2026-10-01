// Checkpoints of the journal, as multi-step journal pages (journal-shell template):
//   day 0 "Mon point de départ" (3 scales, life wheel, what she hopes / leaves behind /
//   wants to cultivate, her intention sentence, 3 values),
//   day 30 "Premier regard en arrière" and day 60 "Ajustements et découvertes"
//   (scales next to the day-0 values, wheel over the day-0 one, back to the intention,
//   the content's questions, "Mon plus grand apprentissage").
// Day 60 ends with a recap (stats, wheel before / after, a letter to herself).
// Everything is saved as she goes in Profile.journey.checkpoints.

import { store } from '../store';
import { h, toast, starSticker } from '../lib/ui';
import { CHECKPOINTS, VALUES } from '../data/journey';
import type { Checkpoint, CheckpointField } from '../data/journey';
import type { CheckpointKey, JourneyCheckpoint } from '../types';
import {
  checkpointData, saveCheckpoint, journeyOf, journeyStats, wheelValues, wheelsNowAndStart, checkpointDone,
} from '../lib/journey';
import { today } from '../lib/dates';
import { quotePage } from './journal-science';
import { wheelEditor, wheelCompare } from './journal-wheel';
import { savingTextarea, jnChips } from './journal-page';
import { openJournalPage, stepPath, whisper } from './journal-shell';

type ScaleKey = 'energy' | 'stress' | 'satisfaction';

const kids = (...xs: (Node | null | undefined | false)[]): Node[] => xs.filter((x): x is Node => !!x);
const keyOf = (c: Checkpoint) => String(c.day) as CheckpointKey;

function stepsOf(c: Checkpoint): CheckpointField[][] {
  const scales = c.fields.filter((f) => f.kind === 'scale');
  const rest = c.fields.filter((f) => f.kind !== 'scale');
  const out: CheckpointField[][] = [];
  if (scales.length) out.push(scales);
  let group: CheckpointField[] = [];
  for (const f of rest) {
    if (f.kind === 'wheel' || f.kind === 'values') {
      if (group.length) { out.push(group); group = []; }
      out.push([f]);
    } else {
      group.push(f);
      if (group.length === 2) { out.push(group); group = []; }
    }
  }
  if (group.length) out.push(group);
  return out;
}

// ---------- fields ----------

function scaleField(c: Checkpoint, f: Extract<CheckpointField, { kind: 'scale' }>): HTMLElement {
  const key = keyOf(c);
  const cur = checkpointData(key)[f.key as ScaleKey];
  const base = key === '0' ? undefined : checkpointData('0')[f.key as ScaleKey];
  const out = h('output', { class: 'jc-scale-v num' }, typeof cur === 'number' ? String(cur) : '–');
  const range = h('input', {
    class: 'jc-range' + (typeof cur === 'number' ? '' : ' unset'), type: 'range', min: 0, max: 10, step: 1, value: String(cur ?? 5),
    'aria-label': `${f.label}, de 0 (${f.low}) à 10 (${f.high})`,
    'aria-valuetext': typeof cur === 'number' ? `${cur} sur 10` : 'pas encore noté',
    oninput: () => { out.textContent = range.value; range.classList.remove('unset'); range.setAttribute('aria-valuetext', `${range.value} sur 10`); },
    onchange: () => saveCheckpoint(key, { [f.key]: Number(range.value) } as Partial<JourneyCheckpoint>),
  });
  return h('div', { class: 'jc-scale' },
    h('div', { class: 'jc-scale-head' },
      h('span', { class: 'jc-scale-l' }, f.label),
      typeof base === 'number' ? h('span', { class: 'jc-base' }, 'jour 0 : ', h('b', { class: 'num' }, String(base))) : null,
      out),
    range,
    h('div', { class: 'jc-scale-ends' }, h('span', null, `0 · ${f.low}`), h('span', null, `${f.high} · 10`)),
  );
}

function wheelField(c: Checkpoint, f: Extract<CheckpointField, { kind: 'wheel' }>): HTMLElement {
  const key = keyOf(c);
  const base = key === '0' ? null : wheelValues(checkpointData('0').wheel);
  return h('div', { class: 'jc-field' },
    h('p', { class: 'jn-text' }, f.hint),
    wheelEditor(wheelValues(checkpointData(key).wheel), (next) => saveCheckpoint(key, { wheel: next }), base && Object.keys(base).length ? base : null),
  );
}

function valuesField(c: Checkpoint, f: Extract<CheckpointField, { kind: 'values' }>): HTMLElement {
  const key = keyOf(c);
  const picked = new Set(checkpointData(key).values ?? []);
  const count = h('p', { class: 'jc-count' });
  const paintCount = () => { count.textContent = `${picked.size}/${f.pick} choisie${picked.size > 1 ? 's' : ''}`; };
  paintCount();
  const chips = jnChips(VALUES, (v) => picked.has(v), (v, on) => {
    if (on && picked.size >= f.pick) {
      // Undo the visual toggle: the limit is reached.
      const btn = [...chips.querySelectorAll<HTMLButtonElement>('.jn-chip')].find((b) => b.textContent === v);
      btn?.classList.remove('on'); btn?.setAttribute('aria-pressed', 'false');
      toast(`${f.pick} valeurs au plus : garde l’essentiel`);
      return;
    }
    if (on) picked.add(v); else picked.delete(v);
    saveCheckpoint(key, { values: [...picked] });
    paintCount();
  }, f.label);
  return h('div', { class: 'jc-field' }, h('p', { class: 'jn-q' }, f.q), count, chips);
}

function textValue(key: CheckpointKey, fieldKey: string): string {
  const d = checkpointData(key);
  if (key === '0' && fieldKey === 'intention') return d.intention ?? '';
  return d.answers?.[fieldKey] ?? '';
}

function saveText(key: CheckpointKey, fieldKey: string, v: string) {
  if (key === '0' && fieldKey === 'intention') saveCheckpoint(key, { intention: v.trim() ? v.trim() : undefined });
  else saveCheckpoint(key, { answers: { [fieldKey]: v } });
}

function echo(label: string, text: string): HTMLElement {
  return h('div', { class: 'jc-echo' }, h('span', { class: 'jn-meta-l' }, label), h('span', { class: 'jc-echo-t' }, text));
}

/** Reminder of day 0 next to a day-30/60 question. */
function day0Echo(key: CheckpointKey, fieldKey: string): HTMLElement | null {
  if (key === '0') return null;
  const d0 = checkpointData('0');
  if (fieldKey === 'intentionBack' && d0.intention) return echo('Ton intention du jour 0', d0.intention);
  if (fieldKey === 'values') {
    const parts = [
      d0.values?.length ? echo('Tes valeurs du jour 0', d0.values.join(' · ')) : null,
      d0.answers?.cultivate ? echo('Ce que tu voulais cultiver', d0.answers.cultivate) : null,
    ].filter((x): x is HTMLElement => !!x);
    return parts.length ? h('div', { class: 'jc-echoes' }, parts) : null;
  }
  return null;
}

function textField(c: Checkpoint, f: Extract<CheckpointField, { kind: 'text' }>): HTMLElement {
  const key = keyOf(c);
  const ta = savingTextarea({ value: textValue(key, f.key), label: f.q, rows: 3, cls: 'short', save: (v) => saveText(key, f.key, v) });
  const has = (ch: string) => ta.value.toLowerCase().includes(ch.toLowerCase());
  return h('div', { class: 'jc-field' },
    h('span', { class: 'jn-meta-l jc-label' }, f.label),
    day0Echo(key, f.key),
    h('p', { class: 'jn-q' }, f.q),
    f.chips?.length
      ? jnChips(f.chips, has, (ch, on) => {
          const cur = ta.value.trim();
          if (on && !has(ch)) ta.value = cur ? `${cur} · ${ch}` : ch;
          else if (!on) ta.value = cur.split(' · ').filter((x) => x.toLowerCase() !== ch.toLowerCase()).join(' · ');
          ta.dispatchEvent(new Event('input'));
          saveText(key, f.key, ta.value);
        }, 'Idées (facultatif)')
      : null,
    ta,
  );
}

function choiceField(c: Checkpoint, f: Extract<CheckpointField, { kind: 'choice' }>): HTMLElement {
  const key = keyOf(c);
  const wrap = h('div', { class: 'jc-field' });
  const paint = () => {
    const cur = checkpointData(key).answers?.[f.key];
    wrap.replaceChildren(...kids(
      h('span', { class: 'jn-meta-l jc-label' }, f.label),
      day0Echo(key, f.key),
      h('p', { class: 'jn-q' }, f.q),
      h('div', { class: 'jn-chips jc-choice', role: 'radiogroup', 'aria-label': f.q }, f.options.map((o) => h('button', {
        class: 'jn-chip' + (cur === o ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': cur === o ? 'true' : 'false',
        onclick: () => { saveCheckpoint(key, { answers: { [f.key]: cur === o ? undefined : o } as Record<string, string> }); paint(); },
      }, o))),
      f.followUp
        ? h('div', { class: 'jc-follow' },
            h('p', { class: 'jn-q2' }, f.followUp),
            savingTextarea({
              value: checkpointData(key).answers?.[`${f.key}.note`] ?? '', label: f.followUp, rows: 3, cls: 'short',
              save: (v) => saveCheckpoint(key, { answers: { [`${f.key}.note`]: v } }),
            }))
        : null,
    ));
  };
  paint();
  return wrap;
}

function fieldView(c: Checkpoint, f: CheckpointField): HTMLElement {
  switch (f.kind) {
    case 'scale': return scaleField(c, f);
    case 'wheel': return wheelField(c, f);
    case 'values': return valuesField(c, f);
    case 'choice': return choiceField(c, f);
    default: return textField(c, f);
  }
}

function stepTitle(fields: CheckpointField[]): string {
  if (fields[0]?.kind === 'scale') return 'Mes repères, de 0 à 10';
  if (fields.length === 1) return fields[0].label;
  return 'En quelques lignes';
}

const SUBS: Record<CheckpointKey, string> = {
  '0': 'Avant la première graine',
  '30': 'À mi-chemin du jardin',
  '60': 'Ce qui a fleuri',
};

// ---------- the page ----------

/** Open checkpoint 0, 30 or 60, in the journal page template. */
export function openCheckpoint(key: CheckpointKey, opts: { onDone?: () => void } = {}) {
  const c = CHECKPOINTS.find((x) => String(x.day) === key);
  if (!c || !journeyOf(store.profile)) return;
  const steps = stepsOf(c);
  const total = steps.length + 1;
  let i = 0;

  const blurNow = () => (document.activeElement as HTMLElement | null)?.blur();
  const go = (n: number) => { blurNow(); i = n; paint(); page.toTop(); };

  const finish = () => {
    blurNow();
    saveCheckpoint(key, { doneAt: new Date().toISOString() });
    if (key === '60') { paintRecap(); return; }
    page.close();
    toast(key === '0' ? 'Ton point de départ est noté. Première graine semée.' : 'Bilan noté. Bravo pour ces 30 jours.');
    opts.onDone?.();
  };

  const paint = () => {
    const last = i === total - 1;
    const body: (HTMLElement | null)[] = i === 0
      ? [
          quotePage(c.quote),
          h('p', { class: 'jn-text' }, c.intro),
          checkpointDone(key) ? h('p', { class: 'jn-text muted-ink' }, 'Déjà rempli : tu peux relire et ajuster.') : null,
        ]
      : [
          h('h2', { class: 'jn-theme' }, stepTitle(steps[i - 1])),
          h('div', { class: 'jc-step' + (steps[i - 1].length === 1 ? ' single' : '') }, steps[i - 1].map((f) => fieldView(c, f))),
          !last ? whisper('Rien d’obligatoire : laisse vide ce qui ne te parle pas.') : null,
        ];
    page.update({
      path: stepPath(i, total),
      meta: [`Étape ${i + 1}/${total}`, key === '0' ? '3 min' : '5 min'],
      body: body.filter((x): x is HTMLElement => !!x),
      primary: last
        ? { label: key === '60' ? 'Voir mon chemin' : key === '0' ? 'Garder mon point de départ' : 'Garder mon bilan', run: finish }
        : { label: i === 0 ? 'Commencer' : 'Suivant', run: () => go(i + 1) },
      secondary: i > 0 ? { label: 'Retour', run: () => go(i - 1) } : { label: 'Plus tard', run: () => { blurNow(); page.close(); } },
    });
  };

  const paintRecap = () => {
    page.update({ title: 'Mon chemin', sub: SUBS['60'], path: [], meta: undefined, body: recapView(), primary: { label: 'Fermer', run: () => page.close() }, secondary: null });
    page.toTop();
  };

  const page = openJournalPage({
    eyebrow: `Revenir à moi · Jour ${key}`,
    title: c.title,
    sub: SUBS[key],
    path: stepPath(0, total),
    body: [],
    onClose: () => blurNow(),
  });
  paint();
}

// ---------- day 60 recap ----------

function scaleCompare(): HTMLElement | null {
  const a = checkpointData('0');
  const b60 = checkpointData('60'), b30 = checkpointData('30');
  const rows = (['energy', 'stress', 'satisfaction'] as ScaleKey[]).map((k) => {
    const label = k === 'energy' ? 'Énergie' : k === 'stress' ? 'Stress' : 'Satisfaction';
    const x = a[k], y = b60[k] ?? b30[k];
    if (typeof x !== 'number' && typeof y !== 'number') return null;
    return h('div', { class: 'jc-cmp-row' },
      h('span', { class: 'jc-cmp-l' }, label),
      h('span', { class: 'jc-cmp-bars' },
        h('i', { class: 'jc-cmp-bar base', style: `width:${(x ?? 0) * 10}%` }),
        h('i', { class: 'jc-cmp-bar now', style: `width:${(y ?? 0) * 10}%` })),
      h('span', { class: 'num jc-cmp-v' }, `${x ?? '–'} → ${y ?? '–'}`));
  }).filter((x) => !!x) as HTMLElement[];
  return rows.length ? h('div', { class: 'jc-cmp' }, rows) : null;
}

function recapView(): HTMLElement {
  const st = journeyStats(today());
  const { start, now } = wheelsNowAndStart();
  const d0 = checkpointData('0');
  const stat = (v: string, l: string) => h('div', { class: 'jn-stat' }, h('span', { class: 'jn-stat-v num' }, v), h('span', { class: 'jn-stat-l' }, l));
  return h('div', { class: 'jc-recap' },
    h('div', { class: 'jc-recap-hero' },
      starSticker('jc-star'),
      h('h2', { class: 'jn-theme' }, 'Tu es revenue à toi, un jour après l’autre.'),
      h('p', { class: 'jn-q2' }, 'Ce n’est pas une fin : c’est ton nouveau point de départ.')),
    st ? h('div', { class: 'jn-stats' },
      stat(String(st.success), `jour${st.success > 1 ? 's' : ''} en fleur`),
      stat(String(st.answered), `page${st.answered > 1 ? 's' : ''} gardée${st.answered > 1 ? 's' : ''}`),
      stat(String(st.streak), `jour${st.streak > 1 ? 's' : ''} de suite`)) : null,
    scaleCompare(),
    start || now ? h('h3', { class: 'jn-h3' }, 'Ta roue, avant et maintenant') : null,
    start || now ? wheelCompare(start, now) : null,
    d0.intention ? echo('Ton intention du jour 0', d0.intention) : null,
    d0.answers?.cultivate ? echo('Ce que tu voulais cultiver', d0.answers.cultivate) : null,
    h('div', { class: 'jc-field' },
      h('span', { class: 'jn-meta-l jc-label' }, 'Une lettre à moi'),
      h('p', { class: 'jn-q' }, 'Écris quelques lignes à la femme que tu seras dans six mois : ce que tu veux qu’elle garde, ce que tu lui souhaites.'),
      savingTextarea({
        value: checkpointData('60').answers?.letter ?? '', label: 'Une lettre à moi', rows: 5, placeholder: 'Chère moi…',
        save: (v) => saveCheckpoint('60', { answers: { letter: v } }),
      })),
    whisper('Tout reste sur ton téléphone. Tu retrouves ce bilan dans Équilibre → Revenir à moi.'),
  );
}

/** The recap alone (Équilibre, once day 60 is done). */
export function openJourneyRecap() {
  const page = openJournalPage({
    eyebrow: 'Revenir à moi · 60 jours', title: 'Mon chemin', sub: SUBS['60'],
    body: recapView(), primary: { label: 'Fermer', run: () => page.close() },
  });
}

/** @deprecated The ink entry card (journey.ts journeyEntryCard) covers day 30 / 60 on Today. */
export function checkpointCard(_date: string): HTMLElement | null {
  return null;
}

/** Équilibre → "Ma roue de la vie": the latest wheel over the day-0 one. */
export function openWheelSheet() {
  const { start, now, nowKey } = wheelsNowAndStart();
  const page = openJournalPage({
    eyebrow: 'Revenir à moi',
    title: 'Ma roue de la vie',
    sub: now && start ? `Jour ${nowKey} et point de départ` : 'Ton point de départ',
    body: [
      start || now
        ? h('p', { class: 'jn-text' }, now && start
            ? `En plein : ta roue du jour ${nowKey}. En pointillés : ton point de départ.`
            : 'Ton point de départ. Tu la noteras de nouveau au jour 30 et au jour 60 pour voir ce qui a poussé.')
        : h('p', { class: 'jn-text' }, 'Ta roue n’est pas encore remplie. Elle fait partie de ton point de départ.'),
      start || now ? wheelCompare(start, now) : null,
    ],
    primary: {
      label: start || now ? 'Ajuster mes notes' : 'Remplir mon point de départ',
      run: () => { page.close(); setTimeout(() => openCheckpoint(nowKey ?? '0'), 240); },
    },
  });
}
