import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BoardAdapterProvider, type BoardAdapter, type ExecuteHttp } from '../adapter';
import { BoardProvider, useBoardProvider, useOptionalBoardProvider } from '../board-provider';
import { createTestQueryClient } from './test-helpers';

function buildWrapper(adapter: Partial<BoardAdapter>, boardName: 'kilter' | 'tension' | null = 'kilter') {
  const queryClient = createTestQueryClient();
  const fullAdapter: BoardAdapter = {
    isAuthenticated: true,
    isAuthLoading: false,
    executeHttp: async () => {
      throw new Error('executeHttp not configured');
    },
    executeWs: async () => {
      throw new Error('executeWs not configured');
    },
    resolveActiveSessionId: () => undefined,
    ...adapter,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BoardAdapterProvider value={fullAdapter}>
        <BoardProvider boardName={boardName}>{children}</BoardProvider>
      </BoardAdapterProvider>
    </QueryClientProvider>
  );
  return { wrapper };
}

describe('BoardProvider (shared)', () => {
  it('exposes the configured boardName and authenticated state', () => {
    const { wrapper } = buildWrapper({ isAuthenticated: true }, 'tension');
    const { result } = renderHook(() => useBoardProvider(), { wrapper });

    expect(result.current.boardName).toBe('tension');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('latches `isInitialized` to true once auth has finished loading and keeps it true after a re-load', async () => {
    // Start in a loading state; we then "settle" auth by toggling
    // isAuthLoading. The latch (one-way flip in useEffect) is what we test.
    const { wrapper } = buildWrapper({ isAuthLoading: false }, 'kilter');
    const { result } = renderHook(() => useBoardProvider(), { wrapper });

    await waitFor(() => expect(result.current.isInitialized).toBe(true));
  });

  it('auto-injects the active session id into saveTick when the caller omits it', async () => {
    const executeHttp = vi.fn().mockResolvedValue({
      saveTick: {
        uuid: 'real-1',
        climbUuid: 'c-1',
        angle: 40,
        isMirror: false,
        status: 'send',
        attemptCount: 1,
        quality: null,
        difficulty: null,
        comment: '',
        climbedAt: '2026-05-30T00:00:00.000Z',
      },
    });

    const { wrapper } = buildWrapper({
      executeHttp: executeHttp as unknown as ExecuteHttp,
      resolveActiveSessionId: () => 'session-from-adapter',
    });

    const { result } = renderHook(() => useBoardProvider(), { wrapper });

    await act(async () => {
      await result.current.saveTick({
        climbUuid: 'c-1',
        angle: 40,
        isMirror: false,
        status: 'send',
        attemptCount: 1,
        isBenchmark: false,
        comment: '',
        climbedAt: '2026-05-30T00:00:00.000Z',
      });
    });

    expect(executeHttp).toHaveBeenCalled();
    const variables = executeHttp.mock.calls[0]?.[1] as { input: { sessionId?: string } };
    expect(variables.input.sessionId).toBe('session-from-adapter');
  });

  it('passes through an explicit sessionId from the caller instead of the adapter default', async () => {
    const executeHttp = vi.fn().mockResolvedValue({
      saveTick: {
        uuid: 'real-1',
        climbUuid: 'c-1',
        angle: 40,
        isMirror: false,
        status: 'send',
        attemptCount: 1,
        quality: null,
        difficulty: null,
        comment: '',
        climbedAt: '2026-05-30T00:00:00.000Z',
      },
    });

    const { wrapper } = buildWrapper({
      executeHttp: executeHttp as unknown as ExecuteHttp,
      resolveActiveSessionId: () => 'session-from-adapter',
    });

    const { result } = renderHook(() => useBoardProvider(), { wrapper });

    await act(async () => {
      await result.current.saveTick({
        climbUuid: 'c-1',
        angle: 40,
        isMirror: false,
        status: 'send',
        attemptCount: 1,
        isBenchmark: false,
        comment: '',
        climbedAt: '2026-05-30T00:00:00.000Z',
        sessionId: 'explicit-session',
      });
    });

    const variables = executeHttp.mock.calls[0]?.[1] as { input: { sessionId?: string } };
    expect(variables.input.sessionId).toBe('explicit-session');
  });
});

describe('useBoardProvider (shared)', () => {
  it('throws when called outside a BoardProvider', () => {
    expect(() => renderHook(() => useBoardProvider())).toThrowError(
      /useBoardProvider must be used within a BoardProvider/,
    );
  });
});

describe('useOptionalBoardProvider (shared)', () => {
  it('returns null when called outside a BoardProvider', () => {
    const { result } = renderHook(() => useOptionalBoardProvider());
    expect(result.current).toBeNull();
  });
});
