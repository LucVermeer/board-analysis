import { useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';
import { getDownloadedScopeKeys } from '@boardsesh/offline-sync';
import type { UserBoard } from '@boardsesh/shared-schema';
import { rememberOfflineBoards, useSetting, offlineBoardKeyForBoard } from '../settings';
import { useIsOffline } from '../hooks/use-is-offline';

/**
 * Keep the offline picker's board snapshots fresh whenever `myBoards` resolves
 * online.
 *
 * `useBoardDownloads` snapshots a board at the moment offline is enabled, which
 * covers every new download. This hook covers the two gaps that leaves:
 *
 * - a board renamed or reconfigured on another device would otherwise show its old
 *   name offline forever;
 * - a board downloaded on a build that predates this feature has no snapshot at all,
 *   and is backfilled here the first time the app is online.
 *
 * Only boards whose scope is enabled or already downloaded are remembered — the
 * picker must not offer a board whose climbs aren't on disk, and there is no reason
 * to persist the rest of `myBoards`.
 *
 * Not gated on the offline-downloads flag: this reads data already on disk and one
 * setting, and a flag flipped off must not strand a device that has downloads.
 */
export function useRememberDownloadedBoards(boards: readonly UserBoard[] | undefined): void {
  const isOffline = useIsOffline();
  const db = useSQLiteContext();
  const [enabledBoards] = useSetting('syncEnabledBoards');
  // Shares the ['downloadedScopeKeys'] cache entry My Boards and the Storage screen
  // already populate, so this is at most one extra indexed read per session.
  const { data: downloadedScopeKeys } = useQuery({
    queryKey: ['downloadedScopeKeys'],
    queryFn: () => getDownloadedScopeKeys(db),
  });

  useEffect(() => {
    // Offline, `boards` is either stale or absent — refreshing from it would either
    // no-op or overwrite good snapshots with older ones.
    if (isOffline || !boards) return;
    const scopesToRemember = new Set([...enabledBoards, ...(downloadedScopeKeys ?? [])]);
    if (scopesToRemember.size === 0) return;
    const downloadedBoards = boards.filter((board) => scopesToRemember.has(offlineBoardKeyForBoard(board)));
    // `rememberOfflineBoards` skips the write when nothing changed, which is what
    // keeps this effect from churning every `useSetting` consumer on each refetch.
    rememberOfflineBoards(downloadedBoards);
  }, [isOffline, boards, enabledBoards, downloadedScopeKeys]);
}
