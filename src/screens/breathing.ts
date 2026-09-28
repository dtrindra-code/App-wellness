// Cohérence cardiaque: 5 min, inhale 5 s / exhale 5 s, in a full-height sheet.
// On completion: day.wellbeing.breathing += 1, and the coherence pillar is
// ticked once the daily target is reached. Timers are cleared on close.

import { store } from '../store';
import { h, openSheet, toast } from '../lib/ui';
import { COHERENCE_KEY, COHERENCE_TARGET } from '../lib/habits';

const TOTAL_S = 300;
const HALF_S = 5;

const fmtClock = (s: number) => {
  const r = Math.max(0, Math.ceil(s));
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
};

export function openBreathing(date: string): void {
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let elapsed = 0; // seconds
  let running = false;
  let done = false;
  let last = 0;
  let timer: number | undefined;

  const word = h('div', { class: 'br-word', 'aria-live': 'polite' }, 'Prête ?');
  const circle = h('div', { class: 'br-circle' + (reduced ? ' still' : '') }, word);
  const clock = h('div', { class: 'br-clock num' }, fmtClock(TOTAL_S));
  const fill = h('div', { class: 'bar-fill', style: 'width:0%' });
  const progress = h('div', { class: 'bar' }, fill);
  const breathFill = h('div', { class: 'bar-fill', style: 'width:0%' });
  const breathBar = reduced ? h('div', { class: 'bar br-breath' }, breathFill) : null;
  const toggle = h('button', { class: 'btn primary block', type: 'button', onclick: () => (running ? pause() : start()) }, 'Commencer');
  const hint = h('p', { class: 'small muted br-hint' }, 'Inspire par le nez 5 s, expire doucement 5 s. Assise, épaules relâchées.');

  const content = h('div', { class: 'br-wrap' },
    h('div', { class: 'br-stage' }, circle),
    breathBar,
    h('div', { class: 'stack', style: 'gap:8px' }, h('div', { class: 'row between' }, h('span', { class: 'small muted' }, 'Reste'), clock), progress),
    hint,
    toggle,
  );

  const sheet = openSheet('Cohérence cardiaque', content, { onClose: stop });
  sheet.el.closest('.sheet')?.classList.add('br-sheet');

  function paint() {
    const inCycle = elapsed % (HALF_S * 2);
    const inhale = inCycle < HALF_S;
    if (!done) word.textContent = running || elapsed > 0 ? (inhale ? 'Inspire' : 'Expire') : 'Prête ?';
    clock.textContent = fmtClock(TOTAL_S - elapsed);
    fill.style.width = `${Math.min(100, (elapsed / TOTAL_S) * 100)}%`;
    if (breathBar) {
      const f = inhale ? inCycle / HALF_S : 1 - (inCycle - HALF_S) / HALF_S;
      breathFill.style.width = `${Math.round(f * 100)}%`;
    }
  }

  function tick() {
    const now = performance.now();
    // Cap each step: a locked phone / background tab (timers frozen) must not count as breathing time.
    elapsed += Math.min(1, (now - last) / 1000);
    last = now;
    if (elapsed >= TOTAL_S) {
      elapsed = TOTAL_S;
      finish();
      return;
    }
    paint();
  }

  function start() {
    if (done) {
      done = false;
      elapsed = 0;
      circle.classList.remove('run');
      void circle.offsetWidth; // restart the animation from the top
    }
    running = true;
    last = performance.now();
    circle.classList.add('run');
    circle.classList.remove('paused');
    toggle.textContent = 'Pause';
    hint.textContent = 'Suis le cercle. Si ton esprit part, reviens juste au souffle.';
    clearInterval(timer);
    timer = window.setInterval(tick, 200);
    paint();
  }

  function pause() {
    running = false;
    clearInterval(timer);
    timer = undefined;
    circle.classList.add('paused');
    toggle.textContent = 'Reprendre';
  }

  function stop() {
    running = false;
    clearInterval(timer);
    timer = undefined;
  }

  function finish() {
    stop();
    done = true;
    circle.classList.add('paused');
    paint();
    word.textContent = 'Fini';
    toggle.textContent = 'Encore une';
    let count = 0;
    void store.updateDay(date, (d) => {
      const wb = { ...(d.wellbeing ?? {}) };
      wb.breathing = (wb.breathing ?? 0) + 1;
      count = wb.breathing;
      d.wellbeing = wb;
      if (count >= COHERENCE_TARGET) d.habits = { ...(d.habits ?? {}), [COHERENCE_KEY]: true };
    });
    hint.textContent = count >= COHERENCE_TARGET
      ? `Séance ${count} aujourd’hui : pilier coché. Bien joué.`
      : `Séance ${count}/${COHERENCE_TARGET} aujourd’hui. Bien joué.`;
    toast('5 minutes de calme, noté.');
  }
}
