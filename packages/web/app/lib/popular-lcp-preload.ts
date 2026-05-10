import type { PopularBoardConfig } from '@boardsesh/shared-schema';
import { getBoardDetailsForBoard } from './board-utils';
import { getImageUrl } from '@/app/components/board-renderer/util';
import type { BoardName } from './types';

/**
 * Build the preload URL for the unauthenticated home page's LCP image.
 *
 * The LCP element on the home page is the first popular board card
 * thumbnail rendered by `BoardDiscoveryScroll`. That thumbnail is an
 * inline SVG `<image>` element — and the Fetch Priority API spec does NOT
 * cover SVG images (only HTML `<img>`/`<link>`/`<script>`/`<iframe>`),
 * so attribute-based hints get silently ignored. Emitting
 * `<link rel="preload" as="image" fetchpriority="high">` from the
 * server-rendered head is the cross-browser way to escalate the priority:
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
