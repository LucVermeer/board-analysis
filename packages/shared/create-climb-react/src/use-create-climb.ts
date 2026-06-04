import { useState, useCallback, useMemo } from 'react';
import { HOLD_STATE_MAP, STATE_TO_PRIMARY_CODE } from '@boardsesh/board-constants/hold-states';
import type { BoardName, HoldState, LitUpHoldsMap } from '@boardsesh/shared-schema';

type UseCreateClimbOptions = {
  initialHoldsMap?: LitUpHoldsMap;
};

function filterSupportedHoldsMap(boardName: BoardName, holdsMap: LitUpHoldsMap): LitUpHoldsMap {
  const stateToCode = STATE_TO_PRIMARY_CODE[boardName];
  return Object.fromEntries(
    Object.entries(holdsMap).filter(([, hold]) => hold.state !== 'OFF' && stateToCode[hold.state] !== undefined),
  ) as LitUpHoldsMap;
}

/**
 * Aurora (Kilter/Tension/etc) hold-state machine for the create-climb editor.
 * Pure React + board-constants — shared verbatim by the web form and the
 * React Native editor. Keys holds by numeric id; enforces the max-2
 * STARTING/FINISH rule; serialises to the Aurora `p{holdId}r{code}` frame
 * string.
 */
export function useCreateClimb(boardName: BoardName, options?: UseCreateClimbOptions) {
  // The editor mounts once per board route today, so this initial sanitizer only
  // needs the mount-time board. If a future caller swaps boardName mid-mount,
  // remount this hook or re-sanitize litUpHoldsMap on board change.
  const [litUpHoldsMap, setLitUpHoldsMap] = useState<LitUpHoldsMap>(() =>
    filterSupportedHoldsMap(boardName, options?.initialHoldsMap ?? {}),
  );

  // Derived state: count holds by type
  const startingCount = useMemo(
    () => Object.values(litUpHoldsMap).filter((h) => h.state === 'STARTING').length,
    [litUpHoldsMap],
  );

  const finishCount = useMemo(
    () => Object.values(litUpHoldsMap).filter((h) => h.state === 'FINISH').length,
    [litUpHoldsMap],
  );

  const totalHolds = useMemo(
    () => Object.values(litUpHoldsMap).filter((h) => h.state !== 'OFF').length,
    [litUpHoldsMap],
  );

  const isValid = totalHolds > 0;

  const setHoldState = useCallback(
    (holdId: number, nextState: HoldState | 'OFF') => {
      setLitUpHoldsMap((prev) => {
        // Clearing a hold removes it from the map.
        if (nextState === 'OFF') {
          if (!(holdId in prev)) return prev;
          const { [holdId]: _removed, ...rest } = prev;
          void _removed;
          return rest;
        }

        // Enforce max-2 STARTING / FINISH limits as a safety net — the picker
        // already disables these options when at the cap.
        const currentHold = prev[holdId];
        const isAlreadyThisState = currentHold?.state === nextState;
        if (!isAlreadyThisState) {
          if (nextState === 'STARTING') {
            const startingCount = Object.values(prev).filter((h) => h.state === 'STARTING').length;
            if (startingCount >= 2) return prev;
          }
          if (nextState === 'FINISH') {
            const finishCount = Object.values(prev).filter((h) => h.state === 'FINISH').length;
            if (finishCount >= 2) return prev;
          }
        }

        const stateCode = STATE_TO_PRIMARY_CODE[boardName][nextState];
        if (stateCode === undefined) {
          return prev;
        }

        const holdInfo = HOLD_STATE_MAP[boardName][stateCode];
        if (!holdInfo) {
          return prev;
        }

        return {
          ...prev,
          [holdId]: {
            state: nextState,
            color: holdInfo.color,
            displayColor: holdInfo.displayColor || holdInfo.color,
          },
        };
      });
    },
    [boardName],
  );

  // Generate frames string in Aurora format: p{holdId}r{stateCode}p{holdId}r{stateCode}...
  const generateFramesString = useCallback(() => {
    const stateToCode = STATE_TO_PRIMARY_CODE[boardName];
    return Object.entries(litUpHoldsMap)
      .filter(([, hold]) => hold.state !== 'OFF')
      .flatMap(([holdId, hold]) => {
        const code = stateToCode[hold.state];
        return code === undefined ? [] : [`p${holdId}r${code}`];
      })
      .join('');
  }, [litUpHoldsMap, boardName]);

  // Reset all holds
  const resetHolds = useCallback(() => {
    setLitUpHoldsMap({});
  }, []);

  // Replace the entire holds map in one shot (used when loading a draft back into the form).
  const loadHolds = useCallback(
    (next: LitUpHoldsMap) => {
      setLitUpHoldsMap(filterSupportedHoldsMap(boardName, next));
    },
    [boardName],
  );

  return {
    litUpHoldsMap,
    setHoldState,
    generateFramesString,
    startingCount,
    finishCount,
    totalHolds,
    isValid,
    resetHolds,
    loadHolds,
  };
}
