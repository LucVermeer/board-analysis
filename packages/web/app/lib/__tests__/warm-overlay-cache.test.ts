import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';

// Isolate the warming logic from the real URL builders — the test only cares
// which URLs get fetched, not how they're assembled.
vi.mock('@/app/components/board-renderer/util', () => ({
  buildOverlayUrl: vi.fn(() => '/api/internal/board-render?overlay'),
  buildOgBoardRenderUrl: vi.fn(() => 'https://ws.boardsesh.com/og/climb?og'),
}));

import { warmOverlays } from '../warm-overlay-cache';
import { buildOgBoardRenderUrl } from '@/app/components/board-renderer/util';

type WarmOverlaysArg = Parameters<typeof warmOverlays>[0];
const boardDetails = { board_name: 'kilter' } as unknown as WarmOverlaysArg['boardDetails'];
const climbs = [{ frames: 'p1r12p2r13' }];

describe('warmOverlays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildOgBoardRenderUrl).mockReturnValue('https://ws.boardsesh.com/og/climb?og');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ body: null }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('warms both the overlay and the absolute og image on the full climb-view path', async () => {
    await warmOverlays({ boardDetails, climbs, variant: 'full' });

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/internal/board-render?overlay'));
    expect(fetch).toHaveBeenCalledWith('https://ws.boardsesh.com/og/climb?og');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('warms only the overlay for a thumbnail list — no per-row og render', async () => {
    await warmOverlays({ boardDetails, climbs, variant: 'thumbnail' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/internal/board-render?overlay'));
    expect(buildOgBoardRenderUrl).not.toHaveBeenCalled();
  });

  it('skips the relative og fallback (backend origin unresolvable)', async () => {
    vi.mocked(buildOgBoardRenderUrl).mockReturnValue('/api/og/climb?relative');

    await warmOverlays({ boardDetails, climbs, variant: 'full' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalledWith('/api/og/climb?relative');
  });

  it('swallows fetch failures instead of rejecting', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    await expect(warmOverlays({ boardDetails, climbs, variant: 'full' })).resolves.toBeUndefined();
  });
});
