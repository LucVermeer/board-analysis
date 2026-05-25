import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { BoardName } from '@boardsesh/shared-schema';
import { useNativeClimbRender } from '../hooks/use-native-climb-render';

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
 * Full-size layered board image, suited for the PlayView drawer and the
 * climb detail page. The bundled board background images render
 * synchronously underneath; the holds-only overlay PNG (from the Rust
 * renderer) fades in on top once available. Both use contentFit="contain"
 * inside an aspect-ratio-locked container so they line up perfectly
 * regardless of native source dimensions.
 *
 * Mirrors via CSS to match the SVG renderer's behavior (background +
 * holds flipped together) — the Rust `mirrored` flag is intentionally
 * not used here, so a single cached PNG serves both orientations.
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
  const { overlayUri, backgroundPaths } = useNativeClimbRender({
    frames,
    boardName,
    layoutId,
    sizeId,
    setIds,
  });

  const containerStyle: ViewStyle = {
    width: '100%',
    aspectRatio: boardWidth / boardHeight,
    ...style,
  };

  return (
    <View style={containerStyle}>
      <View style={[styles.stack, mirrored && styles.mirrored]}>
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
            cachePolicy="memory-disk"
            transition={150}
          />
        )}
      </View>
    </View>
  );
});

export { BoardImageNative };

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
