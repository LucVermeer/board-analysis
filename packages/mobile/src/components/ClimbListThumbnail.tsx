import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { BoardName } from '@boardsesh/shared-schema';
import { useNativeClimbRender } from '../hooks/use-native-climb-render';
import { spacing, borderRadius } from '../theme/tokens';

type ClimbListThumbnailProps = {
  frames: string;
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  mirrored?: boolean;
};

/**
 * Layered climb thumbnail for the list view. The bundled board
 * background images render synchronously underneath; the holds-only
 * overlay PNG (from the Rust renderer) fades in on top once available.
 * Both layers use contentFit="contain" so the native-resolution overlay
 * scales down cleanly to the 64×64 list cell.
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
  const { overlayUri, backgroundPaths } = useNativeClimbRender({
    frames,
    boardName,
    layoutId,
    sizeId,
    setIds,
  });

  return (
    <View style={[styles.container, mirrored && styles.mirrored]}>
      {backgroundPaths.map((path) => (
        <Image
          key={path}
          source={{ uri: `file://${path}` }}
          style={styles.layer}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      ))}
      {overlayUri && (
        <Image
          source={{ uri: overlayUri }}
          style={styles.layer}
          contentFit="contain"
          recyclingKey={frames}
          cachePolicy="memory-disk"
          transition={150}
        />
      )}
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
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
});
