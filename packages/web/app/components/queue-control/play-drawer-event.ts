import type { Climb } from '@/app/lib/types';

/**
 * Window-level event that asks the mounted QueueControlBar / PlayViewDrawer
 * to open the play drawer. Dispatched by climb list items and similar
 * surfaces that live outside the bar's React tree.
 *
 * In an active party session, callers pass the tapped climb via `detail.climb`
 * and the bar uses it as the drawer's locally-displayed climb without writing
 * to `state.currentClimbQueueItem` (so browsing does not change what is lit
 * on the wall). In solo mode, callers either pre-mutate state via
 * setCurrentClimb or rely on the centralized `previewClimbFromBrowse` helper.
 *
 * Lives in its own module so lightweight components can import it without
 * pulling in the full QueueControlBar tree — important for isolated unit
 * tests.
 */
export const PLAY_DRAWER_EVENT = 'boardsesh:open-play-drawer';

export type PlayDrawerEventDetail = {
  climb?: Climb;
};

export const dispatchOpenPlayDrawer = (climb?: Climb): void => {
  if (typeof window === 'undefined') return;
  const detail: PlayDrawerEventDetail = climb ? { climb } : {};
  window.dispatchEvent(new CustomEvent<PlayDrawerEventDetail>(PLAY_DRAWER_EVENT, { detail }));
};

export const readPlayDrawerEventClimb = (event: Event): Climb | undefined => {
  if (!(event instanceof CustomEvent)) return undefined;
  const detail = event.detail as PlayDrawerEventDetail | undefined;
  return detail?.climb;
};
