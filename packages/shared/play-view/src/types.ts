import type { ClimbQueueItem } from '@boardsesh/queue';

/** Which sub-drawer is currently open inside the play view. */
export type ActiveSubDrawer = 'none' | 'queue' | 'actions' | 'playlist' | 'lightControl';

/** Core state for the play view drawer. */
export type PlayDrawerState = {
  activeSubDrawer: ActiveSubDrawer;
  isTickBarActive: boolean;
  isBoardZoomed: boolean;
};

/** How the play drawer was opened. */
export type PlayDrawerEntry =
  | { source: 'list'; climb: ClimbQueueItem }
  | { source: 'queue'; item: ClimbQueueItem }
  | { source: 'deepLink'; climbUuid: string };

/** Platform-agnostic action bar props contract (no React elements or platform-specific types). */
export type ActionBarContract = {
  canSwipePrevious: boolean;
  canSwipeNext: boolean;
  isMirrored: boolean;
  supportsMirroring: boolean;
  isFavorited: boolean;
  remainingQueueCount: number;
  lightbulbActive: boolean;
  lightbulbPending?: boolean;
  onPrevClick: () => void;
  onNextClick: () => void;
  onMirror: () => void;
  onToggleFavorite: () => void;
  onLightbulb: () => void;
  onOpenActions: () => void;
  onOpenQueue: () => void;
};

/** Result of computing navigation state from queue. */
export type NavigationState = {
  canNext: boolean;
  canPrevious: boolean;
  nextItem: ClimbQueueItem | null;
  prevItem: ClimbQueueItem | null;
  remainingCount: number;
};

/**
 * Whether a board supports mirroring climbs.
 * Tension boards support mirroring (except layout 11), and Decoy boards support it.
 */
export function boardSupportsMirroring(boardName: string, layoutId: number): boolean {
  return (boardName === 'tension' && layoutId !== 11) || boardName === 'decoy';
}
