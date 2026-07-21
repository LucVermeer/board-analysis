import { describe, expect, it } from 'vitest';
import { HOLD_STATE_MAP } from '@boardsesh/board-constants/hold-states';
import { getBoardDetailsForBoard } from '../board-details';
import { buildRenderConfig, THUMBNAIL_WIDTH } from '../render-config';

const kilterDetails = getBoardDetailsForBoard({
  board_name: 'kilter',
  layout_id: 1,
  size_id: 10,
  set_ids: [1, 20],
});

const baseParams = {
  boardName: 'kilter',
  boardDetails: kilterDetails,
  frames: 'p1080r15',
  boardStates: HOLD_STATE_MAP.kilter,
};

describe('buildRenderConfig', () => {
  it('renders the OG variant with the thumbnail stroke treatment at OG scale', () => {
    const { config, ogScale } = buildRenderConfig({ ...baseParams, thumbnail: false, isOgVariant: true });
    expect(config.thumbnail).toBe(true);
    expect(ogScale).not.toBeNull();
    expect(config.output_width).toBe(Math.max(1, Math.round(kilterDetails.boardWidth * (ogScale ?? 1))));
  });

  it('renders plain thumbnails at THUMBNAIL_WIDTH', () => {
    const { config } = buildRenderConfig({ ...baseParams, thumbnail: true, isOgVariant: false });
    expect(config.thumbnail).toBe(true);
    expect(config.output_width).toBe(THUMBNAIL_WIDTH);
  });

  it('renders native requests without the thumbnail treatment at native width', () => {
    const { config, ogScale } = buildRenderConfig({ ...baseParams, thumbnail: false, isOgVariant: false });
    expect(config.thumbnail).toBe(false);
    expect(config.output_width).toBe(kilterDetails.boardWidth);
    expect(ogScale).toBeNull();
  });
});
