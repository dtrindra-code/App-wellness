// "Ma roue des émotions" in the morning check-in: 8 coloured petals (families), then
// the nuance chips of the chosen one. Optional, one tap is enough. Saved in
// DayLog.journey.emotion (the store re-renders Today).

import { store } from '../store';
import { h } from '../lib/ui';
import { EMOTIONS } from '../data/journey';
import { setEmotion } from '../lib/journey';

/** Petals + nuances for `date`. */
export function emotionPicker(date: string, onPick?: () => void): HTMLElement {
  const cur = store.getDay(date).journey?.emotion;
  const fam = EMOTIONS.find((e) => e.key === cur?.family);
  return h('div', { class: 'je stack', style: 'gap:8px' },
    h('div', { class: 'je-petals', role: 'radiogroup', 'aria-label': 'Ton émotion du moment' },
      EMOTIONS.map((e) => {
        const on = cur?.family === e.key;
        return h('button', {
          class: 'je-petal' + (on ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false',
          style: `--je-c: var(${e.color}, ${e.hex})`,
          onclick: () => { onPick?.(); setEmotion(date, on ? null : e.key); },
        }, h('span', { class: 'je-dot', 'aria-hidden': 'true' }), e.label);
      })),
    fam
      ? h('div', { class: 'jr-chips je-nuances', role: 'radiogroup', 'aria-label': `Nuances de ${fam.label.toLowerCase()}` },
          fam.nuances.map((n) => {
            const on = cur?.nuance === n;
            return h('button', {
              class: 'jr-chip je-nuance' + (on ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false',
              style: `--je-c: var(${fam.color}, ${fam.hex})`,
              onclick: () => { onPick?.(); setEmotion(date, fam.key, on ? undefined : n); },
            }, n);
          }))
      : null,
  );
}
