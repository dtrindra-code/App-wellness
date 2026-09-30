// Rules-based coach (no AI, no network): picks warm, contextual messages from the
// user's own data. Filled by the coach agent — keep these signatures.
import type { AppState } from '../types';

export type CoachSlot = 'matin' | 'midi' | 'aprem' | 'soir' | 'bilan';

export interface CoachMessage {
  title: string;
  body: string;
}

/** Messages for each notification slot of `date`, computed from local data. */
export function coachMessages(date: string, _state: AppState): Record<CoachSlot, CoachMessage> {
  const m = { title: 'Cap Maldives', body: 'Un petit pas aujourd’hui.' };
  return { matin: m, midi: m, aprem: m, soir: m, bilan: m };
}

/** The one message to show on the Today screen right now. */
export function coachNow(date: string, state: AppState): CoachMessage {
  return coachMessages(date, state).matin;
}
