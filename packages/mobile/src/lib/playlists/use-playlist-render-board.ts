// Decides which board a playlist-detail screen renders its climbs against, and
// whether to gate queueing behind a board switch.
//
// Playlists carry only `boardType` + `layoutId`. When the active board matches,
// rows render against the user's precise board (correct size/sets/angle) and
// tapping queues normally. When it differs — or there is no active board — rows
// render read-only against the playlist's own board (largest size + all sets,
// via `getBoardConfigForPlaylist`, mirroring web's playlist rendering); a banner
// prompts switching boards because the queue, play drawer, and BLE LEDs all
// follow the single active board, so you genuinely must switch to climb it.

import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatBoardDisplayName } from '@boardsesh/board-config';
import { useDrawerHost, type BoardConfig } from '../../providers/drawer-host-provider';
import { getBoardConfigForPlaylist } from './board-details-for-playlist';

/** The board a playlist's rows render against — same shape as the active board
 *  config; `setIds` is the comma-joined string `ClimbListRow` expects. */
export type PlaylistRenderBoard = BoardConfig;

/** Shown above a read-only playlist list when its board differs from the active
 *  board (or there is no active board). Strings are already translated. */
export type PlaylistBoardBanner = {
  title: string;
  subtitle: string;
  cta: string;
  onPress: () => void;
};

export type UsePlaylistRenderBoardResult = {
  /** Board the climb rows render against, or null when it can't be resolved (no
   *  active board for a smart playlist; an unbundled board such as MoonBoard —
   *  the banner still shows in that case). */
  renderBoard: PlaylistRenderBoard | null;
  /** Set when the list is read-only (board mismatch / no active board). */
  banner: PlaylistBoardBanner | null;
};

/**
 * Resolve the render board + optional mismatch banner for a playlist-detail
 * screen. Pass the playlist's `{ boardType, layoutId }`, or `null` for smart
 * playlists (they're computed relative to the active board, so they always
 * render against it with no mismatch banner).
 */
export function usePlaylistRenderBoard(
  playlistBoard: { boardType: string; layoutId?: number | null } | null,
): UsePlaylistRenderBoardResult {
  const { boardConfig: activeBoard } = useDrawerHost();
  const router = useRouter();
  const { t } = useTranslation('playlists');

  // Read the primitives up front so the memo stays stable across the fresh
  // `playlistBoard` object callers pass inline each render.
  const boardType = playlistBoard?.boardType ?? null;
  const layoutId = playlistBoard?.layoutId ?? null;

  return useMemo(() => {
    // Smart playlists (no board): always the active board, no mismatch concept.
    if (boardType == null) {
      return { renderBoard: activeBoard, banner: null };
    }

    const matchesActive =
      !!activeBoard && activeBoard.boardName === boardType && (layoutId == null || activeBoard.layoutId === layoutId);

    if (matchesActive) {
      return { renderBoard: activeBoard, banner: null };
    }

    // Mismatch or no active board → read-only against the playlist's own board.
    const boardLabel = formatBoardDisplayName(boardType);
    const banner: PlaylistBoardBanner = {
      title: t('detail.boardMismatch.title', { board: boardLabel }),
      subtitle: t('detail.boardMismatch.subtitle', { board: boardLabel }),
      cta: t('detail.boardMismatch.cta'),
      onPress: () => router.push({ pathname: '/boards', params: { returnTo: '/(tabs)/discover' } }),
    };

    const resolved = getBoardConfigForPlaylist(boardType, layoutId);
    if (!resolved) {
      // Unbundled board (e.g. MoonBoard) — can't render the holds, so show the
      // banner alone rather than a half-broken list.
      return { renderBoard: null, banner };
    }

    return {
      renderBoard: {
        boardName: resolved.boardName,
        layoutId: resolved.layoutId,
        sizeId: resolved.sizeId,
        setIds: resolved.setIds.join(','),
        // List-level angle is unused in the read-only branch — each row renders
        // at its own climb's angle (the angle its grade was baked at).
        angle: activeBoard?.angle ?? 0,
      },
      banner,
    };
  }, [activeBoard, boardType, layoutId, router, t]);
}
