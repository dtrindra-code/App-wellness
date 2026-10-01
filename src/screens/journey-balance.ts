// Équilibre → REVENIR À MOI: the journey's home. One ink card (Jour n/60, the chapter,
// three plain numbers, the garden map "Ton parcours en un coup d'œil"), then cream rows
// on hairlines: Mon point de départ, Mes pages, Ma roue de vie, Mes engagements,
// À relire, Ce que disent les études, and "Faire mon reset".
// Not started: the ink card invites (and the map shows every seed waiting).

import { store } from '../store';
import { h, sectionTitle, infoRow, ICON } from '../lib/ui';
import { fmtDayMonth, today } from '../lib/dates';
import {
  JOURNEY_DAYS, CHAPTER_DAYS, journeyOf, journeyStatus, journeyStats, chapterInfo, rulesOn, resetSunday, resetDone,
  checkpointDone, wheelsNowAndStart,
} from '../lib/journey';
import { openJourneyStart, openJournalSheet, openRulesSheet } from './journey';
import { openSundayReset } from './sunday-reset';
import { openCheckpoint, openJourneyRecap, openWheelSheet } from './journal-checkpoints';
import { openRereadSheet, openScienceSheet } from './journal-science';
import { gardenCompact } from './journal-garden';

export function journeySection(date: string = today()): HTMLElement[] {
  return [sectionTitle('Revenir à moi'), ...journeyBlock(date)];
}

function num(value: string, label: string): HTMLElement {
  return h('div', { class: 'jr-num' }, h('span', { class: 'jr-num-v num' }, value), h('span', { class: 'jr-num-l' }, label));
}

function journeyBlock(date: string): HTMLElement[] {
  const p = store.profile;
  const st = journeyStatus(date, p);
  const j = journeyOf(p);

  if (st === 'none' || !j) {
    return [
      h('section', { class: 'jr-home', 'aria-label': 'Revenir à moi' },
        h('span', { class: 'jr-home-eyebrow' }, '60 jours · 5 min par jour'),
        h('h3', { class: 'jr-home-title' }, 'Te retrouver, toi'),
        h('p', { class: 'jr-home-sub' }, 'Chaque jour une graine, chaque semaine une pousse : 60 jours pour cultiver ton jardin intérieur.'),
        gardenCompact(date),
        h('button', { class: 'btn jr-home-btn', type: 'button', onclick: () => openJourneyStart() }, 'Découvrir le parcours'),
      ),
      h('div', { class: 'row-list jr-home-rows' },
        infoRow({ icon: ICON.leaf, title: 'Ce que disent les études', detail: 'Pourquoi écrire quelques minutes fait du bien', onClick: () => openScienceSheet() })),
    ];
  }

  const rules = rulesOn(date, p);
  const rulesRow = infoRow({
    icon: ICON.leaf,
    title: 'Mes engagements',
    detail: `${rules.length} engagement${rules.length > 1 ? 's' : ''} chaque jour · les revoir`,
    onClick: () => openRulesSheet(),
  });

  if (st === 'upcoming') {
    return [
      h('section', { class: 'jr-home', 'aria-label': 'Revenir à moi' },
        h('span', { class: 'jr-home-eyebrow' }, 'Revenir à moi'),
        h('h3', { class: 'jr-home-title' }, `Ça commence le ${fmtDayMonth(j.startDate)}`),
        h('p', { class: 'jr-home-sub' }, 'Jusque-là, rien à faire. Ton point de départ peut se remplir dès maintenant.'),
        gardenCompact(date),
      ),
      h('div', { class: 'row-list jr-home-rows' }, baselineRow(), rulesRow, ...readingRows()),
    ];
  }

  const s = journeyStats(date)!;
  const ch = chapterInfo(s.chapter);
  const sunday = resetSunday(date);
  const done = st === 'done';

  return [
    h('section', { class: 'jr-home', 'aria-label': 'Revenir à moi' },
      h('span', { class: 'jr-home-eyebrow' }, done ? 'Parcours terminé' : `Jour ${s.day}/${JOURNEY_DAYS}`),
      h('h3', { class: 'jr-home-title' }, done ? 'Tu l’as fait, pour toi.' : `Chapitre ${s.chapter} · ${ch.title}`),
      h('p', { class: 'jr-home-sub' }, done ? 'Ce n’est pas une fin : c’est ton nouveau point de départ.' : `${ch.subtitle} · jour ${s.dayInChapter}/${CHAPTER_DAYS}`),
      h('div', { class: 'jr-nums' },
        num(String(s.success), `jour${s.success > 1 ? 's' : ''} en fleur`),
        num(String(s.streak), 'de suite'),
        num(String(s.jokersLeft), `joker${s.jokersLeft > 1 ? 's' : ''}`)),
      gardenCompact(date),
    ),
    h('div', { class: 'row-list jr-home-rows' },
      checkpointDone('60')
        ? infoRow({ icon: ICON.spark, title: 'Mon chemin', detail: 'Ton bilan des 60 jours, avant et après', onClick: () => openJourneyRecap() })
        : null,
      baselineRow(),
      infoRow({ icon: ICON.heart, title: 'Mes pages', detail: `${s.answered} page${s.answered > 1 ? 's' : ''} gardée${s.answered > 1 ? 's' : ''}, par chapitre`, onClick: () => openJournalSheet() }),
      wheelRow(),
      rulesRow,
      ...readingRows(),
    ),
    h('p', { class: 'jr-home-note' }, 'Un jour sans fleur ne remet rien à zéro. Les jokers comptent dans ta série.'),
    h('button', { class: 'btn block jr-reset-btn', type: 'button', onclick: () => openSundayReset(date) },
      resetDone(sunday) ? 'Revoir mon reset de la semaine' : 'Faire mon reset'),
    ...(done ? [h('button', { class: 'jr-entry-link', type: 'button', onclick: () => openJourneyStart() }, 'Recommencer un parcours')] : []),
  ];
}

function baselineRow(): HTMLElement {
  const done = checkpointDone('0');
  return infoRow({
    icon: ICON.spark, title: 'Mon point de départ',
    badge: done ? undefined : 'à faire',
    detail: done ? 'Tes repères du jour 0 : relire ou ajuster' : '3 minutes : ta roue de vie, ce que tu espères, ce que tu veux cultiver',
    onClick: () => openCheckpoint('0'),
  });
}

function wheelRow(): HTMLElement {
  const { start, now, nowKey } = wheelsNowAndStart();
  return infoRow({
    icon: ICON.cycle, title: 'Ma roue de vie',
    detail: now && start ? `Jour ${nowKey} et départ, côte à côte` : start ? 'Ton départ ; on la revoit au jour 30' : 'Pas encore remplie',
    onClick: () => openWheelSheet(),
  });
}

function readingRows(): HTMLElement[] {
  return [
    infoRow({ icon: ICON.heart, title: 'À relire', detail: 'Les cartes « À relire quand ça monte »', onClick: () => openRereadSheet() }),
    infoRow({ icon: ICON.leaf, title: 'Ce que disent les études', detail: 'Pourquoi écrire quelques minutes fait du bien', onClick: () => openScienceSheet() }),
  ];
}
