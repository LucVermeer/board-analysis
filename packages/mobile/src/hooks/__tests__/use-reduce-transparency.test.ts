// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const isReduceTransparencyEnabled = vi.fn(async (): Promise<boolean> => false);
const removeSubscription = vi.fn();
const addEventListener = vi.fn((..._args: unknown[]) => ({ remove: removeSubscription }));

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceTransparencyEnabled: () => isReduceTransparencyEnabled(),
    addEventListener: (...args: unknown[]) => addEventListener(...args),
  },
}));

import { useReduceTransparency } from '../use-reduce-transparency';

describe('useReduceTransparency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isReduceTransparencyEnabled.mockResolvedValue(false);
    addEventListener.mockReturnValue({ remove: removeSubscription });
  });

  it('defaults to true (conservative) before the async read resolves', () => {
    // Never resolves — assert the synchronous initial value.
    isReduceTransparencyEnabled.mockReturnValue(new Promise<boolean>(() => {}));
    const { result } = renderHook(() => useReduceTransparency());
    expect(result.current).toBe(true);
  });

  it('resolves to the OS value once the async read completes', async () => {
    const { result } = renderHook(() => useReduceTransparency());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('updates when a reduceTransparencyChanged event fires', async () => {
    const { result } = renderHook(() => useReduceTransparency());
    await waitFor(() => expect(result.current).toBe(false));
    const [, handler] = addEventListener.mock.calls[0] as [string, (enabled: boolean) => void];
    act(() => handler(true));
    expect(result.current).toBe(true);
  });

  it('unsubscribes from the listener on unmount', async () => {
    const { result, unmount } = renderHook(() => useReduceTransparency());
    await waitFor(() => expect(result.current).toBe(false));
    unmount();
    expect(removeSubscription).toHaveBeenCalled();
  });
});
