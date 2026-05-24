import React, { useMemo } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { BoardName } from '@boardsesh/shared-schema';
import { buildFullRenderUrl } from '../lib/thumbnail-url';

type BoardImageProps = {
  frames: string;
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  mirrored?: boolean;
  style?: ViewStyle;
};

const BoardImage = React.memo(function BoardImage({
  frames,
  boardName,
  layoutId,
  sizeId,
  setIds,
  mirrored,
  style,
}: BoardImageProps) {
  const uri = useMemo(
    () => buildFullRenderUrl({ boardName, layoutId, sizeId, setIds, frames }),
    [boardName, layoutId, sizeId, setIds, frames],
  );

  return (
    <View style={[styles.container, style]}>
      <Image
        source={{ uri }}
        style={[styles.image, mirrored && styles.mirrored]}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={200}
      />
    </View>
  );
});

export { BoardImage };

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 5 / 7,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
});
