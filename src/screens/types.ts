export type TabId = 'today' | 'weight' | 'food' | 'training' | 'balance' | 'settings';

export interface ScreenCtx {
  /** Switch to another tab. */
  go(tab: TabId): void;
}

/**
 * A screen renders synchronously into `root` (already empty).
 * It is called again from scratch on every store change, so it must not
 * subscribe to the store itself or keep DOM between calls. Transient UI state
 * (selected day, open section) lives in module-level variables.
 */
export type Screen = (root: HTMLElement, ctx: ScreenCtx) => void;
