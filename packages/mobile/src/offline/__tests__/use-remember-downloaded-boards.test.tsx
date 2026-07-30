// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { UserBoard } from '@boardsesh/shared-schema';

const rememberOfflineBoardsMock = vi.hoisted(() => vi.fn());

const state = vi.hoisted(() => ({
  isOffline: false,
  enabledBoards: [] as string[],
  downloadedScopeKeys: undefined as string[] | undefined,
}));

vi.mock('expo-sqlite', () => ({ useSQLiteContext: () => ({}) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: state.downloadedScopeKeys }) }));
vi.mock('@boardsesh/offline-sync', () => ({ getDownloadedScopeKeys: vi.fn(async () => []) }));
vi.mock('../../hooks/use-is-offline', () => ({ useIsOffline: () => state.isOffline }));
vi.mock('../../settings', () => ({
  rememberOfflineBoards: (boards: unknown) => rememberOfflineBoardsMock(boards),
  useSetting: () => [state.enabledBoards, vi.fn()],
  offlineBoardKeyForBoard: (input: { boardType: string; layoutId: number; sizeId: number }) =>
    `${input.boardType}:${input.layoutId}:${input.sizeId}`,
}));

const { useRememberDownloadedBoards } = await import('../use-remember-downloaded-boards');

const board = (overrides: Partial<UserBoard> & { uuid: string; name: string }): UserBoard =>
  ({
    boardType: 'kilter',
    layoutId: 8,
    sizeId: 17,
    setIds: '20,21',
    angle: 40,
    ...overrides,
  }) as unknown as UserBoard;

const garage = board({ uuid: 'garage', name: 'Marco garage' });
const tension = board({ uuid: 'tension', name: 'Tension wall', boardType: 'tension', layoutId: 12, sizeId: 3 });

beforeEach(() => {
  vi.clearAllMocks();
  state.isOffline = false;
  state.enabledBoards = [];
  state.downloadedScopeKeys = undefined;
});

describe('useRememberDownloadedBoards', () => {
  it('remembers only the boards whose scope is enabled or already downloaded', () => {
    state.enabledBoards = ['kilter:8:17'];

    renderHook(() => useRememberDownloadedBoards([garage, tension]));

    expect(rememberOfflineBoardsMock).toHaveBeenCalledTimes(1);
    expect((rememberOfflineBoardsMock.mock.calls[0]?.[0] as UserBoard[]).map((entry) => entry.uuid)).toEqual([
      'garage',
    ]);
  });

  it('backfills a board that was downloaded before snapshots existed', () => {
    // Nothing in syncEnabledBoards for this scope, but the data is on disk — this is
    // the pre-fix-build upgrade path.
    state.downloadedScopeKeys = ['tension:12:3'];

    renderHook(() => useRememberDownloadedBoards([garage, tension]));

    expect((rememberOfflineBoardsMock.mock.calls[0]?.[0] as UserBoard[]).map((entry) => entry.uuid)).toEqual([
      'tension',
    ]);
  });

  it('does nothing while offline — the live list is stale or absent', () => {
    state.isOffline = true;
    state.enabledBoards = ['kilter:8:17'];

    renderHook(() => useRememberDownloadedBoards([garage]));

    expect(rememberOfflineBoardsMock).not.toHaveBeenCalled();
  });

  it('does nothing before the board list resolves', () => {
    state.enabledBoards = ['kilter:8:17'];

    renderHook(() => useRememberDownloadedBoards(undefined));

    expect(rememberOfflineBoardsMock).not.toHaveBeenCalled();
  });

  it('does nothing when no scope is enabled or downloaded', () => {
    renderHook(() => useRememberDownloadedBoards([garage, tension]));

    expect(rememberOfflineBoardsMock).not.toHaveBeenCalled();
  });

  it('does not re-run on a re-render with the same inputs', () => {
    state.enabledBoards = ['kilter:8:17'];
    const boards = [garage];

    const { rerender } = renderHook(() => useRememberDownloadedBoards(boards));
    rerender();
    rerender();

    // The effect deps must stay stable, or every myBoards refetch would churn the
    // settings store (and with it every useSetting consumer app-wide).
    expect(rememberOfflineBoardsMock).toHaveBeenCalledTimes(1);
  });
});
