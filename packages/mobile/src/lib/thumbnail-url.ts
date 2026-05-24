import type { BoardName } from '@boardsesh/shared-schema';

const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://www.boardsesh.com';

export function buildThumbnailUrl(params: {
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  frames: string;
}): string {
  const { boardName, layoutId, sizeId, setIds, frames } = params;
  return (
    `${WEB_BASE_URL}/api/internal/board-render` +
    `?board_name=${boardName}` +
    `&layout_id=${layoutId}` +
    `&size_id=${sizeId}` +
    `&set_ids=${setIds}` +
    `&frames=${encodeURIComponent(frames)}` +
    `&thumbnail=1` +
    `&include_background=1`
  );
}
