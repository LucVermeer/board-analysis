import React from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { BoardName } from '@boardsesh/shared-schema';
import { useNativeThumbnail } from '../hooks/use-native-thumbnail';
import { spacing, borderRadius } from '../theme/tokens';

type ClimbListThumbnailProps = {
  frames: string;
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  mirrored?: boolean;
};

const ClimbListThumbnail = React.memo(function ClimbListThumbnail({
  frames,
  boardName,
  layoutId,
  sizeId,
  setIds,
  mirrored,
}: ClimbListThumbnailProps) {
  // Mirror via CSS only — passing `mirrored` to the Rust renderer too
  // would double-flip, and we'd cache two PNGs per climb instead of one.
  // BoardImageNative (the play-view full-size renderer) follows the
  // same pattern.
  const { uri } = useNativeThumbnail({ frames, boardName, layoutId, sizeId, setIds });

  return (
    <Image
      source={{ uri }}
      style={[styles.thumbnail, mirrored && styles.mirrored]}
      contentFit="contain"
      recyclingKey={frames}
      cachePolicy="memory-disk"
      transition={150}
    />
  );
});

export { ClimbListThumbnail };

const styles = StyleSheet.create({
  thumbnail: {
    width: spacing[16],
    height: spacing[16],
    borderRadius: borderRadius.md,
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
});
