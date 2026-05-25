import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { BoardName } from '@boardsesh/shared-schema';
import { useNativeClimbRender } from '../hooks/use-native-climb-render';
import { spacing, borderRadius } from '../theme/tokens';
import { LayeredClimbImage } from './LayeredClimbImage';

type ClimbListThumbnailProps = {
  frames: string;
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  mirrored?: boolean;
};

/**
 * Layered climb thumbnail for the list view. Wraps the shared
 * LayeredClimbImage stack in a fixed 64×64 cell with rounded corners.
 *
 * Mirror via CSS only — passing `mirrored` to the Rust renderer too
 * would double-flip, and we'd cache two PNGs per climb instead of one.
 * BoardImageNative (the play-view full-size renderer) follows the same
 * pattern.
 */
const ClimbListThumbnail = React.memo(function ClimbListThumbnail({
  frames,
  boardName,
  layoutId,
  sizeId,
  setIds,
  mirrored,
}: ClimbListThumbnailProps) {
  const { overlayUri, backgroundPaths, missingBackgroundCount } = useNativeClimbRender({
    frames,
    boardName,
    layoutId,
    sizeId,
    setIds,
  });

  return (
    <View style={styles.container}>
      <LayeredClimbImage
        overlayUri={overlayUri}
        backgroundPaths={backgroundPaths}
        missingBackgroundCount={missingBackgroundCount}
        mirrored={mirrored}
        recyclingKey={frames}
      />
    </View>
  );
});

export { ClimbListThumbnail };

const styles = StyleSheet.create({
  container: {
    width: spacing[16],
    height: spacing[16],
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
});
