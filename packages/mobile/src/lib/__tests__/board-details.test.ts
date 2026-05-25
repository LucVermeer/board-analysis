import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@boardsesh/board-constants/product-sizes', () => ({
  getImageFilename: vi.fn(),
  getProductSize: vi.fn(),
  getHolePlacements: vi.fn(),
}));

vi.mock('@boardsesh/board-config', () => ({
  BOARD_IMAGE_DIMENSIONS: {
    kilter: {},
    tension: {},
    moonboard: {},
  },
}));

vi.mock('../env', () => ({
  WEB_BASE_URL: 'https://example.com',
}));

import { getImageFilename } from '@boardsesh/board-constants/product-sizes';
import { BOARD_IMAGE_DIMENSIONS } from '@boardsesh/board-config';
import { getBoardAspectRatio } from '../board-details';

const mockedGetImageFilename = vi.mocked(getImageFilename);

const baseParams = {
  boardName: 'kilter' as const,
  layoutId: 1,
  sizeId: 10,
};

describe('getBoardAspectRatio', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    BOARD_IMAGE_DIMENSIONS.kilter = {};
  });

  it('returns the fallback ratio when setIds is empty', () => {
    const result = getBoardAspectRatio({ ...baseParams, setIds: [] });
    expect(result).toBeCloseTo(1080 / 1920);
  });

  it('returns the fallback ratio when getImageFilename returns null for all setIds', () => {
    mockedGetImageFilename.mockReturnValue(null);
    const result = getBoardAspectRatio({ ...baseParams, setIds: [1, 2] });
    expect(result).toBeCloseTo(1080 / 1920);
  });

  it('returns the fallback ratio when the image filename has no dimension entry', () => {
    mockedGetImageFilename.mockReturnValue('no-match.png');
    const result = getBoardAspectRatio({ ...baseParams, setIds: [1] });
    expect(result).toBeCloseTo(1080 / 1920);
  });

  it('returns width/height when dimensions are found', () => {
    mockedGetImageFilename.mockReturnValue('board.png');
    BOARD_IMAGE_DIMENSIONS.kilter = { 'board.png': { width: 1200, height: 800 } };
    const result = getBoardAspectRatio({ ...baseParams, setIds: [1] });
    expect(result).toBeCloseTo(1200 / 800);
  });
});
