// Équilibre → REVENIR À MOI: the journey's home. Not started: the invite (start flow).
// Started: day N/60, chapter progress, days réussies, gentle streak (jokers count),
// jokers left, then "Mes pages" (answers by chapter), "Mes engagements" (rules
// settings) and "Faire mon reset".

import { store } from '../store';
import { h, sectionTitle, keyBubble, bar, infoRow, ICON } from '../lib/ui';
import { fmtDayMonth, today } from '../lib/dates';
import {
  JOURNEY_DAYS, CHAPTER_DAYS, journeyOf, journeyStatus, journeyStats, chapterInfo, rulesOn, ruleDef, resetSunday, resetDone,
} from '../lib/journey';
import { openJourneyStart, openJournalSheet, openRulesSheet } from './journey';
import { openSundayReset } from './sunday-reset';

export function journeySection(date: string = today()): HTMLElement[] {
  return [sectionTitle('Revenir à moi'), journeyCard(date)];
}

function stat(value: string, label: string): HTMLElement {
  return h('div', { class: 'coach-stat' }, h('span', { class: 'coach-stat-v num' }, value), h('span', { class: 'coach-stat-l' }, label));
}

function journeyCard(date: string): HTMLElement {
  const p = store.profile;
  const st = journeyStatus(date, p);
  const j = journeyOf(p);

  if (st === 'none' || !j) {
    return h('section', { class: 'card ux solo jr-card jr-invite paper' },
      h('span', { class: 'eyebrow' }, '60 jours · 5 min par jour'),
      h('h3', { class: 'jr-title' }, 'Te retrouver, toi'),
      h('ul', { class: 'jr-lines' },
        h('li', null, 'Ton énergie et tes besoins, chaque matin en 30 secondes.'),
        h('li', null, '5 engagements doux, pensés pour les journées pleines.'),
        h('li', null, 'Une question pour toi le soir, et un reset le dimanche.'),
      ),
      h('button', { class: 'btn primary block bal-big', type: 'button', onclick: () => openJourneyStart() }, 'Découvrir le parcours'),
    );
  }

  const rules = rulesOn(date, p);
  const rulesRow = infoRow({
    icon: ICON.leaf,
    title: 'Mes engagements',
    detail: rules.map((k) => ruleDef(k)?.label ?? k).join(' · '),
    onClick: () => openRulesSheet(),
  });

  if (st === 'upcoming') {
    return h('section', { class: 'card ux solo jr-card' },
      h('span', { class: 'eyebrow' }, 'Revenir à moi'),
      h('p', { class: 'small' }, `Ton parcours commence le ${fmtDayMonth(j.startDate)}. Jusque-là, rien à faire.`),
      rulesRow,
    );
  }

  const s = journeyStats(date)!;
  const ch = chapterInfo(s.chapter);
  const sunday = resetSunday(date);
  const pct = s.ratio === null ? '—' : `${Math.round(s.ratio * 100)}\u00a0%`;

  return h('section', { class: 'card ux solo jr-card jr-home' },
    h('div', { class: 'jr-home-top' },
      keyBubble(String(s.day), `/${JOURNEY_DAYS}`, st === 'done' ? 'terminé' : 'jours'),
      h('div', { class: 'stack', style: 'gap:2px' },
        h('span', { class: 'eyebrow' }, st === 'done' ? 'Parcours terminé' : `Chapitre ${s.chapter} · jour ${s.dayInChapter}/${CHAPTER_DAYS}`),
        h('h3', { class: 'jr-title' }, st === 'done' ? 'Tu l’as fait, pour toi.' : ch.title),
        st !== 'done' && ch.subtitle ? h('p', { class: 'italic jr-sub' }, ch.subtitle) : null,
      ),
    ),
    st !== 'done' ? bar(s.dayInChapter / CHAPTER_DAYS) : null,
    h('div', { class: 'coach-stats' },
      stat(`${s.success}`, `jour${s.success > 1 ? 's' : ''} réussi${s.success > 1 ? 's' : ''} · ${pct}`),
      stat(String(s.streak), 'jours de suite'),
      stat(String(s.jokersLeft), `joker${s.jokersLeft > 1 ? 's' : ''} restant${s.jokersLeft > 1 ? 's' : ''}`),
    ),
    h('p', { class: 'small muted', style: 'text-align:center' }, 'Un jour raté ne remet rien à zéro. Les jokers comptent dans ta série.'),
    infoRow({ icon: ICON.heart, title: 'Mes pages', detail: `${s.answered} réponse${s.answered > 1 ? 's' : ''}, par chapitre`, onClick: () => openJournalSheet() }),
    rulesRow,
    h('button', { class: 'btn block', type: 'button', style: 'margin-bottom:14px', onclick: () => openSundayReset(date) },
      resetDone(sunday) ? 'Revoir mon reset de la semaine' : 'Faire mon reset'),
    st === 'done'
      ? h('button', { class: 'dc-link', style: 'align-self:center;margin-bottom:12px', type: 'button', onclick: () => openJourneyStart() }, 'Recommencer un parcours')
      : null,
  );
}
