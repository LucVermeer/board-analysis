import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Image as SvgImage } from 'react-native-svg';
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
 * 4. Optionally mirrors hold positions (without flipping the board image)
 *
 * This is the JS/SVG renderer used for thumbnails. The interactive
 * climb-detail board uses BoardImageNative + SwipeBoardCarousel, which
 * handles zoom/pan via useZoomPanGesture.
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
  fillContainer = false,
  style,
}: BoardRendererProps) {
  // Pass mirrored flag so individual hold positions are swapped
  // instead of flipping the entire SVG group (which would mirror the image).
  const activeHolds = useParseFrames(frames, boardName, holdsData, mirrored);

  // The SVG viewBox uses the board's native coordinate system.
  // react-native-svg will scale the content to fit the View, preserving aspect ratio.
  const viewBox = `0 0 ${boardWidth} ${boardHeight}`;

  // Default thumbnails derive height from board aspect ratio. Small framed
  // surfaces can opt into filling their caller-owned box; the SVG still uses
  // `meet`, so tall boards fit instead of overflowing and being clipped.
  const containerStyle: ViewStyle = fillContainer
    ? {
        width: '100%',
        height: '100%',
        ...style,
      }
    : {
        width: '100%',
        aspectRatio: boardWidth / boardHeight,
        ...style,
      };

  return (
    <View style={containerStyle}>
      <Svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
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
        <BoardHoldOverlay holds={activeHolds} />
      </Svg>
    </View>
  );
});

export { BoardRenderer };
