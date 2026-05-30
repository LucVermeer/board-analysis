import { useMemo } from 'react';
import { convertLitUpHoldsStringToMap as decodeFrames } from '@boardsesh/board-constants/hold-states';
import { splitFramesString } from '@boardsesh/board-constants/hold-states';
import type { Climb, LitUpHoldsMap } from '@boardsesh/shared-schema';
import type { BoardDetails, BoardName } from '@/app/lib/types';
import { BOARD_IMAGE_DIMENSIONS } from '../../lib/board-data';
export { convertLitUpHoldsStringToMap } from './types';

/**
 * Default per-frame pace when a climb does not specify `framesPace`. The
 * Aurora encoding leaves this at 0 for static climbs and the unit is not
 * documented anywhere in this repo; QA can tune the constant once we have
 * a known multi-frame climb to calibrate against.
 */
const DEFAULT_PACE_MS = 750;

/**
 * Lower bound on per-frame pace. The BLE transport chunks at 20 bytes with
 * a 5 ms inter-chunk delay; writing faster than ~50 ms queues UART faster
 * than it can flush and causes visible LED tearing.
 */
export const MIN_PACE_MS = 50;

export type ClimbFrames = {
  /** One decoded `LitUpHoldsMap` per snapshot, in display order. */
  frames: LitUpHoldsMap[];
  /** One BLE-ready single-frame string per snapshot, in display order. */
  frameStrings: string[];
  /** Effective per-frame pace in milliseconds, clamped to `MIN_PACE_MS`. */
  paceMs: number;
  /** Reported frame count (>=1). May exceed `frames.length` for sparse climbs. */
  count: number;
};

/**
 * Decode a climb's `frames` string into per-snapshot maps + BLE strings,
 * memoised by the underlying frames text so the playback engine doesn't
 * rebuild on every render.
 */
export function useClimbFrames(
  climb: Pick<Climb, 'frames' | 'framesCount' | 'framesPace'> | null | undefined,
  boardName: BoardName,
): ClimbFrames {
  return useMemo(() => {
    const framesText = climb?.frames ?? '';
    const frameStrings = splitFramesString(framesText);
    const framesMap = decodeFrames(framesText, boardName);
    const orderedFrames: LitUpHoldsMap[] = frameStrings.map((_segment, index) => framesMap[index] ?? {});
    const reportedPace = climb?.framesPace ?? 0;
    const paceMs = reportedPace > 0 ? Math.max(MIN_PACE_MS, reportedPace) : DEFAULT_PACE_MS;
    const count = Math.max(climb?.framesCount ?? frameStrings.length, frameStrings.length, 1);
    return { frames: orderedFrames, frameStrings, paceMs, count };
  }, [climb?.frames, climb?.framesCount, climb?.framesPace, boardName]);
}

type BuildBoardRenderUrlOptions = {
  thumbnail?: boolean;
  includeBackground?: boolean;
  variant?: 'default' | 'og';
  format?: 'webp' | 'png';
};

/**
 * Build the URL for the Rust/WASM-rendered board image.
 * Mirroring is handled via CSS (scaleX(-1)), not a separate render — halves cache variants.
 */
export const buildBoardRenderUrl = (
  boardDetails: BoardDetails,
  frames: string,
  { thumbnail, includeBackground, variant, format }: BuildBoardRenderUrlOptions = {},
) => {
  let url =
    `/api/internal/board-render?board_name=${boardDetails.board_name}` +
    `&layout_id=${boardDetails.layout_id}` +
    `&size_id=${boardDetails.size_id}` +
    `&set_ids=${boardDetails.set_ids.join(',')}` +
    `&frames=${encodeURIComponent(frames)}`;

  if (thumbnail) {
    url += '&thumbnail=1';
  }

  if (includeBackground) {
    url += '&include_background=1';
  }

  if (variant === 'og') {
    url += '&variant=og';
  }

  if (format) {
    url += `&format=${format}`;
  }

  return url;
};

export const buildOverlayUrl = (boardDetails: BoardDetails, frames: string, thumbnail?: boolean) =>
  buildBoardRenderUrl(boardDetails, frames, {
    thumbnail,
    includeBackground: true,
  });

export const buildOgBoardRenderUrl = (boardDetails: BoardDetails, frames: string) =>
  buildBoardRenderUrl(boardDetails, frames, {
    includeBackground: true,
    variant: 'og',
    format: 'png',
  });

const USE_SELF_HOSTED_IMAGES = true;

/** Insert /thumbs/ before the filename in a WebP path, or return as-is. */
const toThumbUrl = (webpUrl: string) => {
  const lastSlash = webpUrl.lastIndexOf('/');
  return `${webpUrl.substring(0, lastSlash)}/thumbs${webpUrl.substring(lastSlash)}`;
};

export const getImageUrl = (imageUrl: string, board: BoardName, thumbnail?: boolean) => {
  // Absolute path (e.g. MoonBoard images already prefixed with /images/moonboard/...)
  if (imageUrl.startsWith('/')) {
    const webpUrl = imageUrl.replace(/\.png$/, '.webp');
    return thumbnail ? toThumbUrl(webpUrl) : webpUrl;
  }

  if (USE_SELF_HOSTED_IMAGES) {
    const webpUrl = `/images/${board}/${imageUrl}`.replace(/\.png$/, '.webp');
    return thumbnail ? toThumbUrl(webpUrl) : webpUrl;
  }

  return `https://api.${board}boardapp${board === 'tension' ? '2' : ''}.com/img/${imageUrl}`;
};

export const getBoardImageDimensions = (board: BoardName, firstImage: string) =>
  BOARD_IMAGE_DIMENSIONS[board][firstImage];
