import React, { useCallback, useMemo } from 'react';
import type { BoardDetails } from '@/app/lib/types';
import { getImageUrl, buildOverlayUrl } from './util';
import { THUMBNAIL_WIDTH } from './types';
import { trackRenderError, type RenderContext } from '@/app/lib/rendering-metrics';

// Use CSS Grid stacking (gridArea: 1/1) instead of absolute positioning to avoid
// iOS 18.x WebKit bugs with absolutely positioned images in aspect-ratio containers.
const layerStyle: React.CSSProperties = {
  gridArea: '1 / 1',
  width: '100%',
  height: '100%',
  objectFit: 'fill',
  display: 'block',
};

const layerContainStyle: React.CSSProperties = {
  ...layerStyle,
  objectFit: 'contain',
};

export type BoardImageLayersProps = {
  boardDetails: BoardDetails;
  frames?: string;
  mirrored: boolean;
  thumbnail?: boolean;
  /** Use object-fit: contain (for swipe carousel where container controls sizing) */
  contain?: boolean;
  /** Additional styles for the container div */
  style?: React.CSSProperties;
  /** Set fetchpriority="high" for LCP-critical images */
  fetchPriority?: 'high' | 'low' | 'auto';
};

/**
 * Renders a board as layered images:
 * - Background: static board images (cached per board config, shared across all climbs)
 * - Overlay: transparent WebP with hold circles from the WASM renderer (cached per climb)
 * - Mirroring: CSS scaleX(-1) on the container (no separate render needed)
 */
const BoardImageLayers = React.memo(function BoardImageLayers({
  boardDetails,
  frames,
  mirrored,
  thumbnail,
  contain,
  style,
  fetchPriority,
}: BoardImageLayersProps) {
  const overlayUrl = frames ? buildOverlayUrl(boardDetails, frames, thumbnail) : null;
  const backgroundUrls = useMemo(
    () => Object.keys(boardDetails.images_to_holds).map((img) => getImageUrl(img, boardDetails.board_name, thumbnail)),
    [boardDetails.images_to_holds, boardDetails.board_name, thumbnail],
  );

  const containerStyle = useMemo<React.CSSProperties>(
    () => ({
      display: 'grid',
      overflow: 'hidden',
      ...style,
      transform: mirrored ? 'scaleX(-1)' : style?.transform,
    }),
    [style, mirrored],
  );

  const imgStyle = contain || thumbnail ? layerContainStyle : layerStyle;

  let renderContext: RenderContext = 'card';
  if (thumbnail) {
    renderContext = 'thumbnail';
  } else if (contain) {
    renderContext = 'full-board';
  }

  const handleOverlayError = useCallback(() => {
    trackRenderError(renderContext, 'wasm');
  }, [renderContext]);

  // Use actual thumbnail dimensions for HTML width/height hints so the browser
  // reserves the correct aspect ratio before the image loads.
  const imgWidth = thumbnail ? THUMBNAIL_WIDTH : boardDetails.boardWidth;
  const imgHeight = thumbnail
    ? Math.round((THUMBNAIL_WIDTH * boardDetails.boardHeight) / boardDetails.boardWidth)
    : boardDetails.boardHeight;

  return (
    <div style={containerStyle}>
      {overlayUrl ? (
        // Single composited image: background + overlay baked together server-side
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={overlayUrl}
          alt=""
          width={imgWidth}
          height={imgHeight}
          style={imgStyle}
          fetchPriority={fetchPriority}
          loading={fetchPriority === 'high' ? undefined : 'lazy'}
          onError={handleOverlayError}
        />
      ) : (
        // No climb selected: just show background layers
        backgroundUrls.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt=""
            width={imgWidth}
            height={imgHeight}
            style={imgStyle}
            fetchPriority={i === 0 ? fetchPriority : undefined}
            loading={i === 0 && fetchPriority === 'high' ? undefined : 'lazy'}
          />
        ))
      )}
    </div>
  );
});

export default BoardImageLayers;
