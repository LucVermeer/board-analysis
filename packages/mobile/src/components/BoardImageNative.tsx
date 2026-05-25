import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { BoardName } from '@boardsesh/shared-schema';
import { useNativeThumbnail } from '../hooks/use-native-thumbnail';

type BoardImageNativeProps = {
  frames: string;
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  boardWidth: number;
  boardHeight: number;
  mirrored?: boolean;
  style?: ViewStyle;
};

/**
 * Full-size native-renderer-backed board image, suited for the PlayView
 * drawer (and any other surface that needs a sharp, interactive-size
 * board render). Mirrors via CSS to match the SVG renderer's behavior
 * (background + holds flipped together) — the Rust `mirrored` flag is
 * intentionally not used here, so a single cached PNG serves both
 * orientations.
 */
const BoardImageNative = React.memo(function BoardImageNative({
  frames,
  boardName,
  layoutId,
  sizeId,
  setIds,
  boardWidth,
  boardHeight,
  mirrored,
  style,
}: BoardImageNativeProps) {
  const { uri } = useNativeThumbnail({
    frames,
    boardName,
    layoutId,
    sizeId,
    setIds,
    outputWidth: boardWidth,
    backgroundQuality: 'full',
  });

  const containerStyle: ViewStyle = {
    width: '100%',
    aspectRatio: boardWidth / boardHeight,
    ...style,
  };

  return (
    <View style={containerStyle}>
      <Image
        source={{ uri }}
        style={[styles.image, mirrored && styles.mirrored]}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={150}
      />
    </View>
  );
});

export { BoardImageNative };

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
});
