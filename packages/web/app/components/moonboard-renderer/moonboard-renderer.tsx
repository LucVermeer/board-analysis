'use client';

import React, { useMemo } from 'react';
import { MOONBOARD_GRID, MOONBOARD_SIZE, getGridPosition, MOONBOARD_HOLD_STATES } from '@/app/lib/moonboard-config';
import type { MoonBoardRendererProps } from './types';
import type { SvgFetchPriorityAttrs } from '../board-renderer/types';

const MoonBoardRenderer: React.FC<MoonBoardRendererProps> = ({
  layoutFolder,
  holdSetImages,
  litUpHoldsMap = {},
  mirrored = false,
  thumbnail = false,
  fillHeight = false,
  fetchPriority,
  onHoldClick,
}) => {
  const { width, height } = MOONBOARD_SIZE;

  // Calculate hold circle radius based on grid cell size
  const cellWidth = width / MOONBOARD_GRID.numColumns;
  const cellHeight = height / MOONBOARD_GRID.numRows;
  const holdRadius = Math.min(cellWidth, cellHeight) * 0.35;

  // Generate all grid positions (198 holds: 11 cols x 18 rows)
  const gridHolds = React.useMemo(() => {
    const holds = [];
    for (let row = 1; row <= MOONBOARD_GRID.numRows; row++) {
      for (let colIdx = 0; colIdx < MOONBOARD_GRID.numColumns; colIdx++) {
        const holdId = (row - 1) * MOONBOARD_GRID.numColumns + colIdx + 1;
        const pos = getGridPosition(holdId);

        holds.push({
          id: holdId,
          cx: pos.x * width,
          cy: pos.y * height,
        });
      }
    }
    return holds;
  }, [width, height]);

  const getHoldColor = (holdId: number): string => {
    const hold = litUpHoldsMap[holdId];
    if (!hold) return 'transparent';

    // Use displayColor from the hold if available, otherwise map state to Moonboard colors
    if (hold.displayColor) return hold.displayColor;

    switch (hold.state) {
      case 'STARTING':
        return MOONBOARD_HOLD_STATES.start.displayColor;
      case 'HAND':
        return MOONBOARD_HOLD_STATES.hand.displayColor;
      case 'FINISH':
        return MOONBOARD_HOLD_STATES.finish.displayColor;
      default:
        return 'transparent';
    }
  };

  // Memoize SVG style object to prevent recreation on every render.
  // fillHeight: SVG fills container height; preserveAspectRatio="xMidYMid meet" letterboxes the
  // image so the full board is always visible regardless of container aspect.
  const svgStyle = useMemo(
    () =>
      fillHeight
        ? {
            width: '100%',
            height: '100%',
            display: 'block' as const,
            transform: mirrored ? 'scaleX(-1)' : undefined,
          }
        : {
            width: '100%',
            height: 'auto',
            display: 'block' as const,
            maxHeight: thumbnail ? '10vh' : '55vh',
            transform: mirrored ? 'scaleX(-1)' : undefined,
          },
    [thumbnail, mirrored, fillHeight],
  );

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={svgStyle}>
      {/* Render MoonBoard background first.
          SVG <image> supports the HTML `fetchpriority` (lowercase) attribute
          per spec; React's SVG prop types don't include it yet, so apply via
          a precisely-typed spread (SvgFetchPriorityAttrs) instead of a loose
          Record<string, string> cast. */}
      <image
        href={thumbnail ? '/images/moonboard/thumbs/moonboard-bg.webp' : '/images/moonboard/moonboard-bg.webp'}
        width="100%"
        height="100%"
        {...(fetchPriority ? ({ fetchpriority: fetchPriority } satisfies SvgFetchPriorityAttrs) : null)}
      />

      {/* Render hold set images as overlay layers */}
      {holdSetImages.map((imageFile) => (
        <image
          key={imageFile}
          href={`/images/moonboard/${layoutFolder}/${thumbnail ? 'thumbs/' : ''}${imageFile.replace(/\.png$/, '.webp')}`}
          width="100%"
          height="100%"
        />
      ))}

      {/* Render hold circles - skip transparent ones when they serve no purpose */}
      {gridHolds.map((hold) => {
        const color = getHoldColor(hold.id);
        const isLitUp = color !== 'transparent';

        // Skip transparent circles in thumbnail mode or when there's no click handler
        if (!isLitUp && (thumbnail || !onHoldClick)) return null;

        return (
          <circle
            key={hold.id}
            id={`hold-${hold.id}`}
            cx={hold.cx}
            cy={hold.cy}
            r={holdRadius}
            stroke={color}
            strokeWidth={thumbnail ? 8 : 6}
            fillOpacity={thumbnail && isLitUp ? 1 : 0}
            fill={thumbnail && isLitUp ? color : 'transparent'}
            style={{ cursor: onHoldClick ? 'pointer' : 'default' }}
            onClick={onHoldClick ? (event) => onHoldClick(hold.id, event.currentTarget) : undefined}
          />
        );
      })}
    </svg>
  );
};

export default MoonBoardRenderer;
