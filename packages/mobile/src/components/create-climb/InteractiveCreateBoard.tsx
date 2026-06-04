import React, { useMemo, type ReactNode } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import type { BoardName, LitUpHoldsMap } from '@boardsesh/shared-schema';
import { BoardImageNative } from '../BoardImageNative';
import { Text } from '../Text';
import { useZoomPanGesture } from '../play-drawer/use-zoom-pan-gesture';
import { overlays } from '../../theme/tokens';
import type { BoardHoldTarget } from '../../lib/create-board-holds';
import { HoldTargetLayer } from './HoldTargetLayer';
import { PaintedHoldsLayer } from './PaintedHoldsLayer';

type InteractiveCreateBoardProps = {
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  boardWidth: number;
  boardHeight: number;
  holdTargets: BoardHoldTarget[];
  litUpHoldsMap: LitUpHoldsMap;
  onPaint: (holdId: number) => void;
  onLongPressHold: (holdId: number) => void;
  mirrored?: boolean;
  showAllHolds?: boolean;
  /** Exact on-screen board size, computed by the drawer up front so the board
   *  renders immediately (no onLayout round-trip while the sheet animates in). */
  renderWidth: number;
  renderHeight: number;
  /** Optional overlay (e.g. heatmap) drawn between the background and the holds. */
  overlay?: ReactNode;
};

/**
 * The no-SVG interactive board editor. The background is the bundled board PNG
 * (via BoardImageNative with empty frames); painted holds and tap targets are
 * plain RN Views placed INSIDE the zoom-transformed Animated.View, so RNGH
 * hit-tests them in board-local space and taps land correctly at any zoom level
 * with zero manual coordinate math.
 *
 * Sized by the drawer (renderWidth/renderHeight) so it paints on the first frame.
 * Gesture model mirrors the Play Drawer's board: pinch is always live, but the
 * 1-finger zoom-pan only mounts while zoomed (a conditional overlay) so idle
 * vertical drags fall through to the BottomSheetScrollView and scroll/close the
 * drawer instead of being eaten here.
 */
export const InteractiveCreateBoard = React.memo(function InteractiveCreateBoard({
  boardName,
  layoutId,
  sizeId,
  setIds,
  boardWidth,
  boardHeight,
  holdTargets,
  litUpHoldsMap,
  onPaint,
  onLongPressHold,
  mirrored = false,
  showAllHolds = false,
  renderWidth,
  renderHeight,
  overlay,
}: InteractiveCreateBoardProps) {
  const { pinchGesture, zoomPanGesture, isZoomed, resetZoom, animatedZoomStyle } = useZoomPanGesture({
    enabled: true,
    containerWidth: renderWidth,
    containerHeight: renderHeight,
  });

  const holdById = useMemo(() => {
    const map = new Map<number, BoardHoldTarget>();
    for (const hold of holdTargets) map.set(hold.id, hold);
    return map;
  }, [holdTargets]);

  return (
    <View style={styles.root}>
      <GestureDetector gesture={pinchGesture}>
        <View style={[styles.clip, { width: renderWidth, height: renderHeight }]}>
          <Animated.View style={[styles.board, animatedZoomStyle]}>
            <BoardImageNative
              frames=""
              boardName={boardName}
              layoutId={layoutId}
              sizeId={sizeId}
              setIds={setIds}
              boardWidth={boardWidth}
              boardHeight={boardHeight}
              mirrored={mirrored}
            />
            {overlay ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                {overlay}
              </View>
            ) : null}
            <HoldTargetLayer
              holdTargets={holdTargets}
              boardWidth={boardWidth}
              boardHeight={boardHeight}
              measuredWidth={renderWidth}
              mirrored={mirrored}
              showAllHolds={showAllHolds}
              onPaint={onPaint}
              onLongPress={onLongPressHold}
            />
            <PaintedHoldsLayer
              litUpHoldsMap={litUpHoldsMap}
              holdById={holdById}
              boardWidth={boardWidth}
              boardHeight={boardHeight}
              measuredWidth={renderWidth}
              mirrored={mirrored}
            />
          </Animated.View>

          {/* Pan-while-zoomed overlay: only mounted when zoomed so it doesn't
              claim 1-finger touches at rest (which would block the drawer's
              scroll/close). 2-finger pinches fall through via maxPointers(1).
              While zoomed, reset to paint precise holds. */}
          {isZoomed ? (
            <GestureDetector gesture={zoomPanGesture}>
              <View style={StyleSheet.absoluteFill} />
            </GestureDetector>
          ) : null}

          {isZoomed ? (
            <Pressable style={styles.resetButton} onPress={resetZoom} hitSlop={8} accessibilityRole="button">
              <Text variant="footnote" style={styles.resetLabel}>
                Reset zoom
              </Text>
            </Pressable>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clip: {
    overflow: 'hidden',
  },
  board: {
    width: '100%',
    height: '100%',
  },
  resetButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: overlays.scrim,
  },
  resetLabel: {
    color: overlays.onScrim,
  },
});
