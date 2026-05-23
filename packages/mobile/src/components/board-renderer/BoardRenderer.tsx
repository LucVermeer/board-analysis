import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Image as SvgImage, G } from 'react-native-svg';
import type { BoardRendererProps } from './types';
import { useParseFrames } from './use-parse-frames';
import { BoardHoldOverlay } from './BoardHoldOverlay';

/**
 * Renders a climbing board with hold overlays using react-native-svg.
 *
 * The component:
 * 1. Displays the board background image(s) at full resolution in SVG coordinates
 * 2. Overlays colored circles at each active hold position based on the frames string
 * 3. Scales to fit the container width while maintaining the board's native aspect ratio
 * 4. Optionally mirrors the board horizontally
 *
 * Usage:
 * ```tsx
 * <BoardRenderer
 *   frames={climb.frames}
 *   boardName="kilter"
 *   boardWidth={1080}
 *   boardHeight={1755}
 *   imageUrls={['/images/kilter/product_sizes_layouts_sets/39-1.webp']}
 *   holdsData={boardDetails.holdsData}
 * />
 * ```
 */
const BoardRenderer = React.memo(function BoardRenderer({
  frames,
  boardName,
  boardWidth,
  boardHeight,
  imageUrls,
  holdsData,
  mirrored = false,
  style,
}: BoardRendererProps) {
  const activeHolds = useParseFrames(frames, boardName, holdsData);

  // The SVG viewBox uses the board's native coordinate system.
  // react-native-svg will scale the content to fit the View, preserving aspect ratio.
  const viewBox = `0 0 ${boardWidth} ${boardHeight}`;

  // Container style: fills available width, height determined by aspect ratio
  const containerStyle: ViewStyle = {
    width: '100%',
    aspectRatio: boardWidth / boardHeight,
    ...style,
  };

  // Mirror transform: flip horizontally around the center
  const mirrorTransform = mirrored
    ? `translate(${boardWidth}, 0) scale(-1, 1)`
    : undefined;

  return (
    <View style={containerStyle}>
      <Svg
        width="100%"
        height="100%"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <G transform={mirrorTransform}>
          {/* Background board image(s) — layered in order */}
          {imageUrls.map((url) => (
            <SvgImage
              key={url}
              href={url}
              x={0}
              y={0}
              width={boardWidth}
              height={boardHeight}
              preserveAspectRatio="xMidYMid slice"
            />
          ))}

          {/* Active hold circles overlaid on the board */}
          <BoardHoldOverlay holds={activeHolds} />
        </G>
      </Svg>
    </View>
  );
});

export { BoardRenderer };
