import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { BoardName } from '@boardsesh/shared-schema';
import { buildThumbnailUrl } from '../lib/thumbnail-url';
import { iosSystemColors } from '../theme/ios-colors';
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
  const uri = useMemo(
    () => buildThumbnailUrl({ boardName, layoutId, sizeId, setIds, frames }),
    [boardName, layoutId, sizeId, setIds, frames],
  );

  return (
    <Image
      source={{ uri }}
      style={[styles.thumbnail, mirrored && styles.mirrored]}
      contentFit="cover"
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
    backgroundColor: `${iosSystemColors.systemGray}1A`,
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
});
