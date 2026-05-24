import type { BoardName } from '@boardsesh/shared-schema';
import { WEB_BASE_URL } from './env';

type BoardRenderParams = {
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  frames: string;
};

function buildBoardRenderUrl(params: BoardRenderParams, thumbnail: boolean): string {
  const { boardName, layoutId, sizeId, setIds, frames } = params;
  const searchParams = new URLSearchParams({
    board_name: boardName,
    layout_id: String(layoutId),
    size_id: String(sizeId),
    set_ids: setIds,
    frames,
    include_background: '1',
    ...(thumbnail ? { thumbnail: '1' } : {}),
  });
  return `${WEB_BASE_URL}/api/internal/board-render?${searchParams.toString()}`;
}

export function buildThumbnailUrl(params: BoardRenderParams): string {
  return buildBoardRenderUrl(params, true);
}

export function buildFullRenderUrl(params: BoardRenderParams): string {
  return buildBoardRenderUrl(params, false);
}
