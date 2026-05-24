import { useMemo } from 'react';
import type { BoardName } from '@boardsesh/shared-schema';
import { convertLitUpHoldsStringToMap, HOLD_STATE_MAP } from '@boardsesh/board-constants/hold-states';
import type { BoardHold, HoldPlacement } from './types';

/**
 * Parses a climb's `frames` string into an array of BoardHold objects ready for rendering.
 *
 * The frames string format is a comma-separated list of frames (usually just one).
 * Each frame contains entries like `p{holdId}r{stateCode}` — parsed by
 * `convertLitUpHoldsStringToMap` from board-constants.
 *
 * This hook resolves each hold ID to its (cx, cy, r) position from `holdsData`,
 * and maps the state code to a display color via HOLD_STATE_MAP.
 */
export function useParseFrames(frames: string, boardName: BoardName, holdsData: HoldPlacement[]): BoardHold[] {
  return useMemo(() => {
    if (!frames) return [];

    // Build a lookup from hold ID to its placement data
    const holdLookup = new Map<number, HoldPlacement>();
    for (const hold of holdsData) {
      holdLookup.set(hold.id, hold);
    }

    // Parse the frames string into a map of frameIndex -> { holdId -> { state, color, displayColor } }
    const frameMap = convertLitUpHoldsStringToMap(frames, boardName);

    // We render all frames overlaid (typically there is only one frame per climb).
    // Collect active holds from every frame.
    const result: BoardHold[] = [];
    const boardStateMap = HOLD_STATE_MAP[boardName];

    for (const litUpHoldsMap of Object.values(frameMap)) {
      for (const [holdIdStr, holdInfo] of Object.entries(litUpHoldsMap)) {
        const holdId = Number(holdIdStr);
        const placement = holdLookup.get(holdId);
        if (!placement) continue;

        // Find the renderStyle from the state map by matching the color
        // (the stateCode is not directly available from convertLitUpHoldsStringToMap,
        // so we look up the renderStyle from boardStateMap by matching state name)
        let renderStyle: 'circle' | 'above-marker' = 'circle';
        if (boardStateMap) {
          for (const stateInfo of Object.values(boardStateMap)) {
            if (stateInfo.name === holdInfo.state && stateInfo.renderStyle) {
              renderStyle = stateInfo.renderStyle;
              break;
            }
          }
        }

        result.push({
          id: holdId,
          cx: placement.cx,
          cy: placement.cy,
          radius: placement.r,
          color: holdInfo.displayColor,
          role: holdInfo.state,
          renderStyle,
        });
      }
    }

    return result;
  }, [frames, boardName, holdsData]);
}
