// "J'ai craqué" sheet: log a slip without judgement, then answer with compassion,
// 3 concrete next steps (never restriction or compensation) and, after a few slips,
// one kind pattern insight.

import type { Slip, SlipKind, SlipTrigger } from '../types';
import { store, uid } from '../store';
import { h, openSheet, field, parseNum, iconCircle, ICON } from '../lib/ui';
import { today } from '../lib/dates';
import { slipResponse, SLIP_KIND_LABEL, SLIP_TRIGGER_LABEL } from '../lib/coach';
import { openBreathing } from './breathing';

const KINDS: SlipKind[] = ['sucre', 'grignotage', 'gros-repas', 'alcool', 'fastfood', 'autre'];
const TRIGGERS: SlipTrigger[] = ['stress', 'fatigue', 'faim', 'emotion', 'social', 'regles', 'ennui'];

const pad = (n: number) => String(n).padStart(2, '0');
const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function chip(label: string, on: boolean, onclick: () => void): HTMLElement {
  return h('button', { class: 'coach-chip' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick }, label);
}

/** "J'ai craqué" sheet: kind, triggers, kind response + next steps. */
export function openSlipSheet(date: string = today()): void {
  let kind: SlipKind | null = null;
  const triggers = new Set<SlipTrigger>();
  const kcalInput = h('input', { class: 'input num', type: 'text', inputMode: 'numeric', placeholder: 'ex. 400', autocomplete: 'off', 'aria-label': 'Estimation en kcal (facultatif)' });
  const noteInput = h('textarea', { placeholder: 'Ce que tu veux, ou rien du tout.', rows: 2, 'aria-label': 'Note (facultatif)' });

  const wrap = h('div', { class: 'stack slip-wrap' });
  const sheet = openSheet('J’ai craqué', wrap);

  function paintForm() {
    const save = h('button', { class: 'btn primary block', type: 'button', disabled: !kind, onclick: submit }, 'Noter, sans jugement');
    wrap.replaceChildren(
      h('p', { class: 'slip-lead' }, 'Ça arrive. Qu’est-ce qui s’est passé ?'),
      h('div', { class: 'coach-chips', role: 'group', 'aria-label': 'Ce qui s’est passé' },
        KINDS.map((k) => chip(SLIP_KIND_LABEL[k], kind === k, () => { kind = k; paintForm(); }))),
      h('p', { class: 'slip-q' }, 'Qu’est-ce qui l’a déclenché ?', h('span', { class: 'muted small' }, ' facultatif')),
      h('div', { class: 'coach-chips', role: 'group', 'aria-label': 'Déclencheurs' },
        TRIGGERS.map((t) => chip(SLIP_TRIGGER_LABEL[t], triggers.has(t), () => {
          if (triggers.has(t)) triggers.delete(t); else triggers.add(t);
          paintForm();
        }))),
      field('En gros, combien de kcal ? (facultatif)', kcalInput, 'Une estimation suffit. Tu peux laisser vide.'),
      field('Un mot (facultatif)', noteInput),
      save,
      h('p', { class: 'small muted', style: 'text-align:center' }, 'Rien de tout ça ne sera jugé. C’est juste pour t’aider à mieux te connaître.'),
    );
  }

  function submit() {
    if (!kind) return;
    const kcal = parseNum(kcalInput.value);
    const note = noteInput.value.trim();
    const slip: Slip = {
      id: uid(),
      time: nowHHMM(),
      kind,
      triggers: [...triggers],
      ...(kcal !== undefined && kcal > 0 && kcal < 10000 ? { kcal: Math.round(kcal) } : {}),
      ...(note ? { note } : {}),
    };
    void store.updateDay(date, (d) => { d.slips = [...(d.slips ?? []), slip]; });
    paintReply(slip);
  }

  function paintReply(slip: Slip) {
    const r = slipResponse(slip, date, store.state);
    const wantsBreath = slip.triggers.includes('stress') || slip.triggers.includes('emotion');
    const parts: (HTMLElement | null)[] = [
      h('div', { class: 'coach-card slip-reply' },
        h('div', { class: 'coach-head' }, iconCircle(ICON.heart, 'coach-ic'), h('h3', { class: 'coach-title' }, r.title)),
        h('p', { class: 'coach-body' }, r.body),
        h('p', { class: 'coach-sign' }, '— ton coach'),
      ),
      h('p', { class: 'slip-q' }, 'Maintenant, trois petites choses :'),
      h('ol', { class: 'coach-steps' }, r.steps.map((s, i) => h('li', null, h('span', { class: 'coach-step-n num', 'aria-hidden': 'true' }, String(i + 1)), h('span', null, s)))),
      r.insight
        ? h('div', { class: 'slip-insight' },
            h('div', { class: 'eyebrow' }, 'Ce que je remarque'),
            h('p', { class: 'slip-insight-title' }, r.insight.title),
            h('p', { class: 'small' }, r.insight.text),
          )
        : null,
      wantsBreath
        ? h('button', { class: 'btn block', type: 'button', onclick: () => { sheet.close(); openBreathing(date); } }, 'Respirer 5 min avec moi')
        : null,
      h('button', { class: 'btn primary block', type: 'button', onclick: () => sheet.close() }, 'Merci, je continue'),
    ];
    wrap.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
    wrap.closest('.sheet-body')?.scrollTo({ top: 0 });
  }

  paintForm();
}
