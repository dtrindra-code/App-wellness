// Checkpoints of the journal, as multi-step sheets on paper:
//   day 0 "Mon point de départ" (3 scales, life wheel, intention, 3 values),
//   day 30 "Premier regard en arrière" and day 60 "Ajustements et découvertes"
//   (scales next to the day-0 values, wheel over the day-0 one, back to the intention,
//   the content's questions, "Mon plus grand apprentissage").
// Day 60 ends with a recap (stats, wheel before / after, a letter to herself).
// Everything is saved as she goes in Profile.journey.checkpoints.

import { store } from '../store';
import { h, openSheet, toast, starSticker, iconCircle, ICON } from '../lib/ui';
import { CHECKPOINTS, VALUES } from '../data/journey';
import type { Checkpoint, CheckpointField } from '../data/journey';
import type { CheckpointKey, JourneyCheckpoint } from '../types';
import {
  checkpointData, saveCheckpoint, journeyOf, journeyStats, wheelValues, wheelsNowAndStart, journeyDay, checkpointDone,
} from '../lib/journey';
import { today } from '../lib/dates';
import { quotePage } from './journal-science';
import { wheelEditor, wheelCompare } from './journal-wheel';
import { savingTextarea } from './journal-page';

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
    class: 'jc-range', type: 'range', min: 0, max: 10, step: 1, value: String(cur ?? 5),
    'aria-label': `${f.label}, de 0 (${f.low}) à 10 (${f.high})`,
    oninput: () => { out.textContent = range.value; range.classList.add('set'); },
    onchange: () => saveCheckpoint(key, { [f.key]: Number(range.value) } as Partial<JourneyCheckpoint>),
  });
  if (typeof cur === 'number') range.classList.add('set');
  return h('div', { class: 'jc-scale' },
    h('div', { class: 'jc-scale-head' },
      h('span', { class: 'jc-label' }, f.label),
      typeof base === 'number' ? h('span', { class: 'jc-base small' }, `jour 0 : `, h('b', { class: 'num' }, String(base))) : null,
      out),
    range,
    h('div', { class: 'jc-scale-ends small muted' }, h('span', null, `0 · ${f.low}`), h('span', null, `${f.high} · 10`)),
  );
}

function wheelField(c: Checkpoint, f: Extract<CheckpointField, { kind: 'wheel' }>): HTMLElement {
  const key = keyOf(c);
  const base = key === '0' ? null : wheelValues(checkpointData('0').wheel);
  return h('div', { class: 'stack', style: 'gap:8px' },
    h('p', { class: 'small' }, f.hint),
    wheelEditor(wheelValues(checkpointData(key).wheel), (next) => saveCheckpoint(key, { wheel: next }), base && Object.keys(base).length ? base : null),
  );
}

function valuesField(c: Checkpoint, f: Extract<CheckpointField, { kind: 'values' }>): HTMLElement {
  const key = keyOf(c);
  const picked = new Set(checkpointData(key).values ?? []);
  const wrap = h('div', { class: 'stack', style: 'gap:8px' });
  const paint = () => wrap.replaceChildren(
    h('p', { class: 'jc-q' }, f.q),
    h('p', { class: 'small muted' }, `${picked.size}/${f.pick} choisie${picked.size > 1 ? 's' : ''}`),
    h('div', { class: 'jr-chips', role: 'group', 'aria-label': f.label },
      VALUES.map((v) => {
        const on = picked.has(v);
        return h('button', {
          class: 'jr-chip' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
          onclick: () => {
            if (on) picked.delete(v);
            else if (picked.size >= f.pick) { toast(`${f.pick} valeurs au plus : garde l’essentiel`); return; }
            else picked.add(v);
            saveCheckpoint(key, { values: [...picked] });
            paint();
          },
        }, v);
      })),
  );
  paint();
  return wrap;
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

/** Reminder of day 0 next to a day-30/60 question. */
function day0Echo(key: CheckpointKey, fieldKey: string): HTMLElement | null {
  if (key === '0') return null;
  const d0 = checkpointData('0');
  if ((fieldKey === 'intentionBack') && d0.intention) return h('p', { class: 'jc-echo' }, h('span', { class: 'eyebrow' }, 'Ton intention du jour 0'), h('span', { class: 'italic' }, d0.intention));
  if (fieldKey === 'values' && d0.values?.length) return h('p', { class: 'jc-echo' }, h('span', { class: 'eyebrow' }, 'Tes valeurs du jour 0'), h('span', { class: 'italic' }, d0.values.join(' · ')));
  return null;
}

function textField(c: Checkpoint, f: Extract<CheckpointField, { kind: 'text' }>): HTMLElement {
  const key = keyOf(c);
  const ta = savingTextarea({ value: textValue(key, f.key), label: f.q, save: (v) => saveText(key, f.key, v) });
  return h('div', { class: 'jc-field' },
    h('span', { class: 'jc-label' }, f.label),
    day0Echo(key, f.key),
    h('p', { class: 'jc-q' }, f.q),
    f.chips?.length
      ? h('div', { class: 'jr-chips', role: 'group', 'aria-label': 'Idées (facultatif)' }, f.chips.map((ch) => h('button', {
          class: 'jr-chip', type: 'button',
          onclick: () => {
            const cur = ta.value.trim();
            if (cur.toLowerCase().includes(ch.toLowerCase())) return;
            ta.value = cur ? `${cur} · ${ch}` : ch;
            ta.dispatchEvent(new Event('input'));
            saveText(key, f.key, ta.value);
          },
        }, `+ ${ch}`)))
      : null,
    h('div', { class: 'jp-paper lined' }, ta),
  );
}

function choiceField(c: Checkpoint, f: Extract<CheckpointField, { kind: 'choice' }>): HTMLElement {
  const key = keyOf(c);
  const wrap = h('div', { class: 'jc-field' });
  const paint = () => {
    const cur = checkpointData(key).answers?.[f.key];
    wrap.replaceChildren(...kids(
      h('span', { class: 'jc-label' }, f.label),
      day0Echo(key, f.key),
      h('p', { class: 'jc-q' }, f.q),
      h('div', { class: 'jc-choice', role: 'radiogroup', 'aria-label': f.q }, f.options.map((o) => h('button', {
        class: 'jr-chip' + (cur === o ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': cur === o ? 'true' : 'false',
        onclick: () => { saveCheckpoint(key, { answers: { [f.key]: cur === o ? undefined : o } as Record<string, string> }); paint(); },
      }, o))),
      f.followUp
        ? h('div', { class: 'stack', style: 'gap:4px' },
            h('p', { class: 'jc-q small' }, f.followUp),
            h('div', { class: 'jp-paper lined' }, savingTextarea({
              value: checkpointData(key).answers?.[`${f.key}.note`] ?? '', label: f.followUp,
              save: (v) => saveCheckpoint(key, { answers: { [`${f.key}.note`]: v } }),
            })))
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

// ---------- the sheet ----------

/** Open checkpoint 0, 30 or 60. */
export function openCheckpoint(key: CheckpointKey, opts: { onDone?: () => void } = {}) {
  const c = CHECKPOINTS.find((x) => String(x.day) === key);
  if (!c || !journeyOf(store.profile)) return;
  const steps = stepsOf(c);
  const total = steps.length + 1;
  let i = 0;
  const body = h('div', { class: 'stack jc-body' });

  const blurNow = () => (document.activeElement as HTMLElement | null)?.blur();
  const go = (n: number) => { blurNow(); i = n; paint(); sheet.el.scrollTop = 0; body.closest('.sheet')?.scrollTo?.(0, 0); };

  const finish = () => {
    blurNow();
    saveCheckpoint(key, { doneAt: new Date().toISOString() });
    if (key === '60') { paintRecap(); return; }
    sheet.close();
    toast(key === '0' ? 'Ton point de départ est noté. On y reviendra au jour 30.' : 'Bilan noté. Bravo pour ces 30 jours.');
    opts.onDone?.();
  };

  const paint = () => {
    const dots = h('div', { class: 'sr-dots', 'aria-label': `Étape ${i + 1} sur ${total}` },
      Array.from({ length: total }, (_, k) => h('i', { class: k < i ? 'done' : k === i ? 'on' : '' })));
    const content: (HTMLElement | null)[] = i === 0
      ? [
          quotePage(c.quote, key === '0' ? 'Jour 0' : `Jour ${key}`),
          h('p', { class: 'jc-intro' }, c.intro),
          checkpointDone(key) ? h('p', { class: 'small muted' }, 'Déjà rempli : tu peux relire et ajuster.') : null,
        ]
      : [h('h3', { class: 'jc-step-title' }, stepTitle(steps[i - 1])),
          h('div', { class: 'stack jc-step' + (steps[i - 1].length === 1 ? ' single' : ''), style: 'gap:18px' }, steps[i - 1].map((f) => fieldView(c, f)))];
    const last = i === total - 1;
    body.replaceChildren(...kids(
      h('div', { class: 'sr-top' }, h('span', { class: 'eyebrow' }, `${c.title} · ${i + 1}/${total}`), dots),
      ...content.filter((x): x is HTMLElement => !!x),
      h('div', { class: 'sr-nav' },
        i > 0 ? h('button', { class: 'btn', type: 'button', onclick: () => go(i - 1) }, 'Retour') : h('button', { class: 'btn ghost', type: 'button', onclick: () => { blurNow(); sheet.close(); } }, 'Plus tard'),
        last
          ? h('button', { class: 'btn primary', type: 'button', onclick: finish }, key === '60' ? 'Voir mon chemin' : 'Terminer')
          : h('button', { class: 'btn primary', type: 'button', onclick: () => go(i + 1) }, i === 0 ? 'Commencer' : 'Suivant')),
      i > 0 && !last ? h('p', { class: 'small muted', style: 'text-align:center' }, 'Rien d’obligatoire : laisse vide ce qui ne te parle pas.') : null,
    ));
  };

  const paintRecap = () => { body.replaceChildren(recapView()); };

  const sheet = openSheet(c.title, body);
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
  const stat = (v: string, l: string) => h('div', { class: 'coach-stat' }, h('span', { class: 'coach-stat-v num' }, v), h('span', { class: 'coach-stat-l' }, l));
  return h('div', { class: 'stack jc-recap' },
    h('div', { class: 'jc-recap-hero paper' },
      starSticker('jc-star'),
      h('span', { class: 'eyebrow' }, '60 jours avec toi'),
      h('h3', { class: 'jr-title' }, 'Tu es revenue à toi, un jour après l’autre.'),
      h('p', { class: 'italic jr-sub' }, 'Ce n’est pas une fin : c’est ton nouveau point de départ.')),
    st ? h('div', { class: 'coach-stats' },
      stat(String(st.success), `jour${st.success > 1 ? 's' : ''} réussi${st.success > 1 ? 's' : ''}`),
      stat(String(st.answered), `page${st.answered > 1 ? 's' : ''} écrite${st.answered > 1 ? 's' : ''}`),
      stat(String(st.streak), `jour${st.streak > 1 ? 's' : ''} de suite`)) : null,
    scaleCompare(),
    start || now ? h('h3', null, 'Ta roue, avant et maintenant') : null,
    start || now ? wheelCompare(start, now) : null,
    d0.intention ? h('p', { class: 'jc-echo' }, h('span', { class: 'eyebrow' }, 'Ton intention du jour 0'), h('span', { class: 'italic' }, d0.intention)) : null,
    h('div', { class: 'jc-field' },
      h('span', { class: 'jc-label' }, 'Une lettre à moi'),
      h('p', { class: 'jc-q' }, 'Écris quelques lignes à la femme que tu seras dans six mois : ce que tu veux qu’elle garde, ce que tu lui souhaites.'),
      h('div', { class: 'jp-paper lined' }, savingTextarea({
        value: checkpointData('60').answers?.letter ?? '', label: 'Une lettre à moi', rows: 4, placeholder: 'Chère moi…',
        save: (v) => saveCheckpoint('60', { answers: { letter: v } }),
      }))),
    h('p', { class: 'small muted', style: 'text-align:center' }, 'Tout reste sur ton téléphone. Tu retrouves ce bilan dans Équilibre → Revenir à moi.'),
  );
}

/** The recap alone (Équilibre, once day 60 is done). */
export function openJourneyRecap() {
  openSheet('Mon chemin', recapView());
}

/** Today CE SOIR on day 30 / 60: the checkpoint replaces the page. */
export function checkpointCard(date: string): HTMLElement | null {
  const n = journeyDay(date);
  if (n !== 30 && n !== 60) return null;
  const key = String(n) as CheckpointKey;
  const c = CHECKPOINTS.find((x) => x.day === n)!;
  const done = checkpointDone(key);
  return h('section', { class: 'card ux solo jr-card jc-card paper', 'aria-label': c.title },
    h('span', { class: 'eyebrow' }, `Jour ${n} · Bilan`),
    h('h3', { class: 'jr-title' }, c.title),
    h('p', { class: 'small' }, done ? 'Ton bilan est noté. Tu peux le relire quand tu veux.' : 'Aujourd’hui, pas de page classique : un regard sur ton chemin, en 5 minutes.'),
    h('div', { class: 'row', style: 'gap:8px' },
      h('button', { class: 'btn primary grow', type: 'button', onclick: () => openCheckpoint(key) }, done ? 'Relire mon bilan' : 'Ouvrir mon bilan'),
      done && key === '60' ? h('button', { class: 'btn grow', type: 'button', onclick: () => openJourneyRecap() }, 'Mon chemin') : null),
  );
}

/** Small row inviting to fill the day-0 baseline (first week, or before the start). */
export function baselineInvite(): HTMLElement | null {
  const j = journeyOf(store.profile);
  if (!j || checkpointDone('0')) return null;
  const n = journeyDay(today());
  if (n !== null && n > 7) return null;
  return h('button', { class: 'info-row tap jc-invite', type: 'button', onclick: () => openCheckpoint('0') },
    iconCircle(ICON.spark),
    h('span', { class: 'info-main' },
      h('span', { class: 'info-title' }, 'Mon point de départ'),
      h('span', { class: 'info-detail' }, '3 minutes : ta roue de vie, ton intention, tes valeurs.')),
    h('span', { class: 'info-chev', 'aria-hidden': 'true' }, '›'));
}

/** Équilibre → "Ma roue de la vie": the latest wheel over the day-0 one. */
export function openWheelSheet() {
  const { start, now, nowKey } = wheelsNowAndStart();
  const body = h('div', { class: 'stack' },
    start || now
      ? h('p', { class: 'small muted' }, now && start
          ? `En plein : ta roue du jour ${nowKey}. En pointillés : ton point de départ.`
          : 'Ton point de départ. Tu la noteras de nouveau au jour 30 et au jour 60 pour voir ce qui a bougé.')
      : h('p', { class: 'small' }, 'Ta roue n’est pas encore remplie. Elle fait partie de ton point de départ.'),
    start || now ? wheelCompare(start, now) : null,
    h('button', { class: 'btn block', type: 'button', onclick: () => { sheet.close(); setTimeout(() => openCheckpoint(nowKey ?? '0'), 240); } },
      start || now ? 'Ajuster mes notes' : 'Remplir mon point de départ'),
  );
  const sheet = openSheet('Ma roue de la vie', body);
}
