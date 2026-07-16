import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';

vi.mock('server-only', () => ({}));

const mockGetBoardSelectorOptions = vi.fn();
vi.mock('@/app/lib/board-constants', () => ({
  AURORA_BOARD_NAMES: ['kilter', 'tension', 'decoy', 'touchstone', 'grasshopper'],
  isAuroraBoardName: (boardName: string) =>
    ['kilter', 'tension', 'decoy', 'touchstone', 'grasshopper'].includes(boardName),
  getBoardSelectorOptions: () => mockGetBoardSelectorOptions(),
}));

const mockCachedGetHoldHeatmapData = vi.fn();
vi.mock('@/app/lib/db/queries/climbs/holds-heatmap-cache', () => ({
  cachedGetHoldHeatmapData: (...args: unknown[]) => mockCachedGetHoldHeatmapData(...args),
}));

vi.mock('@/app/lib/url-utils', () => ({
  DEFAULT_SEARCH_PARAMS: {},
}));

const routeModule = await import('../route');

function buildRequest(headers?: Record<string, string>) {
  return new Request('http://localhost/api/internal/prewarm-heatmap/kilter', { headers });
}

describe('GET /api/internal/prewarm-heatmap/[board_name]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCachedGetHoldHeatmapData.mockResolvedValue(undefined);
    // No layouts for this board by default — buildTargetsForBoard returns []
    // and the handler completes without touching the heatmap-warming path.
    mockGetBoardSelectorOptions.mockReturnValue({ layouts: {}, sizes: {}, sets: {} });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when the cron secret is missing or invalid', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const response = await routeModule.GET(buildRequest(), {
      params: Promise.resolve({ board_name: 'kilter' }),
    });

    expect(response.status).toBe(401);
    expect(mockCachedGetHoldHeatmapData).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown board name once authorized', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const response = await routeModule.GET(buildRequest({ authorization: 'Bearer test-secret' }), {
      params: Promise.resolve({ board_name: 'not-a-board' }),
    });

    expect(response.status).toBe(400);
  });

  it('warms nothing when the board has no configured layouts', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const response = await routeModule.GET(buildRequest({ authorization: 'Bearer test-secret' }), {
      params: Promise.resolve({ board_name: 'kilter' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ board: 'kilter', total: 0, warmed: 0, failed: 0 });
  });

  // Regression test for issue #2379: the old `board_products_angles` query
  // threw for every layout, was caught, and silently fell back to an empty
  // angle list — so `buildTargetsForBoard` skipped every layout and the cron
  // warmed exactly zero cache entries, every week, while still returning a
  // 200 "success" response. Angles now come from the static ANGLES source
  // (@boardsesh/board-config — no DB round trip at all), so a board with
  // real layouts/sizes/sets now builds and warms real targets.
  it('builds and warms a non-empty set of targets when the board has layouts', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    mockGetBoardSelectorOptions.mockReturnValue({
      layouts: { kilter: [{ id: 8, name: 'Original Layout' }] },
      sizes: { 'kilter-8': [{ id: 25, name: '8x12' }] },
      sets: { 'kilter-8-25': [{ id: 26, name: 'Screw-Ons' }] },
    });

    const response = await routeModule.GET(buildRequest({ authorization: 'Bearer test-secret' }), {
      params: Promise.resolve({ board_name: 'kilter' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { total: number; warmed: number; failed: number };

    expect(body.total).toBeGreaterThan(0);
    expect(body.warmed).toBe(body.total);
    expect(body.failed).toBe(0);
    expect(mockCachedGetHoldHeatmapData).toHaveBeenCalledTimes(body.total);
  });
});
