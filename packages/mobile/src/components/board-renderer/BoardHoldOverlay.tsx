import React from 'react';
import { Circle, G, Polygon } from 'react-native-svg';
import type { BoardHold } from './types';

type BoardHoldOverlayProps = {
  holds: BoardHold[];
};

const FILL_OPACITY = 0.6;
const STROKE_OPACITY = 0.9;
const STROKE_WIDTH_RATIO = 0.15; // Stroke width as fraction of hold radius

/**
 * Renders SVG circles (or above-markers) for each active hold in a climb.
 *
 * Each hold gets a semi-transparent filled circle with a slightly more opaque
 * stroke border, matching the hold's role color from HOLD_STATE_MAP.
 */
const BoardHoldOverlay = React.memo(function BoardHoldOverlay({ holds }: BoardHoldOverlayProps) {
  return (
    <G>
      {holds.map((hold) => {
        const strokeWidth = Math.max(1, hold.radius * STROKE_WIDTH_RATIO);

        if (hold.renderStyle === 'above-marker') {
          // Render an inverted triangle marker above the hold position
          const markerSize = hold.radius * 0.8;
          const topY = hold.cy - hold.radius - markerSize * 1.2;
          const points = [
            `${hold.cx - markerSize},${topY}`,
            `${hold.cx + markerSize},${topY}`,
            `${hold.cx},${topY + markerSize * 1.2}`,
          ].join(' ');

          return (
            <Polygon
              key={hold.id}
              points={points}
              fill={hold.color}
              fillOpacity={FILL_OPACITY}
              stroke={hold.color}
              strokeOpacity={STROKE_OPACITY}
              strokeWidth={strokeWidth}
            />
          );
        }

        return (
          <Circle
            key={hold.id}
            cx={hold.cx}
            cy={hold.cy}
            r={hold.radius}
            fill={hold.color}
            fillOpacity={FILL_OPACITY}
            stroke={hold.color}
            strokeOpacity={STROKE_OPACITY}
            strokeWidth={strokeWidth}
          />
        );
      })}
    </G>
  );
});

export { BoardHoldOverlay };
