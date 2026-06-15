import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useQueue } from '../../providers/queue-provider';
import {
  glassSize,
  NATIVE_BOTTOM_ACCESSORY_MAX_WIDTH,
  NATIVE_BOTTOM_ACCESSORY_SCREEN_GUTTER,
} from '../../theme/layout';
import { NativeAccessoryClimbRow } from './NativeAccessoryClimbRow';
import { useWallOrQueueCurrentClimb } from './use-wall-or-queue-climb';

/**
 * iOS 26 tab-bar bottom accessory content. UIKit supplies the outer Liquid Glass
 * platter and swaps this subtree between regular and inline placements as the
 * tab bar minimizes, so the content stays bare: current climb plus tick only.
 *
 * This is the single source of truth for the displayed climb and the single
 * render gate. It renders {@link NativeAccessoryClimbRow} directly (no extra
 * wrapper) so the platter holds exactly one placement-sized row — a second nested
 * gate/wrapper used to let the content blank for a frame inside the live host,
 * which UIKit snapshotted as doubled text.
 */
export function QueueBottomAccessory() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const { width: screenWidth } = useWindowDimensions();
  const { state } = useQueue();
  // Show the accessory when there's a local queue climb OR a live wall climb
  // (the flag-gated source flip — see useWallOrQueueCurrentClimb).
  const currentClimb = useWallOrQueueCurrentClimb(state.currentClimbQueueItem?.climb ?? null);

  const accessoryWidth = useMemo(() => {
    return Math.max(
      glassSize.standard * 2,
      Math.min(NATIVE_BOTTOM_ACCESSORY_MAX_WIDTH, screenWidth - NATIVE_BOTTOM_ACCESSORY_SCREEN_GUTTER),
    );
  }, [screenWidth]);

  if (!currentClimb) return null;

  return <NativeAccessoryClimbRow climb={currentClimb} placement={placement} width={accessoryWidth} />;
}
