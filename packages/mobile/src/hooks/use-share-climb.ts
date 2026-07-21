import { useCallback } from 'react';
import { Platform, Share } from 'react-native';
import { buildReadableClimbViewPath } from '@boardsesh/play-view/readable-url-utils';
import { accumulateFramesToMaps, accumulatedMapsToFrameStrings } from '@boardsesh/board-constants/hold-states';
import type { BoardName, Climb } from '@boardsesh/shared-schema';
import { BACKEND_URL, WEB_BASE_URL } from '../lib/env';

type ShareClimbArgs = {
  climb: Climb | null;
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
};

// Mirror of web's `packages/web/app/components/board-renderer/util.ts`
// `toFlatFrames` (keep the two in sync): collapse a possibly
// multi-frame Aurora frames string to its final lit snapshot — the exact frames
// the shared climb page's og:image is rendered from, so the prewarm hits the
// backend's cache key. Single-frame strings round-trip unchanged.
function toFlatFrames(frames: string, boardName: BoardName): string {
  if (!frames) return '';
  if (!frames.includes(',') && !frames.includes('x')) return frames;
  const maps = accumulateFramesToMaps(frames, boardName);
  return accumulatedMapsToFrameStrings(maps, boardName).at(-1) ?? '';
}

// Local builder for the backend og:image URL. Kept local rather than pulling in
// @boardsesh/board-render, whose graph drags the WASM renderer + sharp into the
// mobile bundle — far heavier than assembling a query string warrants. The raw
// query string need not byte-match web's buildOgBoardRenderUrl: the backend
// canonicalises set_ids (sort + dedupe) before keying its caches, so both
// platforms' URLs collapse to the same cache entry.
function buildOgImageUrl(args: {
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  frames: string;
}): string | null {
  const flatFrames = toFlatFrames(args.frames, args.boardName as BoardName);
  // The backend rejects an empty frames string (a blank board would cache as a
  // real card), so there is nothing to warm without frames.
  if (!flatFrames) return null;
  const sortedSetIds = args.setIds
    .split(',')
    .map(Number)
    .sort((first, second) => first - second)
    .join(',');
  const query = [
    `board_name=${encodeURIComponent(args.boardName)}`,
    `layout_id=${args.layoutId}`,
    `size_id=${args.sizeId}`,
    `set_ids=${encodeURIComponent(sortedSetIds)}`,
    `frames=${encodeURIComponent(flatFrames)}`,
    'format=jpeg',
  ].join('&');
  return `${BACKEND_URL}/og/climb?${query}`;
}

// Fire-and-forget priming before the native share sheet opens — the same
// warm-the-CDN-and-og-caches trick web does. Never blocks or breaks sharing:
// each fetch is voided and every failure (async rejection or a synchronous
// throw when fetch is unavailable) is swallowed.
function prewarmShareCaches(pageUrl: string, ogImageUrl: string | null): void {
  const targets = ogImageUrl ? [pageUrl, ogImageUrl] : [pageUrl];
  for (const target of targets) {
    try {
      void fetch(target)
        .then((response) => response.body?.cancel())
        .catch(() => {});
    } catch {
      // Priming is best-effort; a warm miss must never affect the share sheet.
    }
  }
}

export function useShareClimb({ climb, boardName, layoutId, sizeId, setIds, angle }: ShareClimbArgs) {
  return useCallback(async () => {
    if (!climb) return;
    const url = `${WEB_BASE_URL}${buildReadableClimbViewPath({
      boardName,
      layoutId,
      sizeId,
      setIds,
      angle,
      climbUuid: climb.uuid,
      climbName: climb.name,
    })}`;

    prewarmShareCaches(url, buildOgImageUrl({ boardName, layoutId, sizeId, setIds, frames: climb.frames }));

    await Share.share(Platform.OS === 'ios' ? { message: climb.name, url } : { message: `${climb.name}\n${url}` });
  }, [climb, boardName, layoutId, sizeId, setIds, angle]);
}
