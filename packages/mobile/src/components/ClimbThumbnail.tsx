import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { BoardName } from '@boardsesh/shared-schema';
import { BoardRenderer } from './board-renderer/BoardRenderer';
import type { HoldPlacement } from './board-renderer/types';

type ClimbThumbnailProps = {
  frames: string;
  boardName: BoardName;
  boardWidth: number;
  boardHeight: number;
  imageUrls: string[];
  holdsData: HoldPlacement[];
  mirrored?: boolean;
};

const ClimbThumbnail = React.memo(function ClimbThumbnail({
  frames,
  boardName,
  boardWidth,
  boardHeight,
  imageUrls,
  holdsData,
  mirrored,
}: ClimbThumbnailProps) {
  return (
    <View style={styles.container}>
      <BoardRenderer
        frames={frames}
        boardName={boardName}
        boardWidth={boardWidth}
        boardHeight={boardHeight}
        imageUrls={imageUrls}
        holdsData={holdsData}
        mirrored={mirrored}
        style={styles.board}
      />
    </View>
  );
});

export { ClimbThumbnail };

const styles = StyleSheet.create({
  container: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  board: {
    width: 64,
  },
});
