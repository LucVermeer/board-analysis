import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { PopularBoardConfig, PopularBoardConfigConnection } from '@boardsesh/shared-schema';
import { usePopularBoardConfigs } from '../use-popular-board-configs';

// --- Mocks ---

const mockRequest = vi.fn();

vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: () => ({ request: mockRequest }),
}));

vi.mock('@boardsesh/graphql/operations', () => ({
  GET_POPULAR_BOARD_CONFIGS: 'GET_POPULAR_BOARD_CONFIGS_QUERY',
}));

// --- Import after mocks ---

// --- Helpers ---

function makeConfig(
  boardType: string,
  climbCount: number,
  overrides?: Partial<PopularBoardConfig>,
): PopularBoardConfig {
  return {
    boardType,
    layoutId: 1,
    layoutName: `Layout for ${boardType}`,
    sizeId: 10,
    sizeName: `Size 10`,
    sizeDescription: `10x10`,
    setIds: [1, 2],
    setNames: ['Set A', 'Set B'],
    climbCount,
    totalAscents: climbCount * 10,
    boardCount: 5,
    displayName: `Layout ${boardType} Size 10`,
    ...overrides,
  };
}

function makeResponse(
  configs: PopularBoardConfig[],
  hasMore: boolean,
): { popularBoardConfigs: PopularBoardConfigConnection } {
  return {
    popularBoardConfigs: {
      configs,
      totalCount: configs.length,
      hasMore,
    },
  };
}

// --- Tests ---

describe('usePopularBoardConfigs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns isLoading=true and empty configs initially', () => {
    // Never resolve so we stay in loading state
    mockRequest.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePopularBoardConfigs());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.configs).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.hasMore).toBe(false);
  });

  it('fetches first page on mount and sets configs/hasMore correctly', async () => {
    const page1 = [makeConfig('kilter', 500), makeConfig('tension', 300)];
    mockRequest.mockResolvedValueOnce(makeResponse(page1, true));

    const { result } = renderHook(() => usePopularBoardConfigs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.configs).toHaveLength(2);
    expect(result.current.configs[0].boardType).toBe('kilter');
    expect(result.current.configs[1].boardType).toBe('tension');
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('passes limit and offset=0 to the initial request', async () => {
    mockRequest.mockResolvedValueOnce(makeResponse([], false));

    const { result } = renderHook(() => usePopularBoardConfigs({ limit: 5 }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith('GET_POPULAR_BOARD_CONFIGS_QUERY', {
      input: { limit: 5, offset: 0 },
    });
  });

  it('uses default limit of 12 when none provided', async () => {
    mockRequest.mockResolvedValueOnce(makeResponse([], false));

    const { result } = renderHook(() => usePopularBoardConfigs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockRequest).toHaveBeenCalledWith('GET_POPULAR_BOARD_CONFIGS_QUERY', {
      input: { limit: 12, offset: 0 },
    });
  });

  it('loadMore fetches next page and appends to existing configs', async () => {
    const page1 = [makeConfig('kilter', 500), makeConfig('tension', 300)];
    const page2 = [makeConfig('moonboard', 200), makeConfig('decoy', 100)];

    mockRequest.mockResolvedValueOnce(makeResponse(page1, true));

    const { result } = renderHook(() => usePopularBoardConfigs({ limit: 2 }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.configs).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);

    // Set up the next page response
    mockRequest.mockResolvedValueOnce(makeResponse(page2, false));

    // Call loadMore
    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.isLoadingMore).toBe(false);
    });

    // Should have appended page2 to page1
    expect(result.current.configs).toHaveLength(4);
    expect(result.current.configs[0].boardType).toBe('kilter');
    expect(result.current.configs[1].boardType).toBe('tension');
    expect(result.current.configs[2].boardType).toBe('moonboard');
    expect(result.current.configs[3].boardType).toBe('decoy');
    expect(result.current.hasMore).toBe(false);
  });

  it('passes correct offset for subsequent pages', async () => {
    const page1 = [makeConfig('a', 100), makeConfig('b', 90), makeConfig('c', 80)];
    mockRequest.mockResolvedValueOnce(makeResponse(page1, true));

    const { result } = renderHook(() => usePopularBoardConfigs({ limit: 3 }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const page2 = [makeConfig('d', 70)];
    mockRequest.mockResolvedValueOnce(makeResponse(page2, false));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.isLoadingMore).toBe(false);
    });

    // Second call should have offset = 3 (length of first page)
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenNthCalledWith(2, 'GET_POPULAR_BOARD_CONFIGS_QUERY', {
      input: { limit: 3, offset: 3 },
    });
  });

  it('sets isLoadingMore=true while fetching next page', async () => {
    const page1 = [makeConfig('kilter', 500)];
    mockRequest.mockResolvedValueOnce(makeResponse(page1, true));

    const { result } = renderHook(() => usePopularBoardConfigs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Make the next request hang so we can observe isLoadingMore
    mockRequest.mockReturnValueOnce(new Promise(() => {}));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.isLoadingMore).toBe(true);
    });

    // isLoading (initial) should remain false
    expect(result.current.isLoading).toBe(false);
    // Existing configs should still be present
    expect(result.current.configs).toHaveLength(1);
  });

  it('sets error when initial fetch fails', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => usePopularBoardConfigs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load board configurations');
    expect(result.current.configs).toEqual([]);
  });

  it('does not clear existing configs when loadMore fails', async () => {
    const page1 = [makeConfig('kilter', 500), makeConfig('tension', 300)];
    mockRequest.mockResolvedValueOnce(makeResponse(page1, true));

    const { result } = renderHook(() => usePopularBoardConfigs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.configs).toHaveLength(2);

    // Fail the loadMore request
    mockRequest.mockRejectedValueOnce(new Error('Server error'));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.isLoadingMore).toBe(false);
    });

    // Existing configs should be preserved
    expect(result.current.configs).toHaveLength(2);
    expect(result.current.configs[0].boardType).toBe('kilter');
    // Error should NOT be set for loadMore failures (only initial)
    expect(result.current.error).toBeNull();
  });

  it('prevents concurrent loadMore calls (no-op while fetching)', async () => {
    const page1 = [makeConfig('kilter', 500)];
    mockRequest.mockResolvedValueOnce(makeResponse(page1, true));

    const { result } = renderHook(() => usePopularBoardConfigs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Create a controllable promise for loadMore
    let resolvePage2: ((value: unknown) => void) | undefined;
    const page2Promise = new Promise((resolve) => {
      resolvePage2 = resolve;
    });
    mockRequest.mockReturnValueOnce(page2Promise);

    // First loadMore call
    act(() => {
      result.current.loadMore();
    });

    // Second loadMore call while first is still in progress - should be a no-op
    act(() => {
      result.current.loadMore();
    });

    // Only 2 total calls: initial fetch + one loadMore (second was ignored)
    expect(mockRequest).toHaveBeenCalledTimes(2);

    // Resolve to clean up
    const page2 = [makeConfig('tension', 300)];
    resolvePage2!(makeResponse(page2, false));

    await waitFor(() => {
      expect(result.current.isLoadingMore).toBe(false);
    });

    expect(result.current.configs).toHaveLength(2);
  });

  it('handles empty results from backend', async () => {
    mockRequest.mockResolvedValueOnce(makeResponse([], false));

    const { result } = renderHook(() => usePopularBoardConfigs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.configs).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not call loadMore when hasMore is false', async () => {
    const page1 = [makeConfig('kilter', 500)];
    mockRequest.mockResolvedValueOnce(makeResponse(page1, false));

    const { result } = renderHook(() => usePopularBoardConfigs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasMore).toBe(false);

    // Attempt to loadMore - should be a no-op since hasMore is false
    act(() => {
      result.current.loadMore();
    });

    // No additional request should have been made
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('supports multiple pagination cycles', async () => {
    const page1 = [makeConfig('a', 100)];
    const page2 = [makeConfig('b', 90)];
    const page3 = [makeConfig('c', 80)];

    mockRequest.mockResolvedValueOnce(makeResponse(page1, true));

    const { result } = renderHook(() => usePopularBoardConfigs({ limit: 1 }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.configs).toHaveLength(1);

    // Page 2
    mockRequest.mockResolvedValueOnce(makeResponse(page2, true));
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => {
      expect(result.current.isLoadingMore).toBe(false);
    });
    expect(result.current.configs).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);

    // Page 3 (last page)
    mockRequest.mockResolvedValueOnce(makeResponse(page3, false));
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => {
      expect(result.current.isLoadingMore).toBe(false);
    });
    expect(result.current.configs).toHaveLength(3);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.configs.map((c) => c.boardType)).toEqual(['a', 'b', 'c']);

    // No more pages - loadMore should be a no-op
    act(() => {
      result.current.loadMore();
    });
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });

  it('re-fetches from offset 0 when limit changes', async () => {
    const page1 = [makeConfig('kilter', 500)];
    mockRequest.mockResolvedValueOnce(makeResponse(page1, false));

    const { result, rerender } = renderHook(({ limit }: { limit: number }) => usePopularBoardConfigs({ limit }), {
      initialProps: { limit: 5 },
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockRequest).toHaveBeenCalledWith('GET_POPULAR_BOARD_CONFIGS_QUERY', {
      input: { limit: 5, offset: 0 },
    });

    // Change the limit
    const newPage = [makeConfig('tension', 300), makeConfig('moonboard', 200)];
    mockRequest.mockResolvedValueOnce(makeResponse(newPage, false));

    rerender({ limit: 10 });

    await waitFor(() => {
      expect(result.current.configs).toHaveLength(2);
    });

    // Should have re-fetched with the new limit and offset=0
    expect(mockRequest).toHaveBeenLastCalledWith('GET_POPULAR_BOARD_CONFIGS_QUERY', {
      input: { limit: 10, offset: 0 },
    });
  });

  // --- initialData (SSR) tests ---

  it('skips initial fetch when initialData is provided', async () => {
    const ssrData = [makeConfig('kilter', 500), makeConfig('tension', 300)];

    renderHook(() => usePopularBoardConfigs({ initialData: ssrData }));

    // Wait a tick to ensure no async fetch fires
    await new Promise((r) => setTimeout(r, 50));

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('starts with isLoading=false and configs populated from initialData', () => {
    const ssrData = [makeConfig('kilter', 500), makeConfig('tension', 300)];

    const { result } = renderHook(() => usePopularBoardConfigs({ initialData: ssrData }));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.configs).toHaveLength(2);
    expect(result.current.configs[0].boardType).toBe('kilter');
    expect(result.current.configs[1].boardType).toBe('tension');
    // 2 items < default limit of 12, so hasMore is false (server returned everything)
    expect(result.current.hasMore).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('loadMore uses correct offset from initialData length', async () => {
    const ssrData = [makeConfig('kilter', 500), makeConfig('tension', 300), makeConfig('moonboard', 200)];
    const page2 = [makeConfig('decoy', 100)];
    mockRequest.mockResolvedValueOnce(makeResponse(page2, false));

    const { result } = renderHook(() => usePopularBoardConfigs({ limit: 3, initialData: ssrData }));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.isLoadingMore).toBe(false);
    });

    // Offset should be 3 (initialData.length)
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith('GET_POPULAR_BOARD_CONFIGS_QUERY', {
      input: { limit: 3, offset: 3 },
    });

    // Should append to initial data
    expect(result.current.configs).toHaveLength(4);
    expect(result.current.configs[3].boardType).toBe('decoy');
    expect(result.current.hasMore).toBe(false);
  });

  it('treats empty initialData array as no initial data and fetches', async () => {
    mockRequest.mockResolvedValueOnce(makeResponse([makeConfig('kilter', 500)], false));

    const { result } = renderHook(() => usePopularBoardConfigs({ initialData: [] }));

    // Empty array should trigger a fetch (hasInitialData is false)
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(result.current.configs).toHaveLength(1);
  });
});
