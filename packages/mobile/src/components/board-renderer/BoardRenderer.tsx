import React, { useState, useEffect } from 'react';
import { Image as RNImage, View, type ViewStyle } from 'react-native';
import Svg, { Image as SvgImage, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { BoardRendererProps } from './types';
import { useParseFrames } from './use-parse-frames';
import { BoardHoldOverlay } from './BoardHoldOverlay';
import { useTheme } from '../../providers/theme-provider';

/**
 * Prefetch all image URLs and return whether any failed.
 * Uses React Native's Image.prefetch which validates the URL is reachable.
 */
function useImagePrefetch(imageUrls: string[]): boolean {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prefetch() {
      try {
        await Promise.all(imageUrls.map((url) => RNImage.prefetch(url)));
      } catch {
        if (!cancelled) {
          setHasError(true);
        }
      }
    }

    if (imageUrls.length > 0) {
      setHasError(false);
      prefetch();
    }

    return () => {
      cancelled = true;
    };
  }, [imageUrls]);

  return hasError;
}

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
  style,
}: BoardRendererProps) {
  const { t } = useTranslation('common');
  const { systemColors } = useTheme();
  const imageError = useImagePrefetch(imageUrls);

  // Pass mirrored flag so individual hold positions are swapped
  // instead of flipping the entire SVG group (which would mirror the image).
  const activeHolds = useParseFrames(frames, boardName, holdsData, mirrored);

  // The SVG viewBox uses the board's native coordinate system.
  // react-native-svg will scale the content to fit the View, preserving aspect ratio.
  const viewBox = `0 0 ${boardWidth} ${boardHeight}`;

  // Container style: fills available width, height determined by aspect ratio
  const containerStyle: ViewStyle = {
    width: '100%',
    aspectRatio: boardWidth / boardHeight,
    ...style,
  };

  return (
    <View style={containerStyle}>
      <Svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        {/* Background board image(s) or fallback rectangle */}
        {imageError ? (
          <>
            <Rect x={0} y={0} width={boardWidth} height={boardHeight} fill={String(systemColors.tertiaryBackground)} />
            <SvgText
              x={boardWidth / 2}
              y={boardHeight / 2}
              textAnchor="middle"
              fontSize={Math.round(boardWidth * 0.035)}
              fill={String(systemColors.secondaryLabel)}
            >
              {t('board.imageUnavailable')}
            </SvgText>
          </>
        ) : (
          imageUrls.map((url) => (
            <SvgImage
              key={url}
              href={url}
              x={0}
              y={0}
              width={boardWidth}
              height={boardHeight}
              preserveAspectRatio="xMidYMid slice"
            />
          ))
        )}

        {/* Active hold circles overlaid on the board */}
        <BoardHoldOverlay holds={activeHolds} />
      </Svg>
    </View>
  );
});

export { BoardRenderer };
