import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import type { PopularBoardConfig } from '@boardsesh/shared-schema';
import type { BoardDetails } from '@/app/lib/types';

const getBoardDetailsForBoardMock = vi.fn();
const getImageUrlMock = vi.fn();

vi.mock('@/app/lib/board-utils', () => ({
  getBoardDetailsForBoard: (...args: unknown[]) => getBoardDetailsForBoardMock(...args),
}));

vi.mock('@/app/components/board-renderer/util', () => ({
  getImageUrl: (...args: unknown[]) => getImageUrlMock(...args),
}));

import { buildPopularLcpImageUrl, selectHomeLcpHints } from '../popular-lcp-preload';

function makeConfig(overrides: Partial<PopularBoardConfig> = {}): PopularBoardConfig {
  return {
    boardType: 'kilter',
    layoutId: 1,
    sizeId: 10,
    setIds: [1, 2],
    setNames: ['Bolt-Ons', 'Screw-Ons'],
    displayName: 'OG 12x12',
    layoutName: 'OG',
    sizeName: '12x12',
    sizeDescription: 'Full Ride',
    boardCount: 100,
    totalAscents: 1000,
    climbCount: 5000,
  };
}

const stubBoardDetails: BoardDetails = {
  board_name: 'kilter',
  layout_id: 1,
  size_id: 10,
  set_ids: [1, 2],
  images_to_holds: { 'screen-1.png': [], 'screen-2.png': [] },
  holdsData: [],
  edge_left: 0,
  edge_right: 100,
  edge_bottom: 0,
  edge_top: 100,
  boardWidth: 100,
  boardHeight: 100,
  supportsMirroring: false,
} as BoardDetails;

beforeEach(() => {
  getBoardDetailsForBoardMock.mockReset();
  getImageUrlMock.mockReset();
});

describe('buildPopularLcpImageUrl', () => {
  it('returns null when the popular configs list is empty (backend unreachable fallback)', () => {
    expect(buildPopularLcpImageUrl([])).toBeNull();
    expect(getBoardDetailsForBoardMock).not.toHaveBeenCalled();
  });

  it('builds a thumbnail URL for the first config using its first image_to_holds key', () => {
    getBoardDetailsForBoardMock.mockReturnValue(stubBoardDetails);
    getImageUrlMock.mockReturnValue('/images/kilter/thumbs/screen-1.webp');

    const url = buildPopularLcpImageUrl([makeConfig(), makeConfig({ layoutId: 9 })]);

    expect(url).toBe('/images/kilter/thumbs/screen-1.webp');
    // Looked up details for the FIRST config (layoutId: 1), not the second.
    expect(getBoardDetailsForBoardMock).toHaveBeenCalledTimes(1);
    expect(getBoardDetailsForBoardMock).toHaveBeenCalledWith({
      board_name: 'kilter',
      layout_id: 1,
      size_id: 10,
      set_ids: [1, 2],
    });
    // thumbnail flag (third arg) must be true so the preload matches the
    // actual <image> request the browser will make for the card thumbnail.
    expect(getImageUrlMock).toHaveBeenCalledWith('screen-1.png', 'kilter', true);
  });

  it('returns null when board details have no images_to_holds entries', () => {
    getBoardDetailsForBoardMock.mockReturnValue({ ...stubBoardDetails, images_to_holds: {} });
    expect(buildPopularLcpImageUrl([makeConfig()])).toBeNull();
    expect(getImageUrlMock).not.toHaveBeenCalled();
  });

  it('returns null when board-details lookup throws (unknown layout/size combo)', () => {
    getBoardDetailsForBoardMock.mockImplementation(() => {
      throw new Error('Unknown layout');
    });
    expect(buildPopularLcpImageUrl([makeConfig({ layoutId: 99999 })])).toBeNull();
  });
});

describe('selectHomeLcpHints', () => {
  it('preconnects to the backend and does NOT preload the board thumbnail when the beta rail renders', () => {
    // The first beta thumbnail is the LCP element in this case; preloading the
    // board thumbnail too would steal high-priority bandwidth from it.
    const hints = selectHomeLcpHints({
      recentBetaCount: 5,
      popularConfigs: [makeConfig()],
      backendOrigin: 'https://ws.boardsesh.com',
    });

    expect(hints).toEqual({ preconnectOrigin: 'https://ws.boardsesh.com', boardPreloadUrl: null });
    // The board-thumbnail lookup must be skipped entirely — no wasted work and,
    // more importantly, no second high-priority image hint.
    expect(getBoardDetailsForBoardMock).not.toHaveBeenCalled();
  });

  it('passes a null backend origin through (no preconnect emitted)', () => {
    const hints = selectHomeLcpHints({
      recentBetaCount: 3,
      popularConfigs: [makeConfig()],
      backendOrigin: null,
    });

    expect(hints).toEqual({ preconnectOrigin: null, boardPreloadUrl: null });
  });

  it('preloads the board thumbnail (no preconnect) when the beta rail is empty', () => {
    getBoardDetailsForBoardMock.mockReturnValue(stubBoardDetails);
    getImageUrlMock.mockReturnValue('/images/kilter/thumbs/screen-1.webp');

    const hints = selectHomeLcpHints({
      recentBetaCount: 0,
      popularConfigs: [makeConfig()],
      backendOrigin: 'https://ws.boardsesh.com',
    });

    // Board thumbnail is now the LCP: preload it, and don't preconnect a host
    // whose image won't render.
    expect(hints).toEqual({ preconnectOrigin: null, boardPreloadUrl: '/images/kilter/thumbs/screen-1.webp' });
    expect(getBoardDetailsForBoardMock).toHaveBeenCalledTimes(1);
  });

  it('yields no image hint at all when the beta rail is empty and there are no popular configs', () => {
    const hints = selectHomeLcpHints({
      recentBetaCount: 0,
      popularConfigs: [],
      backendOrigin: 'https://ws.boardsesh.com',
    });

    expect(hints).toEqual({ preconnectOrigin: null, boardPreloadUrl: null });
    expect(getBoardDetailsForBoardMock).not.toHaveBeenCalled();
  });
});
