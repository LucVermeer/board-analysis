// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const keepAwake = vi.hoisted(() => ({
  activate: vi.fn().mockResolvedValue(undefined),
  deactivate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: keepAwake.activate,
  deactivateKeepAwake: keepAwake.deactivate,
}));

import { useKeepAwakeWhile } from '../use-keep-awake-while';

describe('useKeepAwakeWhile', () => {
  beforeEach(() => {
    keepAwake.activate.mockClear();
    keepAwake.deactivate.mockClear();
  });

  it('activates the lock for its tag when active', () => {
    renderHook(() => useKeepAwakeWhile(true, 'wall'));

    expect(keepAwake.activate).toHaveBeenCalledWith('wall');
    expect(keepAwake.deactivate).not.toHaveBeenCalled();
  });

  it('releases the lock when active flips to false', () => {
    const { rerender } = renderHook(({ active }) => useKeepAwakeWhile(active, 'wall'), {
      initialProps: { active: true },
    });
    keepAwake.activate.mockClear();
    keepAwake.deactivate.mockClear();

    rerender({ active: false });

    expect(keepAwake.deactivate).toHaveBeenCalledWith('wall');
    expect(keepAwake.activate).not.toHaveBeenCalled();
  });

  it('releases the lock on unmount', () => {
    const { unmount } = renderHook(() => useKeepAwakeWhile(true, 'wall'));
    keepAwake.deactivate.mockClear();

    unmount();

    expect(keepAwake.deactivate).toHaveBeenCalledWith('wall');
  });

  it('does not activate while inactive', () => {
    renderHook(() => useKeepAwakeWhile(false, 'wall'));

    expect(keepAwake.activate).not.toHaveBeenCalled();
    expect(keepAwake.deactivate).toHaveBeenCalledWith('wall');
  });
});
