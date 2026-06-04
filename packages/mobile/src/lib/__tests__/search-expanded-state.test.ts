// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { setSearchExpanded, useSearchExpanded } from '../search-expanded-state';

describe('search-expanded-state', () => {
  // Module-level state persists across tests — reset to collapsed before each.
  beforeEach(() => {
    act(() => setSearchExpanded(false));
  });

  it('defaults to collapsed (false)', () => {
    const { result } = renderHook(() => useSearchExpanded());
    expect(result.current).toBe(false);
  });

  it('reflects setSearchExpanded both ways', () => {
    const { result } = renderHook(() => useSearchExpanded());
    act(() => setSearchExpanded(true));
    expect(result.current).toBe(true);
    act(() => setSearchExpanded(false));
    expect(result.current).toBe(false);
  });

  it('syncs a freshly mounted subscriber to the current value', () => {
    act(() => setSearchExpanded(true));
    const { result } = renderHook(() => useSearchExpanded());
    expect(result.current).toBe(true);
  });

  it('keeps multiple subscribers in sync (global capsule + any future reader)', () => {
    const first = renderHook(() => useSearchExpanded());
    const second = renderHook(() => useSearchExpanded());
    act(() => setSearchExpanded(true));
    expect(first.result.current).toBe(true);
    expect(second.result.current).toBe(true);
  });

  it('stops updating after unmount', () => {
    const { result, unmount } = renderHook(() => useSearchExpanded());
    unmount();
    act(() => setSearchExpanded(true));
    expect(result.current).toBe(false);
  });

  it('coalesces a no-op set (same value does not re-notify)', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useSearchExpanded();
    });
    const baseline = renders;
    act(() => setSearchExpanded(false)); // already false
    expect(renders).toBe(baseline);
    expect(result.current).toBe(false);
  });
});
