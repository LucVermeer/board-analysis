import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BoardName } from '@boardsesh/shared-schema';
import type { Climb } from '@boardsesh/queue';
import { getBoardRenderData } from '../../lib/board-details';
import { type BoardConfig } from '../../providers/drawer-host-provider';
import { BoardRenderer } from '../board-renderer/BoardRenderer';

/** Square slot size for the accessory-bar board thumbnail. */
export const ACCESSORY_THUMBNAIL_SLOT_SIZE = 40;
const ACCESSORY_THUMBNAIL_ART_MAX_SIZE = 40;
const ACCESSORY_THUMBNAIL_ART_RADIUS = 10;

function getAccessoryThumbnailBoardSize(boardWidth: number, boardHeight: number) {
  const boardAspectRatio = boardWidth / boardHeight;
  if (!Number.isFinite(boardAspectRatio) || boardAspectRatio <= 0) {
    return { width: ACCESSORY_THUMBNAIL_ART_MAX_SIZE, height: ACCESSORY_THUMBNAIL_ART_MAX_SIZE };
  }
  if (boardAspectRatio >= 1) {
    return { width: ACCESSORY_THUMBNAIL_ART_MAX_SIZE, height: ACCESSORY_THUMBNAIL_ART_MAX_SIZE / boardAspectRatio };
  }
  return { width: ACCESSORY_THUMBNAIL_ART_MAX_SIZE * boardAspectRatio, height: ACCESSORY_THUMBNAIL_ART_MAX_SIZE };
}

/**
 * The small board render shown beside the climb name in the accessory bar (the
 * floating capsule and the iOS 26 native accessory). Renders nothing if the
 * board config or render data isn't available.
 */
export function AccessoryClimbThumbnail({ climb, boardConfig }: { climb: Climb; boardConfig: BoardConfig | null }) {
  const boardRenderData = useMemo(() => {
    if (!boardConfig) return null;
    const setIdValues = boardConfig.setIds
      .split(',')
      .map((setIdText) => Number(setIdText))
      .filter((setIdValue) => Number.isFinite(setIdValue));
    if (setIdValues.length === 0) return null;
    return getBoardRenderData({
      boardName: boardConfig.boardName as BoardName,
      layoutId: boardConfig.layoutId,
      sizeId: boardConfig.sizeId,
      setIds: setIdValues,
    });
  }, [boardConfig]);

  if (!boardRenderData) return null;

  const thumbnailBoardStyle = {
    ...getAccessoryThumbnailBoardSize(boardRenderData.boardWidth, boardRenderData.boardHeight),
    borderRadius: ACCESSORY_THUMBNAIL_ART_RADIUS,
    overflow: 'hidden' as const,
  };

  return (
    <View style={styles.thumbnailSlot}>
      <BoardRenderer
        frames={climb.frames}
        boardName={boardConfig?.boardName as BoardName}
        boardWidth={boardRenderData.boardWidth}
        boardHeight={boardRenderData.boardHeight}
        imageUrls={boardRenderData.imageUrls}
        holdsData={boardRenderData.holdsData}
        mirrored={climb.mirrored === true}
        fillContainer
        style={thumbnailBoardStyle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  thumbnailSlot: {
    width: ACCESSORY_THUMBNAIL_SLOT_SIZE,
    height: ACCESSORY_THUMBNAIL_SLOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
