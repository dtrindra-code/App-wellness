import './pwa';
import './styles.css';
import { store } from './store';
import { h, s } from './lib/ui';
import type { Screen, TabId } from './screens/types';
import { renderToday } from './screens/today';
import { renderWeight } from './screens/weight';
import { renderFood } from './screens/food';
import { renderTraining } from './screens/training';
import { renderSettings } from './screens/settings';
import { renderBalance } from './screens/balance';
import { openOnboarding } from './screens/onboarding';

const SCREENS: Record<TabId, Screen> = {
  today: renderToday,
  weight: renderWeight,
  food: renderFood,
  training: renderTraining,
  balance: renderBalance,
  settings: renderSettings,
};

// Simple line icons (24px grid, stroke = currentColor).
const icon = (d: string) =>
  s('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    ...d.split('|').map((p) => s('path', { d: p })));

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'today', label: 'Aujourd’hui', icon: 'M12 3v2|M12 19v2|M3 12h2|M19 12h2|M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8' },
  { id: 'weight', label: 'Poids', icon: 'M4 19h16|M5 15l4-4 3 3 7-7|M15 7h4v4' },
  { id: 'food', label: 'Repas', icon: 'M7 3v8a2 2 0 0 0 4 0V3|M9 11v10|M17 3c-2 2-2 6 0 8v10' },
  { id: 'training', label: 'Sport', icon: 'M4 17c3-6 5-6 8 0s5 6 8 0|M4 9c3-6 5-6 8 0s5 6 8 0' },
  { id: 'balance', label: 'Équilibre', icon: 'M12 21c-5-3-8-6.5-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 3.5c0 4-3 7.5-8 10.5' },
];

const TAB_KEY = 'cap-maldives:tab';
let current: TabId = 'today';
try {
  const saved = localStorage.getItem(TAB_KEY) as TabId | null;
  if (saved && saved in SCREENS) current = saved;
} catch { /* ignore */ }

const root = h('main', { class: 'app', id: 'screen' });
const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Navigation' });
const app = document.getElementById('app')!;
app.append(root, tabbar);

function go(tab: TabId) {
  current = tab;
  try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ }
  render();
  window.scrollTo(0, 0);
}

function renderTabs() {
  tabbar.replaceChildren(
    h('div', { class: 'tabbar-inner' },
      TABS.map((t) =>
        h('button', {
          class: 'tab' + (t.id === current ? ' on' : ''),
          'aria-current': t.id === current ? 'page' : undefined,
          onclick: () => go(t.id),
        }, icon(t.icon), t.label),
      ),
    ),
  );
}

let dirty = false;
function render() {
  // Don't wipe a field the user is typing in; re-render when they leave it.
  const active = document.activeElement;
  if (active && root.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) {
    dirty = true;
    return;
  }
  dirty = false;
  renderTabs();
  const y = window.scrollY;
  root.replaceChildren();
  SCREENS[current](root, { go });
  window.scrollTo(0, y);
}
root.addEventListener('focusout', () => setTimeout(() => { if (dirty) render(); }, 0));

store.subscribe(render);
render();

store.ready.then(() => {
  if (!store.profile.onboarded) openOnboarding();
});
