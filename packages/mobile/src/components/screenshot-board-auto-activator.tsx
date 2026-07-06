import { useEffect, useMemo } from 'react';
import { DEFAULT_CLIMB_FILTER_STATE, toClimbSearchInput } from '@boardsesh/climb-filters';
import {
  buildScreenshotWallSeed,
  publishScreenshotWallClimbs,
  SCREENSHOT_WALL_SEED_COUNT,
} from '../lib/board-presence/screenshot-wall-seed';
import { useMyBoards, useSearchClimbs } from '../lib/graphql/hooks';
import { useActiveBoard, useSetActiveBoard } from '../lib/graphql/use-active-board';
import { useAuth } from '../providers/auth-provider';

/**
 * Screenshot builds only: make the signed-in user's first saved board (Marco's
 * board) active so the board-backed screens (Climbs, Board View) render real
 * content instead of the "No board selected" picker. Replaces the Maestro flow's
 * fragile board-picker coordinate tap.
 *
 * Reactive + self-healing on purpose. It uses the SAME `useMyBoards` /
 * `useSetActiveBoard` hooks the real board picker uses — so it inherits React
 * Query's auth/retry/timing instead of a hand-rolled fetch wedged into the auth
 * boot sequence (which raced the token + the query cache GC and silently no-op'd).
 * Because it keeps `useActiveBoard` observed, the activated board is never
 * garbage-collected, and if anything clears it (e.g. a sign-out cleanup on a boot
 * AppState race) the effect re-runs and re-activates.
 *
 * Also publishes the wall-kiosk seed (the active board's first climbs) from
 * here, at the root, so the iPad "On the Wall" hero lights up even if the
 * Maestro flow never reaches the Climbs screen — its sidebar coordinate tap has
 * missed on the 11" iPad, which shipped a "WALL IS DARK" App Store shot. The
 * Climbs screen still re-publishes the same seed when it mounts (idempotent).
 *
 * Mount only behind an inlined `EXPO_PUBLIC_SCREENSHOT_MODE === '1'` check so it
 * dead-strips in normal builds and never runs for real users.
 */
export function ScreenshotBoardAutoActivator(): null {
  const { isAuthenticated } = useAuth();
  const { data: activeBoard } = useActiveBoard();
  // Same call shape as the board picker. Keeping it observed also keeps the
  // boards data warm in the React Query cache for the re-activation path.
  const { data: boardConnection } = useMyBoards(undefined, { enabled: isAuthenticated });
  const setActiveBoard = useSetActiveBoard();

  useEffect(() => {
    if (!isAuthenticated || activeBoard) return;
    const firstBoard = boardConnection?.boards?.[0];
    if (!firstBoard) return;
    // Logged so a screenshot run is debuggable from the Metro output the
    // orchestrator tees (a missing line means the boards fetch came back empty).
    console.log(`[screenshot] auto-activating board ${firstBoard.uuid} (${firstBoard.boardType})`);
    void setActiveBoard(firstBoard);
  }, [isAuthenticated, activeBoard, boardConnection, setActiveBoard]);

  // Same default-filter search the Climbs list runs, sized to the seed — so the
  // wall lights the same climbs the Climbs screen would publish.
  const wallSeedSearchInput = useMemo(() => {
    if (!activeBoard) return null;
    return toClimbSearchInput(
      DEFAULT_CLIMB_FILTER_STATE,
      {
        boardName: activeBoard.boardType,
        layoutId: activeBoard.layoutId,
        sizeId: activeBoard.sizeId,
        setIds: activeBoard.setIds ?? '',
        angle: activeBoard.angle ?? 0,
      },
      { page: 0, pageSize: SCREENSHOT_WALL_SEED_COUNT },
    );
  }, [activeBoard]);
  const { data: wallSeedSearch } = useSearchClimbs(
    wallSeedSearchInput ?? { boardName: '', layoutId: 0, sizeId: 0, setIds: '', angle: 0, page: 0, pageSize: 0 },
    wallSeedSearchInput !== null,
  );

  useEffect(() => {
    const seedClimbs = wallSeedSearch?.climbs;
    if (!activeBoard || !seedClimbs || seedClimbs.length === 0) return;
    // Logged for the same Metro-tee debuggability as the activation above.
    console.log(`[screenshot] wall seed published from auto-activator (${seedClimbs.length} climbs)`);
    publishScreenshotWallClimbs(buildScreenshotWallSeed(seedClimbs, activeBoard.angle ?? null), null);
  }, [wallSeedSearch, activeBoard]);

  return null;
}
