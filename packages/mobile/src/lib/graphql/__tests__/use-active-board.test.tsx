// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserBoard } from '@boardsesh/shared-schema';

// AsyncStorage-backed preference store (in-memory).
vi.mock('@react-native-async-storage/async-storage', () => {
  let storage: Record<string, string> = {};
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage[key] ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage[key] = value;
      }),
      removeItem: vi.fn(async (key: string) => {
        delete storage[key];
      }),
      __reset: () => {
        storage = {};
      },
    },
  };
});

// Server client — the GET_DEFAULT_BOARD seed source.
const requestMock = vi.fn();
vi.mock('../client', () => ({
  getHttpClient: () => ({ request: requestMock }),
}));

const serverBoard = { uuid: 'server-1', boardType: 'kilter', layoutId: 1, sizeId: 2, setIds: '3', angle: 40 } as unknown as UserBoard;
const storedBoard = { uuid: 'stored-1', boardType: 'tension', layoutId: 9, sizeId: 8, setIds: '7', angle: 25 } as unknown as UserBoard;

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function resetAsyncStorage() {
  const asyncStorage = (await import('@react-native-async-storage/async-storage')).default as unknown as {
    __reset: () => void;
  };
  asyncStorage.__reset();
}

describe('useActiveBoard', () => {
  beforeEach(async () => {
    vi.resetModules();
    requestMock.mockReset();
    await resetAsyncStorage();
  });

  it('returns the stored board without hitting the server', async () => {
    const { setStoredActiveBoard } = await import('../../active-board-store');
    await setStoredActiveBoard(storedBoard);

    const { useActiveBoard } = await import('../use-active-board');
    const { result } = renderHook(() => useActiveBoard(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toEqual(storedBoard));
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('seeds from the server default when nothing is stored, and persists it', async () => {
    requestMock.mockResolvedValue({ defaultBoard: serverBoard });

    const { useActiveBoard } = await import('../use-active-board');
    const { getStoredActiveBoard } = await import('../../active-board-store');
    const { result } = renderHook(() => useActiveBoard(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toEqual(serverBoard));
    expect(requestMock).toHaveBeenCalledTimes(1);
    // The server default is written to storage so the next cold start reads it locally.
    await expect(getStoredActiveBoard()).resolves.toEqual(serverBoard);
  });

  it('returns null (and stores nothing) when there is no stored or server board', async () => {
    requestMock.mockResolvedValue({ defaultBoard: null });

    const { useActiveBoard } = await import('../use-active-board');
    const { getStoredActiveBoard } = await import('../../active-board-store');
    const { result } = renderHook(() => useActiveBoard(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    await expect(getStoredActiveBoard()).resolves.toBeNull();
  });

  it('setActiveBoard persists and updates the cache so reads see the new board', async () => {
    requestMock.mockResolvedValue({ defaultBoard: serverBoard });

    const { useActiveBoard, useSetActiveBoard } = await import('../use-active-board');
    const { getStoredActiveBoard } = await import('../../active-board-store');
    const sharedWrapper = wrapper();

    const read = renderHook(() => useActiveBoard(), { wrapper: sharedWrapper });
    const setter = renderHook(() => useSetActiveBoard(), { wrapper: sharedWrapper });
    await waitFor(() => expect(read.result.current.data).toEqual(serverBoard));

    await act(async () => {
      await setter.result.current(storedBoard);
    });

    await waitFor(() => expect(read.result.current.data).toEqual(storedBoard));
    await expect(getStoredActiveBoard()).resolves.toEqual(storedBoard);
  });
});
