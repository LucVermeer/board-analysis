import { useCallback, useMemo } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { useQueue } from '../../providers/queue-provider';
import { useDrawerHost } from '../../providers/drawer-host-provider';
import { hapticLight } from '../../lib/haptics';
import { useWallOrQueueCurrentClimb } from './use-wall-or-queue-climb';

/**
 * Tap-to-open behind the bottom accessory bar (`ClimbCapsule` and the iOS 26
 * native bottom accessory `NativeAccessoryClimbRow`). The bar now mirrors the
 * board's status (the wall's lit climb when a feed is live), so the old
 * swipe-to-step-the-queue carousel and its peeking neighbours were removed — a
 * single tap opens whatever the bar is showing.
 */
export type AccessoryClimbTap = {
  /** Tap → open the play drawer for the displayed climb. */
  openGesture: GestureType;
  /** Local queue head; the wrappers re-apply `useWallOrQueueCurrentClimb` for display. */
  currentItem: ClimbQueueItem | null | undefined;
};

export function useAccessoryClimbTap(): AccessoryClimbTap {
  const { state } = useQueue();
  const { openPlayDrawer } = useDrawerHost();
  const { currentClimbQueueItem } = state;

  // Open whatever the accessory is showing: the wall's lit climb when a feed is
  // live, else the local queue head — useWallOrQueueCurrentClimb already folds the
  // local head in as its fallback, so this is the single source of truth for the
  // open target. setAsCurrent stays false so opening the head doesn't duplicate it
  // at the end of the queue.
  const accessoryClimb = useWallOrQueueCurrentClimb(currentClimbQueueItem?.climb ?? null);

  const handleOpenPlay = useCallback(() => {
    if (!accessoryClimb) return;
    hapticLight();
    openPlayDrawer(accessoryClimb, { setAsCurrent: false });
  }, [openPlayDrawer, accessoryClimb]);

  const openGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .onEnd(() => {
          'worklet';
          runOnJS(handleOpenPlay)();
        }),
    [handleOpenPlay],
  );

  return { openGesture, currentItem: currentClimbQueueItem };
}
