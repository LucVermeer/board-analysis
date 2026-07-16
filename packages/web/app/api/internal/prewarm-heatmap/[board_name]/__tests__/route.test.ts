import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';

vi.mock('server-only', () => ({}));

const mockExecuteRows = vi.fn();
vi.mock('@/app/lib/db/db', () => ({
  executeRows: (...args: unknown[]) => mockExecuteRows(...args),
  dbzRead: {},
}));

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
    // No layouts for this board — buildTargetsForBoard returns [] and the
    // handler completes without touching the heatmap-warming path.
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

  it('warms the requested board when the cron secret matches', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const response = await routeModule.GET(buildRequest({ authorization: 'Bearer test-secret' }), {
      params: Promise.resolve({ board_name: 'kilter' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ board: 'kilter', total: 0, warmed: 0, failed: 0 });
  });
});
