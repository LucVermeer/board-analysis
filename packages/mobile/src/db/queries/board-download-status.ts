import { isSizeScopedBoard } from '@boardsesh/board-config';
import {
  offlineBoardKey,
  isScopeDownloadComplete,
  type OfflineBoardScope,
  type OfflineDatabase,
} from '@boardsesh/offline-sync';

/**
 * Whether a board's exact (type, layout, size) scope is available to browse
 * offline: the user opted it in (its scope key is in syncEnabledBoards), its
 * INITIAL download finished (both reference tables pulled to the tail — a
 * first-page checkpoint must not serve a sliver of a 40k-climb catalog as if
 * it were everything), AND its climbs for that exact scope are present in
 * board_climbs. The scope must be exact — a board downloaded at one size is
 * NOT a valid local source for a different size of the same layout, since the
 * download is size-scoped. The row probe therefore mirrors the search-side
 * size filter: `compatible_size_ids` must contain the sizeId (skipped for
 * moonboard, which isn't size-scoped).
 *
 * `getSetting` (react-native-mmkv) is imported lazily so this module — pulled into
 * the search-hooks barrel via offline-request — doesn't drag react-native-mmkv (and
 * thus react-native's Flow entry) into the test collection-time module scan. The
 * pure `offlineBoardKey` stays a static import.
 */
export async function isBoardDownloadedLocally(db: OfflineDatabase, scope: OfflineBoardScope): Promise<boolean> {
  const { getSetting } = await import('../../settings/hooks');
  const scopeKey = offlineBoardKey(scope);
  if (!getSetting('syncEnabledBoards').includes(scopeKey)) return false;
  if (!(await isScopeDownloadComplete(db, scopeKey))) return false;

  const sizeScoped = isSizeScopedBoard(scope.boardType);
  const sizeClause = sizeScoped
    ? 'AND compatible_size_ids IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(compatible_size_ids) WHERE value = ?)'
    : '';
  const params = sizeScoped ? [scope.boardType, scope.layoutId, scope.sizeId] : [scope.boardType, scope.layoutId];

  const row = await db.getFirstAsync<{ has_rows: number }>(
    `SELECT EXISTS(SELECT 1 FROM board_climbs WHERE board_type = ? AND layout_id = ? ${sizeClause} LIMIT 1) AS has_rows`,
    params,
  );
  return (row?.has_rows ?? 0) === 1;
}
