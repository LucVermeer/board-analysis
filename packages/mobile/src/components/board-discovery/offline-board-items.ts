// Which boards the picker may offer when the network list is unavailable.
//
// Pure and unit-tested, because every rule here is one the screen would otherwise
// get wrong: three candidate sources with different freshness, a scope that can be
// shared by two boards, and a filter that must not hide the board the user is
// standing in front of.

import type { UserBoard } from '@boardsesh/shared-schema';
import { offlineBoardKeyForBoard } from '@boardsesh/offline-sync';
import { isOfflineBoardCard } from '../../lib/boards/offline-board-card';

export type OfflineBoardRowsInput = {
  /** Snapshots persisted at download time (`settings/offline-boards.ts`). */
  cards: readonly UserBoard[];
  /** A warm `['myBoards']` React Query entry, if this session already fetched one. */
  cachedMyBoards: readonly UserBoard[];
  /** The persisted active board — the one identity that always survives a cold start. */
  activeBoard: UserBoard | null;
  /** Scopes with a scope-complete marker, i.e. the ones that will actually serve climbs. */
  downloadedScopeKeys: readonly string[];
};

/**
 * The rows to render, freshest copy of each board wins.
 *
 * - Candidates are cards ∪ cached `myBoards` ∪ the active board, deduped by `uuid`,
 *   with the fresher source overwriting the staler one (active > cached > card), so a
 *   board renamed since its snapshot shows its current name.
 * - Only scopes in `downloadedScopeKeys` are offered: activating a board whose
 *   climbs aren't on disk lands the user on an empty list, which reads as a worse
 *   bug than the picker one. `downloadedScopeKeys` — not `syncEnabledBoards` — is
 *   the honest signal, the same one My Boards captions "Available offline".
 * - The active board is always offered, downloaded or not, so the board you are
 *   already on can never vanish from the list, and it sorts first.
 */
export function offlineBoardRows(input: OfflineBoardRowsInput): UserBoard[] {
  const byUuid = new Map<string, UserBoard>();
  // Staler sources first so the fresher ones overwrite them.
  for (const board of input.cards) {
    if (isOfflineBoardCard(board)) byUuid.set(board.uuid, board);
  }
  for (const board of input.cachedMyBoards) {
    if (isOfflineBoardCard(board)) byUuid.set(board.uuid, board);
  }
  const activeUuid = input.activeBoard && isOfflineBoardCard(input.activeBoard) ? input.activeBoard.uuid : undefined;
  if (input.activeBoard && activeUuid !== undefined) byUuid.set(activeUuid, input.activeBoard);

  const downloaded = new Set(input.downloadedScopeKeys);
  const rows = [...byUuid.values()].filter(
    (board) => board.uuid === activeUuid || downloaded.has(offlineBoardKeyForBoard(board)),
  );

  rows.sort((left, right) => {
    if (left.uuid === activeUuid) return -1;
    if (right.uuid === activeUuid) return 1;
    // Device locale on purpose — a Spanish user should get Spanish collation for their
    // own board names. `sensitivity: 'base'` keeps "gym wall" and "Gym Wall" adjacent
    // instead of splitting the list by capitalisation.
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
  return rows;
}
