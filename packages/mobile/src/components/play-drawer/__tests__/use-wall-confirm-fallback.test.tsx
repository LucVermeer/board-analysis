// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitWallConfirm } from '@boardsesh/play-view';
import { useWallConfirmFallback, WALL_CONFIRM_TIMEOUT_MS } from '../use-wall-confirm-fallback';

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('../../../lib/analytics', () => ({
  track: analytics.track,
}));

type HookDeps = Parameters<typeof useWallConfirmFallback>[0];
type HookCallbacks = NonNullable<Parameters<typeof useWallConfirmFallback>[1]>;

function makeDeps(overrides: Partial<HookDeps> = {}): HookDeps {
  return {
    sessionId: 'session-1',
    isBluetoothConnected: false,
    isBluetoothSupported: true,
    lastConnectedBoardSerial: null,
    isPersistentSessionActive: true,
    bluetoothConnect: vi.fn(async () => true),
    ...overrides,
  };
}

describe('mobile useWallConfirmFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    analytics.track.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the fallback when a matching wall confirm arrives', () => {
    const deps = makeDeps();
    const onConfirmed = vi.fn();
    const { result, unmount } = renderHook(() => useWallConfirmFallback(deps, { onConfirmed } satisfies HookCallbacks));

    act(() => {
      result.current.armWatcher({ climbUuid: 'climb-1', mode: 'party', boardLayout: 'kilter:1:10' });
    });
    act(() => {
      vi.advanceTimersByTime(450);
    });
    act(() => {
      emitWallConfirm('climb-1');
    });
    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS);
    });

    expect(deps.bluetoothConnect).not.toHaveBeenCalled();
    expect(onConfirmed).toHaveBeenCalledWith({
      climbUuid: 'climb-1',
      latencyMs: 450,
      confirmedByRole: 'other',
    });
    expect(analytics.track).toHaveBeenCalledWith('Wall Confirmed', {
      climbUuid: 'climb-1',
      latencyMs: 450,
      confirmedByRole: 'other',
      mode: 'party',
      boardLayout: 'kilter:1:10',
    });
    unmount();
  });

  it('auto-connects to the stored session board serial on timeout', () => {
    const deps = makeDeps({ lastConnectedBoardSerial: 'AURORA-1' });
    const onTimeout = vi.fn();
    const { result, unmount } = renderHook(() => useWallConfirmFallback(deps, { onTimeout }));

    act(() => {
      result.current.armWatcher({ climbUuid: 'climb-1', mode: 'party', boardLayout: 'kilter:1:10' });
    });
    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS);
    });

    expect(onTimeout).toHaveBeenCalledWith({ climbUuid: 'climb-1' });
    expect(deps.bluetoothConnect).toHaveBeenCalledWith(undefined, undefined, 'AURORA-1');
    expect(analytics.track).toHaveBeenCalledWith('Wall Confirm Timeout', {
      mode: 'party',
      fallback: 'auto_connect',
      boardLayout: 'kilter:1:10',
    });
    unmount();
  });

  it('cancels silently when the party session ends while armed', () => {
    const activeDeps = makeDeps({ isPersistentSessionActive: true });
    const inactiveDeps = { ...activeDeps, isPersistentSessionActive: false };
    const onTimeout = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ hookDeps }: { hookDeps: HookDeps }) => useWallConfirmFallback(hookDeps, { onTimeout }),
      { initialProps: { hookDeps: activeDeps } },
    );

    act(() => {
      result.current.armWatcher({ climbUuid: 'climb-1', mode: 'party', boardLayout: 'kilter:1:10' });
    });
    rerender({ hookDeps: inactiveDeps });
    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS);
    });

    expect(onTimeout).not.toHaveBeenCalled();
    expect(activeDeps.bluetoothConnect).not.toHaveBeenCalled();
    expect(analytics.track).not.toHaveBeenCalled();
    unmount();
  });

  it('cancels silently when the active party session changes while armed', () => {
    const firstSessionDeps = makeDeps({ sessionId: 'session-1', isPersistentSessionActive: true });
    const secondSessionDeps = { ...firstSessionDeps, sessionId: 'session-2' };
    const onTimeout = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ hookDeps }: { hookDeps: HookDeps }) => useWallConfirmFallback(hookDeps, { onTimeout }),
      { initialProps: { hookDeps: firstSessionDeps } },
    );

    act(() => {
      result.current.armWatcher({ climbUuid: 'climb-1', mode: 'party', boardLayout: 'kilter:1:10' });
    });
    rerender({ hookDeps: secondSessionDeps });
    act(() => {
      vi.advanceTimersByTime(WALL_CONFIRM_TIMEOUT_MS);
    });

    expect(onTimeout).not.toHaveBeenCalled();
    expect(firstSessionDeps.bluetoothConnect).not.toHaveBeenCalled();
    expect(analytics.track).not.toHaveBeenCalled();
    unmount();
  });
});
