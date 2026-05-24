import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { BoardName } from '@boardsesh/shared-schema';
import { BoardRenderer } from './board-renderer/BoardRenderer';
import type { HoldPlacement } from './board-renderer/types';
import { iosSystemColors } from '../theme/ios-colors';
import { spacing, borderRadius } from '../theme/tokens';

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
    width: spacing[16],
    height: spacing[16],
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: `${iosSystemColors.systemGray}1A`,
  },
  board: {
    width: spacing[16],
  },
});
