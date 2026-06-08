import React, { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import type { BoardName, HoldsFilter } from '@boardsesh/shared-schema';
import { BoardImageNative } from '../BoardImageNative';
import { Text } from '../Text';
import { useZoomPanGesture } from '../play-drawer/use-zoom-pan-gesture';
import { HoldTargetLayer } from '../create-climb/HoldTargetLayer';
import { holdGeometry } from '../create-climb/holdLayout';
import { overlays } from '../../theme/tokens';
import type { BoardHoldTarget } from '../../lib/create-board-holds';
import { SearchHoldFilterRings } from './SearchHoldFilterRings';

type InteractiveFilterBoardProps = {
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  boardWidth: number;
  boardHeight: number;
  holdTargets: BoardHoldTarget[];
  holdsFilter: HoldsFilter;
  /** The hold the picker is currently editing — drawn with a bright ring. */
  activeHoldId: number | null;
  onHoldTap: (holdId: number) => void;
  mirrored?: boolean;
  renderWidth: number;
  renderHeight: number;
  /** Optional chrome (e.g. a floating toolbar) rendered over the board canvas. */
  children?: ReactNode;
};

/**
 * Full-bleed interactive board for the search hold filter, built on the same
 * no-SVG gesture model as `InteractiveCreateBoard`: the board PNG plus plain RN
 * tap targets and filter rings INSIDE the zoom-transformed view, so taps and
 * rings track holds at any zoom with no manual coordinate math. Pinch is always
 * live; the 1-finger pan only mounts while zoomed.
 *
 * Unlike the create board this lives on a full-screen route (not a bottom
 * sheet), so the pan overlay can stay simpler — there's no parent scroll to
 * yield idle drags to.
 */
export const InteractiveFilterBoard = React.memo(function InteractiveFilterBoard({
  boardName,
  layoutId,
  sizeId,
  setIds,
  boardWidth,
  boardHeight,
  holdTargets,
  holdsFilter,
  activeHoldId,
  onHoldTap,
  mirrored = false,
  renderWidth,
  renderHeight,
  children,
}: InteractiveFilterBoardProps) {
  const { t } = useTranslation('common');
  const { pinchGesture, zoomPanGesture, isZoomed, resetZoom, animatedZoomStyle } = useZoomPanGesture({
    enabled: true,
    containerWidth: renderWidth,
    containerHeight: renderHeight,
  });

  // The picker uses a long-press-style commit, but holds here only need a single
  // tap to open the picker, so we route both tap and "long press" to the same
  // handler (HoldTargetLayer requires both).

  const activeHighlight = useMemo(() => {
    if (activeHoldId == null || renderWidth <= 0) return null;
    const hold = holdTargets.find((target) => target.id === activeHoldId);
    if (!hold) return null;
    const geometry = holdGeometry(hold, boardWidth, boardHeight, renderWidth, mirrored);
    const diameter = geometry.ringDiameter * 1.5;
    const radius = diameter / 2;
    return (
      <View
        pointerEvents="none"
        style={[
          styles.activeRing,
          {
            left: `${geometry.leftPct}%`,
            top: `${geometry.topPct}%`,
            width: diameter,
            height: diameter,
            marginLeft: -radius,
            marginTop: -radius,
            borderRadius: radius,
            borderWidth: Math.max(2.5, geometry.ringDiameter * 0.18),
          },
        ]}
      />
    );
  }, [activeHoldId, holdTargets, boardWidth, boardHeight, renderWidth, mirrored]);

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
            <SearchHoldFilterRings
              boardName={boardName}
              holdsFilter={holdsFilter}
              holdTargets={holdTargets}
              boardWidth={boardWidth}
              boardHeight={boardHeight}
              measuredWidth={renderWidth}
              mirrored={mirrored}
            />
            {activeHighlight}
            <HoldTargetLayer
              holdTargets={holdTargets}
              boardWidth={boardWidth}
              boardHeight={boardHeight}
              measuredWidth={renderWidth}
              mirrored={mirrored}
              showAllHolds
              onPaint={onHoldTap}
              onLongPress={onHoldTap}
            />
          </Animated.View>

          {isZoomed ? (
            <GestureDetector gesture={zoomPanGesture}>
              <View style={StyleSheet.absoluteFill} />
            </GestureDetector>
          ) : null}

          {isZoomed ? (
            <Pressable style={styles.resetButton} onPress={resetZoom} hitSlop={8} accessibilityRole="button">
              <Text variant="footnote" style={styles.resetLabel}>
                {t('board.resetZoom')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </GestureDetector>
      {children}
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
  activeRing: {
    position: 'absolute',
    borderColor: '#FFFFFF',
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
