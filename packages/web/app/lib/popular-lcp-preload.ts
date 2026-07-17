import type { PopularBoardConfig } from '@boardsesh/shared-schema';
import { getBoardDetailsForBoard } from './board-utils';
import { getImageUrl } from '@/app/components/board-renderer/util';
import type { BoardName } from './types';

/**
 * Build the preload URL for the first board-discovery card thumbnail.
 *
 * When the board thumbnail is the home page's LCP element (i.e. the
 * recent-beta rail above it is empty — see `selectHomeLcpHints`), that
 * thumbnail is an inline SVG `<image>` element. The Fetch Priority API spec
 * does NOT cover SVG images (only HTML `<img>`/`<link>`/`<script>`/`<iframe>`),
 * so attribute-based hints get silently ignored and the preload scanner can't
 * see it. Emitting `<link rel="preload" as="image" fetchpriority="high">` from
 * the server-rendered head is the cross-browser way to escalate the priority:
 * the browser starts the request before any JS has parsed.
 *
 * Returns null when the popular configs list is empty (backend
 * unreachable, falls back gracefully) or the board details lookup fails.
 */
export function buildPopularLcpImageUrl(popularConfigs: PopularBoardConfig[]): string | null {
  const first = popularConfigs[0];
  if (!first) return null;
  try {
    const boardDetails = getBoardDetailsForBoard({
      board_name: first.boardType as BoardName,
      layout_id: first.layoutId,
      size_id: first.sizeId,
      set_ids: first.setIds,
    });
    const imageKey = Object.keys(boardDetails.images_to_holds)[0];
    if (!imageKey) return null;
    return getImageUrl(imageKey, boardDetails.board_name, true);
  } catch {
    return null;
  }
}

export type HomeLcpHints = {
  /**
   * Cross-origin backend host to warm with `<link rel="preconnect">`, or null
   * when the beta rail is empty / no backend origin is resolvable.
   */
  preconnectOrigin: string | null;
  /**
   * Board thumbnail to escalate with `<link rel="preload" as="image"
   * fetchpriority="high">`, or null when it isn't the LCP element.
   */
  boardPreloadUrl: string | null;
};

/**
 * Pick the single high-priority resource hint for the home page's LCP element.
 *
 * The above-the-fold order is hero → recent-beta rail → board discovery. When
 * the beta rail renders, its first (portrait) thumbnail is the largest visible
 * image and therefore the LCP element. That thumbnail is a cross-origin backend
 * `<img>`, so we warm its origin with a preconnect and let the eager
 * `fetchpriority="high"` `<img>` (see `BoardseshBetaCard`) drive the fetch —
 * we deliberately do NOT also preload the board thumbnail, which is below the
 * fold in this case and whose high-priority preload would only steal bandwidth
 * from the real LCP on the slow connections that dominate the poor cohort.
 *
 * When the beta rail is empty, the first board thumbnail is the LCP; it's an
 * inline SVG `<image>` the preload scanner can't see, so keep the explicit
 * high-priority image preload.
 *
 * Only one image hint is ever high-priority, and it always matches the element
 * the browser will actually paint as the LCP.
 */
export function selectHomeLcpHints({
  recentBetaCount,
  popularConfigs,
  backendOrigin,
}: {
  recentBetaCount: number;
  popularConfigs: PopularBoardConfig[];
  backendOrigin: string | null;
}): HomeLcpHints {
  if (recentBetaCount > 0) {
    return { preconnectOrigin: backendOrigin, boardPreloadUrl: null };
  }
  return { preconnectOrigin: null, boardPreloadUrl: buildPopularLcpImageUrl(popularConfigs) };
}
