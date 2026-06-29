import { describe, it, expect } from 'vitest';
import { getAllLayouts, getSizesForLayoutId } from '@boardsesh/board-constants/product-sizes';
import { MOONBOARD_LAYOUTS, MOONBOARD_SETS, MOONBOARD_SIZE } from '@boardsesh/board-config';
import { getBoardConfigForPlaylist } from '../board-details-for-playlist';
import { getBoardRenderData } from '../../board-details';

function largestSizeId(layoutId: number): number {
  const sizes = getSizesForLayoutId('kilter', layoutId);
  const largest = sizes.reduce((best, size) => {
    const area = (size.edgeRight - size.edgeLeft) * (size.edgeTop - size.edgeBottom);
    const bestArea = (best.edgeRight - best.edgeLeft) * (best.edgeTop - best.edgeBottom);
    return area > bestArea ? size : best;
  });
  return largest.id;
}

describe('getBoardConfigForPlaylist', () => {
  it('returns the largest-area size and all its sets for a real kilter layout', () => {
    const layouts = getAllLayouts('kilter');
    expect(layouts.length).toBeGreaterThan(0);
    const layoutId = layouts[0].id;

    const config = getBoardConfigForPlaylist('kilter', layoutId);
    expect(config).not.toBeNull();
    expect(config?.boardName).toBe('kilter');
    expect(config?.layoutId).toBe(layoutId);
    expect(config?.setIds.length).toBeGreaterThan(0);
    expect(config?.sizeId).toBe(largestSizeId(layoutId));
  });

  it('falls back to a default layout when layoutId is null', () => {
    const config = getBoardConfigForPlaylist('kilter', null);
    expect(config).not.toBeNull();
    expect(config?.layoutId).toBe(getAllLayouts('kilter')[0].id);
  });

  it('returns null for an unknown board type', () => {
    expect(getBoardConfigForPlaylist('not-a-board', 1)).toBeNull();
  });

  it('returns null for an unknown layout id', () => {
    expect(getBoardConfigForPlaylist('kilter', 999999)).toBeNull();
  });

  it('resolves a moonboard config (fixed size + all sets) for a real layout', () => {
    const layoutId = MOONBOARD_LAYOUTS['moonboard-2016'].id;
    const config = getBoardConfigForPlaylist('moonboard', layoutId);

    expect(config).not.toBeNull();
    expect(config?.boardName).toBe('moonboard');
    expect(config?.layoutId).toBe(layoutId);
    expect(config?.sizeId).toBe(MOONBOARD_SIZE.id);
    expect(config?.setIds).toEqual(MOONBOARD_SETS['moonboard-2016'].map((set) => set.id));
  });

  it('falls back to the default moonboard layout when layoutId is null', () => {
    const config = getBoardConfigForPlaylist('moonboard', null);

    expect(config).not.toBeNull();
    expect(config?.boardName).toBe('moonboard');
    expect(config?.layoutId).toBe(MOONBOARD_LAYOUTS['moonboard-2024'].id);
  });

  it('produces a moonboard config that feeds getBoardRenderData end-to-end', () => {
    const config = getBoardConfigForPlaylist('moonboard', MOONBOARD_LAYOUTS['moonboard-2016'].id);
    expect(config).not.toBeNull();

    const renderData = getBoardRenderData({
      boardName: config!.boardName,
      layoutId: config!.layoutId,
      sizeId: config!.sizeId,
      setIds: config!.setIds,
    });

    expect(renderData).not.toBeNull();
    expect(renderData?.backgroundImageKeys.length).toBeGreaterThan(0);
    expect(renderData?.holdsData.length).toBeGreaterThan(0);
  });
});
