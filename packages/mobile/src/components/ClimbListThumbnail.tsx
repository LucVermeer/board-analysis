import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { BoardName } from '@boardsesh/shared-schema';
import { useNativeClimbRender } from '../hooks/use-native-climb-render';
import { borderRadius } from '../theme/tokens';
import { LayeredClimbImage } from './LayeredClimbImage';

/**
 * Portrait dimensions of the list thumbnail cell. Exported so ClimbListRow
 * can size its wrapper and align the row separator to the thumbnail's right
 * edge from a single source of truth. Portrait (not square) so the portrait
 * board image fills the cell instead of letterboxing to ~40px wide.
 */
export const THUMBNAIL_WIDTH = 76;
export const THUMBNAIL_HEIGHT = 96;

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
 * LayeredClimbImage stack in a fixed 76×96 portrait cell with rounded
 * corners, using the filled hold style so the lit climb reads as solid
 * dots against the board photo at this small size.
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
    filledStyle: true,
    // Render the overlay + resolve the thumb-sized background at ~400px
    // (covers the 76×96 cell at up to ~3× DPR) so expo-image never has to
    // downscale a ~1080px source on the main thread while scrolling.
    renderWidth: 400,
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
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
});
