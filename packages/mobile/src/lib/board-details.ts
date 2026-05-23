import { getProductSize, getImageFilename, getHolePlacements } from '@boardsesh/board-constants/product-sizes';
import { BOARD_IMAGE_DIMENSIONS } from '@boardsesh/board-config';
import type { BoardName } from '@boardsesh/shared-schema';
import type { HoldPlacement } from '../components/board-renderer/types';

type BoardRenderData = {
  boardWidth: number;
  boardHeight: number;
  imageUrls: string[];
  holdsData: HoldPlacement[];
};

/**
 * Computes board rendering data (dimensions, image URLs, hold positions)
 * from board config parameters. Mirrors the web's `getBoardDetails()`.
 */
export function getBoardRenderData(params: {
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: number[];
}): BoardRenderData | null {
  const { boardName, layoutId, sizeId, setIds } = params;

  const sizeData = getProductSize(boardName, sizeId);
  if (!sizeData) return null;

  const { edgeLeft, edgeRight, edgeBottom, edgeTop } = sizeData;

  const imageFilenames: string[] = [];
  const allHoldTuples: Array<[number, number | null, number, number]> = [];

  for (const setId of setIds) {
    const imageFilename = getImageFilename(boardName, layoutId, sizeId, setId);
    if (!imageFilename) continue;

    imageFilenames.push(imageFilename);
    const holdTuples = getHolePlacements(boardName, layoutId, setId);
    allHoldTuples.push(...holdTuples);
  }

  if (imageFilenames.length === 0) return null;

  const firstImageFilename = imageFilenames[0];
  const dimensions = BOARD_IMAGE_DIMENSIONS[boardName]?.[firstImageFilename];
  const boardWidth = dimensions?.width ?? 1080;
  const boardHeight = dimensions?.height ?? 1920;

  const xSpacing = boardWidth / (edgeRight - edgeLeft);
  const ySpacing = boardHeight / (edgeTop - edgeBottom);

  const holdsData: HoldPlacement[] = allHoldTuples
    .filter(([, , x, y]) => x > edgeLeft && x < edgeRight && y > edgeBottom && y < edgeTop)
    .map(([holdId, mirroredHoldId, x, y]) => ({
      id: holdId,
      mirroredHoldId,
      cx: (x - edgeLeft) * xSpacing,
      cy: boardHeight - (y - edgeBottom) * ySpacing,
      r: xSpacing * 4,
    }));

  const imageUrls = imageFilenames.map((filename) => `https://www.boardsesh.com/images/${boardName}/${filename}`);

  return { boardWidth, boardHeight, imageUrls, holdsData };
}
