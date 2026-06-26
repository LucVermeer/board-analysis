import React, { type MutableRefObject, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import type { BoardHoldTarget } from '../../lib/create-board-holds';
import { holdGeometry } from './holdLayout';
import { HoldTarget } from './HoldTarget';

type HoldTargetLayerProps = {
  holdTargets: BoardHoldTarget[];
  boardWidth: number;
  boardHeight: number;
  measuredWidth: number;
  mirrored: boolean;
  /** When true, every hold gets a brighter, larger discoverability dot. */
  showAllHolds: boolean;
  /** When false, tap targets remain but their discoverability dots are hidden. */
  showHoldMarkers?: boolean;
  onPaint: (holdId: number) => void;
  onLongPress: (holdId: number) => void;
  /** The board's ancestor pinch, forwarded to each hold so per-hold gestures
   *  declare themselves simultaneous with it (reliable pinch-to-zoom). */
  pinchRef?: MutableRefObject<GestureType | undefined>;
  /** Forwarded to each hold so its tap/long-press bail while a pinch is active. */
  isPinchingSV?: SharedValue<boolean>;
};

const FAINT_DOT = 'rgba(255,255,255,0.22)';
const BRIGHT_DOT = 'rgba(255,255,255,0.55)';
const FAINT_DOT_DIAMETER = 6;

/**
 * Static, memoized layer of one tap target per hold. Intentionally independent
 * of the painted state so it never re-renders when a hold is painted — the
 * PaintedHoldsLayer draws colored rings on top and visually covers the dot.
 */
export const HoldTargetLayer = React.memo(function HoldTargetLayer({
  holdTargets,
  boardWidth,
  boardHeight,
  measuredWidth,
  mirrored,
  showAllHolds,
  showHoldMarkers = true,
  onPaint,
  onLongPress,
  pinchRef,
  isPinchingSV,
}: HoldTargetLayerProps) {
  const targets = useMemo(() => {
    if (measuredWidth <= 0) return null;
    return holdTargets.map((hold) => {
      const geometry = holdGeometry(hold, boardWidth, boardHeight, measuredWidth, mirrored);
      const dotDiameter = showAllHolds ? Math.max(FAINT_DOT_DIAMETER, geometry.ringDiameter * 0.4) : FAINT_DOT_DIAMETER;
      return (
        <HoldTarget
          key={hold.id}
          holdId={hold.id}
          leftPct={geometry.leftPct}
          topPct={geometry.topPct}
          tapDiameter={geometry.tapDiameter}
          dotDiameter={dotDiameter}
          showDot={showHoldMarkers}
          dotColor={showAllHolds ? BRIGHT_DOT : FAINT_DOT}
          onPaint={onPaint}
          onLongPress={onLongPress}
          pinchRef={pinchRef}
          isPinchingSV={isPinchingSV}
        />
      );
    });
  }, [
    holdTargets,
    boardWidth,
    boardHeight,
    measuredWidth,
    mirrored,
    showAllHolds,
    showHoldMarkers,
    onPaint,
    onLongPress,
    pinchRef,
    isPinchingSV,
  ]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {targets}
    </View>
  );
});
