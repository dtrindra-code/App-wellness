// "Plus" screen: profile summary, cycle settings, iPhone notifications guide, backup, upcoming features, theme.

import type { Screen } from './types';
import type { CycleSettings } from '../types';
import { h, field, openSheet, parseNum, segmented, toast, fmtInt, fmtKg } from '../lib/ui';
import { store } from '../store';
import { daysBetween, fmtDayMonth, today } from '../lib/dates';
import { targets, phaseOn } from '../lib/nutrition';
import { PREGNANCY_NOTE, adviceFor, cycleOn, cycleSettings } from '../lib/cycle';
import { QUOTES, QUOTES_FOR_SHORTCUT } from '../data/quotes';
import { openProfileEditor, toggleRow } from './onboarding';

// ---------- theme (applied at import) ----------

type Theme = 'auto' | 'light' | 'dark';
const THEME_KEY = 'cap-maldives:theme';

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function applyTheme(t: Theme) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

let theme: Theme = readTheme();
applyTheme(theme);

function setTheme(t: Theme) {
  theme = t;
  applyTheme(t);
  try {
    if (t === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch { /* ignore */ }
}

// ---------- transient UI state ----------

/** Text shown in a selectable textarea when the clipboard is refused. */
let fallback: { key: 'quotes' | 'export'; text: string } | null = null;
let rerender: (() => void) | null = null;

/** Copy to the clipboard; true when it worked (else a selectable box is shown). */
async function copy(text: string, key: 'quotes' | 'export', okMsg: string): Promise<boolean> {
  let ok = true;
  try {
    await navigator.clipboard.writeText(text);
    fallback = null;
    toast(okMsg);
  } catch {
    ok = false;
    fallback = { key, text };
    toast('Copie bloquée : sélectionne le texte ci-dessous');
  }
  rerender?.();
  return ok;
}

function fallbackBox(key: 'quotes' | 'export'): HTMLElement | null {
  if (!fallback || fallback.key !== key) return null;
  const ta = h('textarea', { class: 'input set-copy', readOnly: true, value: fallback.text, 'aria-label': 'Texte à copier' });
  setTimeout(() => { ta.focus(); ta.select(); }, 50);
  return h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, 'Appuie longuement dans le cadre puis « Tout sélectionner » et « Copier ».'),
    ta,
  );
}

// ---------- sections ----------

const SEX_LABEL = { f: 'Femme', m: 'Homme' } as const;

function profileCard(): HTMLElement {
  const p = store.profile;
  const d = today();
  const w = store.weightOn(d);
  const cs = cycleSettings(p);
  const info = cs.tracking && !cs.pregnant ? cycleOn(d, p, store.state.days) : null;
  const t = targets(d, p, w, store.getDay(d), info ? adviceFor(info, p, d).kcalAdjust : 0);
  const phase = phaseOn(d, p);
  const bits = [
    p.sex ? SEX_LABEL[p.sex] : null,
    p.age ? `${p.age} ans` : null,
    `${p.heightCm} cm`,
    `palier ${fmtKg(p.goalWeight)} kg`,
    p.finalGoalWeight !== undefined && p.finalGoalWeight < p.goalWeight ? `objectif final ${fmtKg(p.finalGoalWeight)} kg` : null,
  ].filter(Boolean);

  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', null, 'Profil'),
      h('button', { type: 'button', class: 'btn ghost sm', onclick: () => openProfileEditor() }, 'Modifier'),
    ),
    h('p', null, bits.join(' · ')),
    !p.sex || !p.age
      ? h('p', { class: 'small muted' }, 'Ajoute ton sexe et ton âge pour des calories plus justes.')
      : null,
    h('div', { class: 'grid-2' },
      h('div', { class: 'stat' },
        h('span', { class: 'value' }, fmtInt(t.kcal), h('small', null, 'kcal')),
        h('span', { class: 'label' }, `Cible du jour · ${phase.label}`),
      ),
      h('div', { class: 'stat' },
        h('span', { class: 'value' }, fmtInt(t.maintenance), h('small', null, 'kcal')),
        h('span', { class: 'label' }, 'Maintien estimé'),
      ),
    ),
    h('p', { class: 'small muted' },
      cs.pregnant
        ? 'Mode grossesse : la cible est ton maintien estimé, sans déficit.'
        : `Mifflin-St Jeor × ton activité, moins un déficit selon la phase. Jamais sous ${fmtInt(t.floor)} kcal (le plus haut entre ${cs.ttc ? '1 400' : '1 200'} et ton métabolisme de base). Ce sont des estimations.`,
    ),
  );
}

function notificationsCard(): HTMLElement {
  const steps = [
    'Ouvre l’app Raccourcis, onglet Automatisation, puis touche +.',
    'Choisis « Heure de la journée » : 08:00, Quotidienne, et « Exécuter immédiatement ».',
    'Ajoute l’action « Texte » et colle la liste des citations.',
    'Ajoute « Diviser le texte », séparateur : Nouvelles lignes.',
    'Ajoute « Obtenir un élément de la liste » : Élément aléatoire.',
    'Ajoute « Afficher la notification » avec cet élément. Terminé.',
  ];
  return h('section', { class: 'card' },
    h('h2', null, 'Notifications (iPhone)'),
    h('p', { class: 'small muted' },
      'L’app ne peut pas t’envoyer de notifications elle-même. ',
      'C’est l’app Raccourcis de ton iPhone qui s’en charge, avec une automatisation. ',
      'Ça se règle une fois, en deux minutes.',
    ),
    h('h3', null, 'Une citation chaque matin'),
    h('ol', { class: 'set-steps' }, steps.map((s) => h('li', null, s))),
    h('button', {
      type: 'button',
      class: 'btn primary block',
      onclick: () => void copy(QUOTES_FOR_SHORTCUT, 'quotes', 'Citations copiées'),
    }, `Copier les ${QUOTES.length} citations`),
    fallbackBox('quotes'),
    h('h3', null, 'Un rappel le soir'),
    h('p', { class: 'small' },
      'Même chose avec une deuxième automatisation à 20:30, sans liste : juste « Afficher la notification » avec le texte « Pense à noter ta journée ».',
    ),
    h('h3', null, 'L’app sur ton écran d’accueil'),
    h('p', { class: 'small' }, 'Dans Safari : bouton Partager, puis « Sur l’écran d’accueil ».'),
  );
}

// ---------- cycle ----------

function saveCycle(patch: Partial<CycleSettings>) {
  const cycle: CycleSettings = { ...cycleSettings(store.profile), ...patch };
  if (cycle.pregnant && !cycle.pregnantSince) cycle.pregnantSince = today();
  if (!cycle.pregnant) delete cycle.pregnantSince;
  void store.saveProfile({ cycle });
}

/** Number input that saves on change when the value is within [min, max]. */
function cycleNum(value: number, min: number, max: number, onSave: (n: number) => void): HTMLInputElement {
  const input = h('input', { type: 'text', inputMode: 'numeric', autocomplete: 'off', value: String(value) });
  input.addEventListener('change', () => {
    const n = parseNum(input.value);
    if (n === undefined || n < min || n > max) {
      input.value = String(value);
      toast(`Entre ${min} et ${max} j`);
      return;
    }
    onSave(Math.round(n));
  });
  return input;
}

function cycleCard(): HTMLElement | null {
  const p = store.profile;
  if (p.sex === 'm') return null;
  const cs = cycleSettings(p);
  return h('section', { class: 'card' },
    h('h2', null, 'Cycle'),
    toggleRow('Suivre mon cycle', cs.tracking, (v) => saveCycle({ tracking: v })),
    cs.tracking
      ? [
          h('div', { class: 'grid-2' },
            field('Durée habituelle (j)', cycleNum(cs.avgLength, 18, 45, (n) => saveCycle({ avgLength: n })), 'entre 21 et 35 j est courant'),
            field('Phase lutéale (j)', cycleNum(cs.lutealLength, 9, 18, (n) => saveCycle({ lutealLength: n })), 'souvent 12 à 14 j ; laisse 14 si tu ne sais pas'),
          ),
          h('p', { class: 'small muted' }, 'Ta moyenne réelle remplace la durée dès que quelques règles sont notées. Les dates prévues restent des estimations.'),
          toggleRow('Essai bébé', cs.ttc, (v) => saveCycle({ ttc: v }), 'Déficit plus doux, fenêtre fertile mise en avant.'),
        ]
      : null,
    toggleRow('Mode grossesse', cs.pregnant, (v) => saveCycle({ pregnant: v }), 'Plus de déficit : on mange à l’équilibre.'),
    cs.pregnant ? h('p', { class: 'small muted' }, PREGNANCY_NOTE) : null,
  );
}

// ---------- backup ----------

const LAST_EXPORT_KEY = 'cap-maldives:lastExport';

function readLastExport(): string | null {
  try {
    const v = localStorage.getItem(LAST_EXPORT_KEY);
    return v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  } catch {
    return null;
  }
}

function markExported() {
  try { localStorage.setItem(LAST_EXPORT_KEY, today()); } catch { /* ignore */ }
  rerender?.();
}

/** Share sheet (iPhone: save to Files / iCloud) → download link → clipboard. */
async function exportBackup() {
  const json = store.exportJSON();
  const name = `cap-maldives-${today()}.json`;
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Sauvegarde Cap Maldives' });
      toast('Sauvegarde exportée');
      markExported();
      return;
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return; // closed the share sheet
    /* otherwise fall through to the download */
  }
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = h('a', { href: url, download: name, style: 'display:none' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast('Sauvegarde téléchargée');
    markExported();
    return;
  } catch { /* fall through to the clipboard */ }
  if (await copy(json, 'export', 'Sauvegarde copiée')) markExported();
}

function dataCard(): HTMLElement {
  const days = Object.keys(store.state.days).length;
  const last = readLastExport();
  const age = last ? daysBetween(last, today()) : null;
  const remind = days > 0 && (age === null || age > 14);
  return h('section', { class: 'card' },
    h('h2', null, 'Sauvegarde'),
    h('p', { class: 'small' }, 'Tes données restent sur ce téléphone. Pense à exporter une sauvegarde de temps en temps.'),
    h('p', { class: 'small muted' },
      `${days} jour${days > 1 ? 's' : ''} noté${days > 1 ? 's' : ''}, ${store.state.favorites.length} repas favori${store.state.favorites.length > 1 ? 's' : ''}. `,
      `Dernière sauvegarde : ${last ? fmtDayMonth(last) : 'pas encore'}.`,
    ),
    remind
      ? h('p', { class: 'small set-remind' }, last
          ? 'Ta dernière sauvegarde date de plus de deux semaines : un petit export te met à l’abri.'
          : 'Un premier export te met à l’abri si tu changes de téléphone.')
      : null,
    h('div', { class: 'grid-2' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => void exportBackup() }, 'Exporter'),
      h('button', { type: 'button', class: 'btn', onclick: openImport }, 'Importer'),
    ),
    h('button', {
      type: 'button',
      class: 'btn ghost sm',
      style: 'align-self:flex-start',
      onclick: () => void copy(store.exportJSON(), 'export', 'Sauvegarde copiée').then((ok) => { if (ok) markExported(); }),
    }, 'Copier le texte à la place'),
    fallbackBox('export'),
    h('p', { class: 'small muted' }, 'Sur iPhone, depuis l’écran d’accueil : « Enregistrer dans Fichiers » pour la garder sur iCloud.'),
  );
}

function openImport() {
  const ta = h('textarea', { class: 'input set-copy', placeholder: 'Colle ici ta sauvegarde JSON', 'aria-label': 'Sauvegarde JSON' });
  const error = h('p', { class: 'small tone-bad', role: 'alert' });
  let armed = false;
  const btn = h('button', { type: 'button', class: 'btn primary block' }, 'Importer');
  const disarm = () => { armed = false; btn.textContent = 'Importer'; };
  ta.addEventListener('input', disarm);

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      ta.value = await f.text();
      disarm();
      error.textContent = '';
      toast('Fichier chargé : vérifie puis importe');
    } catch {
      error.textContent = 'Impossible de lire ce fichier.';
    }
  });
  const pick = h('button', { type: 'button', class: 'btn block', onclick: () => fileInput.click() }, 'Choisir un fichier .json');

  btn.addEventListener('click', async () => {
    const text = ta.value.trim();
    if (!text) { error.textContent = 'Choisis un fichier ou colle ta sauvegarde.'; return; }
    try { JSON.parse(text); } catch { error.textContent = 'Ce texte n’est pas un JSON valide.'; return; }
    if (!armed) {
      armed = true;
      error.textContent = '';
      btn.textContent = 'Confirmer : remplacer mes données';
      return;
    }
    try {
      await store.importJSON(text);
      sheet.close();
      toast('Données importées');
    } catch (e) {
      disarm();
      error.textContent = e instanceof Error ? e.message : 'Import impossible.';
    }
  });
  const sheet = openSheet('Importer', h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, 'Tes données actuelles seront remplacées par la sauvegarde.'),
    pick,
    h('p', { class: 'small muted' }, 'Ou colle le texte :'),
    ta,
    error,
    btn,
    fileInput,
  ));
}

function soonCard(): HTMLElement {
  const items: [string, string][] = [
    ['Garmin', 'Tes séances importées toutes seules, via Strava ou un export.'],
    ['Balance via Apple Santé', 'Ton poids récupéré sans le recopier.'],
    ['Notifications push', 'Des rappels directement depuis l’app, sans Raccourcis.'],
    ['Lecture photo par IA', 'Optionnelle, avec une clé personnelle.'],
  ];
  return h('section', { class: 'card flat' },
    h('h2', null, 'Bientôt'),
    h('div', { class: 'list' },
      items.map(([title, sub]) =>
        h('div', { class: 'list-row' },
          h('div', { class: 'main muted' },
            h('div', { class: 'title' }, title),
            h('div', { class: 'sub' }, sub),
          ),
        ),
      ),
    ),
  );
}

function themeCard(): HTMLElement {
  return h('section', { class: 'card' },
    h('h2', null, 'Thème'),
    segmented<Theme>(
      [{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }],
      theme,
      (v) => { setTheme(v); rerender?.(); },
    ),
  );
}

export const renderSettings: Screen = (root, ctx) => {
  const page = h('div', { class: 'stack' });
  rerender = () => {
    // Only if the Plus screen is still the one on display.
    if (!page.isConnected) return;
    root.replaceChildren();
    renderSettings(root, ctx);
  };
  page.append(
    h('header', { class: 'screen-head' }, h('h1', null, 'Plus')),
    profileCard(),
    cycleCard() ?? '',
    dataCard(),
    notificationsCard(),
    soonCard(),
    themeCard(),
  );
  root.append(page);
};
