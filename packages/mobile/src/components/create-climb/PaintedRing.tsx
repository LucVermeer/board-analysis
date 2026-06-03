import React from 'react';
import { View, StyleSheet } from 'react-native';
import { hexWithAlpha } from './holdLayout';

type PaintedRingProps = {
  leftPct: number;
  topPct: number;
  diameter: number;
  /** Display color of the hold's role (from HOLD_STATE_MAP displayColor). */
  color: string;
};

/**
 * A single painted-hold indicator: a translucent filled ring centred on the
 * hold. Plain RN View — no SVG — so it repaints instantly when the brush state
 * changes. `React.memo` with primitive props keeps the painted layer cheap.
 */
export const PaintedRing = React.memo(function PaintedRing({ leftPct, topPct, diameter, color }: PaintedRingProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: diameter,
          height: diameter,
          marginLeft: -diameter / 2,
          marginTop: -diameter / 2,
          borderRadius: diameter / 2,
          borderWidth: Math.max(2, diameter * 0.15),
          borderColor: color,
          backgroundColor: hexWithAlpha(color, 0.28),
        },
      ]}
    />
  );
});

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
  },
});
