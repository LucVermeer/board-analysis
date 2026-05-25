import React from 'react';
import { View, type ViewStyle } from 'react-native';
import type { BoardName } from '@boardsesh/shared-schema';
import { useNativeClimbRender } from '../hooks/use-native-climb-render';
import { LayeredClimbImage } from './LayeredClimbImage';

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
 * climb detail page. Wraps the shared LayeredClimbImage stack in an
 * aspect-ratio-locked container so the bundled board background and
 * holds-only overlay line up perfectly regardless of native source
 * dimensions.
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
  const { overlayUri, backgroundPaths, missingBackgroundCount } = useNativeClimbRender({
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
      <LayeredClimbImage
        overlayUri={overlayUri}
        backgroundPaths={backgroundPaths}
        missingBackgroundCount={missingBackgroundCount}
        mirrored={mirrored}
      />
    </View>
  );
});

export { BoardImageNative };
