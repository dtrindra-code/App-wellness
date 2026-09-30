import WIDGET_SCRIPT from '../../docs/widget/citation.js?raw';
// "Plus" screen, in sections of info rows: TON PROFIL · TON CYCLE · TES DONNÉES · NOTIFICATIONS (web push) ·
// APPARENCE · BIENTÔT. Long explanations are folded.

import type { Screen } from './types';
import type { CycleSettings } from '../types';
import type { Child } from '../lib/ui';
import {
  h, screenTitle, field, openSheet, parseNum, segmented, toast, fmtInt, fmtKg,
  sectionTitle, actionLink, infoRow, disclosure, ICON,
} from '../lib/ui';
import { store } from '../store';
import { fmtDayMonth, today } from '../lib/dates';
import { targets, phaseOn } from '../lib/nutrition';
import { PREGNANCY_NOTE, adviceFor, cycleOn, cycleSettings } from '../lib/cycle';
import { QUOTES, QUOTES_FOR_SHORTCUT } from '../data/quotes';
import { openProfileEditor, toggleRow } from './onboarding';
import {
  BackupExistsError, backupReminderDue, disableSync, onSyncStatus, pushNow, readLastExport, readSyncConfig,
  restoreFromRemote, restoreSync, setupSync, syncStatus,
} from '../lib/sync';
import {
  PUSH_SLOTS, currentSubscription, enablePush, pushStatus, savedSubscription, testNotification,
} from '../lib/notify';

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

type CopyKey = 'quotes' | 'export' | 'push' | 'widget';

/** Text shown in a selectable textarea when the clipboard is refused. */
let fallback: { key: CopyKey; text: string } | null = null;
let rerender: (() => void) | null = null;

/** Copy to the clipboard; true when it worked (else a selectable box is shown). */
async function copy(text: string, key: CopyKey, okMsg: string): Promise<boolean> {
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

function fallbackBox(key: CopyKey): HTMLElement | null {
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

  return h('section', { class: 'card ux' },
    infoRow({
      icon: ICON.heart,
      title: 'Mes infos',
      detail: !p.sex || !p.age ? `${bits.join(' · ')}. Ajoute ton sexe et ton âge pour des calories plus justes.` : bits.join(' · '),
    }),
    infoRow({ icon: ICON.fork, title: h('span', { class: 'num' }, `${fmtInt(t.kcal)} kcal`), detail: `Cible du jour · ${phase.label}` }),
    infoRow({ icon: ICON.sun, title: h('span', { class: 'num' }, `${fmtInt(t.maintenance)} kcal`), detail: 'Maintien estimé' }),
    disclosure('Comment c’est calculé', () => h('p', { class: 'small muted' },
      cs.pregnant
        ? 'Mode grossesse : la cible est ton maintien estimé, sans déficit.'
        : `Mifflin-St Jeor × ton activité, moins un déficit selon la phase. Jamais sous ${fmtInt(t.floor)} kcal (le plus haut entre ${cs.ttc ? '1 400' : '1 200'} et ton métabolisme de base). Ce sont des estimations.`,
    ), 'set-calc'),
    actionLink('Modifier mon profil', () => openProfileEditor()),
  );
}

// ---------- notifications ----------

/** Push UI state (module-level: the screen re-renders from scratch). */
const push: { sub: string | null; busy: boolean; error: string | null; checked: boolean } = {
  sub: savedSubscription(),
  busy: false,
  error: null,
  checked: false,
};

/** Once per session: pick up a subscription the browser already has. */
function checkSubscription() {
  if (push.checked) return;
  push.checked = true;
  void currentSubscription().then((json) => {
    if (json && json !== push.sub) { push.sub = json; rerender?.(); }
  });
}

async function onEnablePush() {
  if (push.busy) return;
  push.busy = true;
  push.error = null;
  rerender?.();
  try {
    push.sub = await enablePush();
    toast('Notifications activées');
  } catch (e) {
    push.error = e instanceof Error ? e.message : 'Activation impossible.';
  }
  push.busy = false;
  rerender?.();
}

async function onTestPush() {
  try {
    await testNotification();
    toast('Notification envoyée');
  } catch (e) {
    push.error = e instanceof Error ? e.message : 'Test impossible.';
    rerender?.();
  }
}

function pushStatusRows(): HTMLElement[] {
  const st = pushStatus();
  const yes = (ok: boolean, a: string, b: string) => (ok ? a : b);
  const perm = st.permission === 'granted' ? 'autorisées'
    : st.permission === 'denied' ? 'refusées (Réglages iPhone → Notifications → Cap)'
    : st.permission === 'default' ? 'pas encore demandées' : 'non gérées ici';
  return [
    infoRow({
      icon: ICON.plane,
      title: yes(st.installed, 'App sur l’écran d’accueil', 'Pas encore sur l’écran d’accueil'),
      detail: yes(st.installed, 'Parfait, c’est là que les notifications marchent.', 'Dans Safari : Partager, puis « Sur l’écran d’accueil ». Ouvre ensuite l’app depuis son icône.'),
    }),
    infoRow({
      icon: ICON.spark,
      title: yes(st.supported, 'Notifications prises en charge', 'Notifications non prises en charge ici'),
      detail: yes(st.supported, `Permission : ${perm}`, 'Il faut l’app installée sur l’écran d’accueil, avec iOS 16.4 ou plus.'),
    }),
  ];
}

function pushGuide(json: string): HTMLElement {
  const steps = [
    'Touche « Copier » ci-dessous.',
    'Sur GitHub, ouvre le dépôt de l’app, puis Settings.',
    'Menu Secrets and variables → Actions.',
    'New repository secret : nom PUSH_SUBSCRIPTION, valeur : colle le texte copié. Add secret.',
    'Le secret VAPID_PRIVATE_KEY t’est donné à part : ajoute-le de la même façon.',
    'Onglet Actions → Notifications push → Run workflow pour tester tout de suite.',
  ];
  return h('div', { class: 'stack push-guide' },
    h('p', { class: 'small muted' }, 'Dernière étape, une seule fois : donner ton adresse de notification à GitHub, qui t’enverra les petits signaux aux bonnes heures.'),
    h('pre', { class: 'push-json', 'aria-label': 'Abonnement aux notifications' }, json),
    h('button', { type: 'button', class: 'btn primary block', onclick: () => void copy(json, 'push', 'Abonnement copié') }, 'Copier'),
    fallbackBox('push'),
    h('ol', { class: 'set-steps' }, steps.map((st) => h('li', null, st))),
  );
}

function shortcutsGuide(): Child[] {
  const steps = [
    'Ouvre l’app Raccourcis, onglet Automatisation, puis touche +.',
    'Choisis « Heure de la journée » : 08:00, Quotidienne, et « Exécuter immédiatement ».',
    'Ajoute l’action « Texte » et colle la liste des citations.',
    'Ajoute « Diviser le texte », séparateur : Nouvelles lignes.',
    'Ajoute « Obtenir un élément de la liste » : Élément aléatoire.',
    'Ajoute « Afficher la notification » avec cet élément. Terminé.',
  ];
  return [
    h('p', { class: 'small muted' }, 'Sans GitHub, l’app Raccourcis de ton iPhone peut t’afficher une citation chaque matin et un rappel le soir.'),
    h('ol', { class: 'set-steps' }, steps.map((st) => h('li', null, st))),
    h('button', {
      type: 'button',
      class: 'btn block',
      onclick: () => void copy(QUOTES_FOR_SHORTCUT, 'quotes', 'Citations copiées'),
    }, `Copier les ${QUOTES.length} citations`),
    fallbackBox('quotes'),
    h('p', { class: 'small muted' }, 'Pour le soir : une 2e automatisation à 20:30, « Afficher la notification » avec « Pense à noter ta journée ».'),
  ];
}

function notificationsCard(): HTMLElement {
  checkSubscription();
  const st = pushStatus();
  const granted = st.permission === 'granted';
  const moments = PUSH_SLOTS.map((m) => m.label).join(' · ');
  return h('section', { class: 'card ux solo' },
    h('p', { class: 'small muted' },
      'Des petits messages pensés pour ta journée : ton sommeil, ton cycle, tes séances, et un mot doux les jours plus durs. Ils sont préparés sur ton téléphone : rien de personnel ne sort.',
    ),
    infoRow({ icon: ICON.sun, title: '5 moments', detail: moments }),
    ...pushStatusRows(),
    h('button', {
      type: 'button',
      class: 'btn primary block push-cta',
      disabled: push.busy,
      onclick: () => void onEnablePush(),
    }, push.busy ? 'Activation…' : push.sub && granted ? 'Réactiver les notifications' : 'Activer les notifications'),
    !st.installed || !st.supported
      ? h('p', { class: 'small muted' }, 'Ça ne marche que depuis l’app installée sur l’écran d’accueil, avec iOS 16.4 ou plus.')
      : null,
    push.error ? h('p', { class: 'small tone-bad', role: 'alert' }, push.error) : null,
    granted
      ? h('button', { type: 'button', class: 'btn block', onclick: () => void onTestPush() }, 'Tester une notif')
      : null,
    push.sub ? pushGuide(push.sub) : null,
    disclosure('Alternative : Raccourcis iPhone', () => shortcutsGuide(), 'set-notif'),
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
  return h('section', { class: 'card ux solo' },
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

// ---------- automatic encrypted backup (lib/sync) ----------

/** Form + confirmation state (module-level: the screen re-renders from scratch). */
const sync = {
  token: '',
  pass: '',
  pass2: '',
  busy: '' as '' | 'setup' | 'restore' | 'push' | 'remote',
  error: null as string | null,
  /** Date of an existing backup found during setup: second tap creates a new one. */
  existsAt: null as string | null,
  armRestore: false,
  armOff: false,
};

// Status changes (upload started/finished) refresh the Plus screen, unless she is typing.
onSyncStatus(() => {
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA/.test(a.tagName)) return;
  rerender?.();
});

const fmtWhen = (iso: string, todayWord = '') => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return day === today() ? `${todayWord}à ${time}` : `le ${fmtDayMonth(day)} à ${time}`;
};

async function runSync(kind: typeof sync.busy, fn: () => Promise<void>, ok: string) {
  if (sync.busy) return;
  sync.busy = kind;
  sync.error = null;
  rerender?.();
  try {
    await fn();
    sync.token = sync.pass = sync.pass2 = '';
    sync.existsAt = null;
    toast(ok);
  } catch (e) {
    if (e instanceof BackupExistsError) sync.existsAt = e.updatedAt;
    else sync.error = e instanceof Error ? e.message : 'Ça n’a pas marché.';
  }
  sync.busy = '';
  sync.armRestore = sync.armOff = false;
  rerender?.();
}

function onActivate() {
  if (!sync.token.trim()) { sync.error = 'Colle d’abord ton code GitHub.'; rerender?.(); return; }
  if (sync.pass.length < 8) { sync.error = 'Le mot de passe doit faire au moins 8 caractères.'; rerender?.(); return; }
  if (sync.pass !== sync.pass2) { sync.error = 'Les deux mots de passe ne sont pas pareils.'; rerender?.(); return; }
  const createNew = sync.existsAt !== null;
  void runSync('setup', () => setupSync(sync.token, sync.pass, { createNew }), 'Sauvegarde automatique activée');
}

function onRestoreExisting() {
  if (!sync.token.trim() || !sync.pass) { sync.error = 'Colle ton code GitHub et tape ton mot de passe de sauvegarde.'; rerender?.(); return; }
  void runSync('restore', () => restoreSync(sync.token, sync.pass), 'Données restaurées');
}

function syncInput(key: 'token' | 'pass' | 'pass2', label: string, placeholder: string, hint?: string): HTMLElement {
  const input = h('input', {
    type: 'password', value: sync[key], placeholder, autocomplete: key === 'token' ? 'off' : 'new-password',
    autocapitalize: 'off', spellcheck: false,
  });
  input.setAttribute('autocorrect', 'off');
  input.addEventListener('input', () => { sync[key] = input.value; sync.existsAt = null; });
  return field(label, input, hint);
}

function syncSetupCard(): HTMLElement {
  const steps = [
    'Sur github.com, touche ta photo de profil, puis Settings.',
    'Tout en bas : Developer settings → Personal access tokens → Fine-grained tokens.',
    'Generate new token. Nom : « Cap Maldives ». Expiration : « No expiration » (ou la plus longue proposée).',
    'Account permissions → Gists → Read and write.',
    'Generate token, puis copie le code affiché (il commence par github_pat_).',
  ];
  return h('section', { class: 'card ux solo sync-card' },
    h('h3', null, 'Sauvegarde automatique'),
    h('p', { class: 'small' },
      'Chaque changement est sauvegardé tout seul, chiffré, dans un espace privé de ton compte GitHub. ',
      'Sans ton mot de passe, personne d’autre ne peut la lire, même pas GitHub. Si tu supprimes l’app, tu retrouves tout.'),
    disclosure('Créer ton code GitHub (2 min)', () => [
      h('ol', { class: 'set-steps' }, steps.map((t) => h('li', null, t))),
      h('p', { class: 'small muted' }, 'Autre possibilité : « Tokens (classic) » avec seulement la case « gist » cochée.'),
    ], 'set-sync-steps'),
    syncInput('token', 'Code GitHub', 'github_pat_…'),
    syncInput('pass', 'Mot de passe de sauvegarde', '8 caractères minimum'),
    syncInput('pass2', 'Confirme le mot de passe', 'Le même', 'Pas besoin de confirmer pour restaurer.'),
    h('p', { class: 'small set-remind' },
      'Garde ce mot de passe et le code dans ton trousseau iCloud ou dans Notes : sans eux, impossible de récupérer la sauvegarde.'),
    sync.existsAt
      ? h('p', { class: 'small sync-warn', role: 'alert' },
          `Une sauvegarde existe déjà sur ton GitHub (${fmtWhen(sync.existsAt, 'aujourd’hui ')}). Si tu viens de réinstaller l’app, touche « Restaurer une sauvegarde existante ». `,
          'Sinon, touche encore « Activer » pour en créer une nouvelle à côté.')
      : null,
    sync.error ? h('p', { class: 'small tone-bad', role: 'alert' }, sync.error) : null,
    h('button', { type: 'button', class: 'btn primary block', disabled: !!sync.busy, onclick: onActivate },
      sync.busy === 'setup' ? 'Activation…' : sync.existsAt ? 'Activer quand même (nouvelle sauvegarde)' : 'Activer la sauvegarde'),
    h('button', { type: 'button', class: 'btn block', disabled: !!sync.busy, onclick: onRestoreExisting },
      sync.busy === 'restore' ? 'Restauration…' : 'Restaurer une sauvegarde existante'),
  );
}

function syncOnCard(): HTMLElement {
  const st = syncStatus();
  const last = st.lastPush ?? readSyncConfig()?.lastPush;
  const title = st.state === 'syncing' ? 'Sauvegarde…'
    : st.state === 'error' ? 'Sauvegarde en attente'
    : last ? `Sauvegardé ${fmtWhen(last)}` : 'Sauvegarde activée';
  const detail = st.state === 'error' ? st.message ?? 'Nouvel essai bientôt.'
    : 'Automatique et chiffrée, dans un Gist secret de ton GitHub.';
  return h('section', { class: 'card ux solo sync-card' },
    h('h3', null, 'Sauvegarde automatique'),
    infoRow({ icon: ICON.cycle, title, detail, cls: st.state === 'error' ? 'sync-err' : '' }),
    st.remoteNewer
      ? h('div', { class: 'stack sync-newer' },
          h('p', { class: 'small' }, `Une sauvegarde plus récente existe (${fmtWhen(st.remoteNewer, 'aujourd’hui ')}), faite depuis un autre appareil. En attendant ton choix, rien n’est écrasé.`),
          h('button', {
            type: 'button', class: 'btn primary block', disabled: !!sync.busy,
            onclick: () => void runSync('remote', restoreFromRemote, 'Données restaurées'),
          }, sync.busy === 'remote' ? 'Restauration…' : 'Restaurer'),
        )
      : null,
    sync.error ? h('p', { class: 'small tone-bad', role: 'alert' }, sync.error) : null,
    h('button', {
      type: 'button', class: 'btn primary block', disabled: !!sync.busy || st.state === 'syncing',
      onclick: () => void runSync('push', async () => {
        await pushNow({ force: true });
        const after = syncStatus();
        if (after.state === 'error') throw new Error(after.message);
      }, 'Sauvegardé'),
    }, sync.busy === 'push' || st.state === 'syncing' ? 'Sauvegarde…' : 'Sauvegarder maintenant'),
    h('div', { class: 'grid-2' },
      h('button', {
        type: 'button', class: 'btn', disabled: !!sync.busy,
        onclick: () => {
          if (!sync.armRestore) { sync.armRestore = true; sync.armOff = false; rerender?.(); return; }
          void runSync('remote', restoreFromRemote, 'Données restaurées');
        },
      }, sync.busy === 'remote' ? 'Restauration…' : sync.armRestore ? 'Confirmer : remplacer' : 'Restaurer depuis GitHub'),
      h('button', {
        type: 'button', class: 'btn danger', disabled: !!sync.busy,
        onclick: () => {
          if (!sync.armOff) { sync.armOff = true; sync.armRestore = false; rerender?.(); return; }
          sync.armOff = false;
          disableSync();
          toast('Sauvegarde désactivée sur ce téléphone');
        },
      }, sync.armOff ? 'Confirmer' : 'Désactiver sur ce téléphone'),
    ),
    sync.armRestore ? h('p', { class: 'small muted' }, 'Tes données de ce téléphone seront remplacées par la sauvegarde.') : null,
    sync.armOff ? h('p', { class: 'small muted' }, 'Le code et la clé sont oubliés ici. La sauvegarde reste sur ton GitHub.') : null,
  );
}

/** Weekly nudge (sync off, no export for 7 days) + the sync card. */
function syncCards(): HTMLElement[] {
  const on = readSyncConfig() !== null;
  const nudge = !on && backupReminderDue()
    ? h('section', { class: 'card accent ux solo sync-remind' },
        h('p', { class: 'small' }, readLastExport()
          ? 'Ta dernière sauvegarde date de plus d’une semaine. Active la sauvegarde automatique : tu n’auras plus à y penser.'
          : 'Si tu supprimes l’app de l’écran d’accueil, l’iPhone efface tes données. La sauvegarde automatique ci-dessous les met à l’abri.'))
    : null;
  return [...(nudge ? [nudge] : []), on ? syncOnCard() : syncSetupCard()];
}

function dataCard(): HTMLElement {
  const days = Object.keys(store.state.days).length;
  const last = readLastExport();
  return h('section', { class: 'card ux solo' },
    infoRow({
      icon: ICON.battery,
      title: `${days} jour${days > 1 ? 's' : ''} noté${days > 1 ? 's' : ''} · ${store.state.favorites.length} favori${store.state.favorites.length > 1 ? 's' : ''}`,
      detail: `Dernier export : ${last ? fmtDayMonth(last) : 'pas encore'}`,
    }),
    h('p', { class: 'small muted' }, readSyncConfig()
      ? 'En plus de la sauvegarde automatique, tu peux garder un fichier dans Fichiers ou iCloud.'
      : 'Sans sauvegarde automatique, tes données restent seulement sur ce téléphone : exporte un fichier de temps en temps.'),
    h('div', { class: 'grid-2' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => void exportBackup() }, 'Exporter'),
      h('button', { type: 'button', class: 'btn', onclick: openImport }, 'Importer'),
    ),
    disclosure('Autres options', () => [
      h('button', {
        type: 'button',
        class: 'btn block',
        onclick: () => void copy(store.exportJSON(), 'export', 'Sauvegarde copiée').then((ok) => { if (ok) markExported(); }),
      }, 'Copier le texte à la place'),
      h('p', { class: 'small muted' }, 'Sur iPhone, depuis l’écran d’accueil : « Enregistrer dans Fichiers » pour la garder sur iCloud.'),
    ], 'set-data'),
    fallbackBox('export'),
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

function widgetCard(): HTMLElement {
  const steps = [
    'Installe l’app gratuite « Scriptable » depuis l’App Store.',
    'Touche « Copier le script » ci-dessous.',
    'Dans Scriptable : + en haut à droite, colle, puis nomme le script « Citation ».',
    'Écran verrouillé : reste appuyée → Personnaliser → Écran verrouillé → touche la zone des widgets → Scriptable.',
    'Touche le widget ajouté → Script : « Citation ». Même chose possible sur l’écran d’accueil.',
  ];
  return h('section', { class: 'card ux solo' },
    h('p', { class: 'small muted' }, 'La citation du jour sur ton écran verrouillé, la même que dans l’app. Elle change chaque nuit.'),
    h('ol', { class: 'small', style: 'margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px' }, steps.map((t) => h('li', null, t))),
    h('button', { type: 'button', class: 'btn primary block', onclick: () => void copy(WIDGET_SCRIPT, 'widget', 'Script copié') }, 'Copier le script'),
    fallbackBox('widget'),
  );
}

function soonCard(): HTMLElement {
  const items: [string, string][] = [
    ['Garmin', 'Tes séances importées toutes seules, via Strava ou un export.'],
    ['Balance via Apple Santé', 'Ton poids récupéré sans le recopier.'],
    ['Lecture photo par IA', 'Optionnelle, avec une clé personnelle.'],
  ];
  return h('section', { class: 'card ux solo flat set-soon' },
    items.map(([title, sub]) => infoRow({ icon: ICON.spark, title, detail: sub })),
  );
}

function themeCard(): HTMLElement {
  return h('section', { class: 'card ux solo' },
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
  const cycle = cycleCard();
  page.append(
    h('header', { class: 'screen-head' }, screenTitle('Plus')),
    sectionTitle('Ton profil'),
    profileCard(),
    ...(cycle ? [sectionTitle('Ton cycle'), cycle] : []),
    sectionTitle('Tes données'),
    ...syncCards(),
    dataCard(),
    sectionTitle('Notifications'),
    notificationsCard(),
    sectionTitle('Widget citation'),
    widgetCard(),
    sectionTitle('Apparence'),
    themeCard(),
    sectionTitle('Bientôt'),
    soonCard(),
  );
  root.append(page);
};
