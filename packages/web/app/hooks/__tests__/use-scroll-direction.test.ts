import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';
import { renderHook, act } from '@testing-library/react';
import { useScrollDirection } from '../use-scroll-direction';

const fireScroll = (y: number) => {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
  window.dispatchEvent(new Event('scroll'));
};

describe('useScrollDirection', () => {
  let rafCallbacks: FrameRequestCallback[] = [];

  beforeEach(() => {
    rafCallbacks = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const flushRaf = () => {
    const callbacks = rafCallbacks.splice(0);
    for (const cb of callbacks) cb(0);
  };

  it('fires onDown once cumulative downward delta crosses the down threshold (default 4px)', () => {
    const onDown = vi.fn();
    renderHook(() => useScrollDirection({ onDown }));

    act(() => {
      fireScroll(3);
      flushRaf();
    });
    expect(onDown).not.toHaveBeenCalled();

    act(() => {
      fireScroll(8);
      flushRaf();
    });
    expect(onDown).toHaveBeenCalledTimes(1);
  });

  it('does not fire onUp until cumulative upward delta crosses the up threshold (default 24px)', () => {
    const onUp = vi.fn();
    const onDown = vi.fn();
    renderHook(() => useScrollDirection({ onUp, onDown }));

    act(() => {
      fireScroll(200);
      flushRaf();
    });
    expect(onDown).toHaveBeenCalledTimes(1);

    act(() => {
      fireScroll(190);
      flushRaf();
    });
    expect(onUp).not.toHaveBeenCalled();

    act(() => {
      fireScroll(170);
      flushRaf();
    });
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it('flipping direction resets the accumulator', () => {
    const onDown = vi.fn();
    renderHook(() => useScrollDirection({ onDown, downThresholdPx: 10, upThresholdPx: 10 }));

    act(() => {
      fireScroll(8);
      flushRaf();
    });
    expect(onDown).not.toHaveBeenCalled();

    act(() => {
      fireScroll(3);
      flushRaf();
    });
    expect(onDown).not.toHaveBeenCalled();

    act(() => {
      fireScroll(13);
      flushRaf();
    });
    expect(onDown).toHaveBeenCalledTimes(1);
  });

  it('resets the accumulator after firing so the next push beyond the threshold re-fires', () => {
    const onDown = vi.fn();
    renderHook(() => useScrollDirection({ onDown, downThresholdPx: 5 }));

    act(() => {
      fireScroll(6);
      flushRaf();
    });
    expect(onDown).toHaveBeenCalledTimes(1);

    act(() => {
      fireScroll(12);
      flushRaf();
    });
    expect(onDown).toHaveBeenCalledTimes(2);
  });

  it('ignores negative scrollY (iOS Safari rubber-band overscroll)', () => {
    const onUp = vi.fn();
    const onDown = vi.fn();
    renderHook(() => useScrollDirection({ onUp, onDown, upThresholdPx: 10, downThresholdPx: 4 }));

    // Simulate iOS pull-down at top of page: scrollY goes negative then back to 0.
    act(() => {
      fireScroll(-40);
      flushRaf();
    });
    act(() => {
      fireScroll(-20);
      flushRaf();
    });
    act(() => {
      fireScroll(0);
      flushRaf();
    });

    expect(onUp).not.toHaveBeenCalled();
    expect(onDown).not.toHaveBeenCalled();
  });

  it('does not subscribe when disabled', () => {
    const onDown = vi.fn();
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useScrollDirection({ enabled: false, onDown }));

    expect(addSpy.mock.calls.find(([event]) => event === 'scroll')).toBeUndefined();
    act(() => {
      fireScroll(100);
      flushRaf();
    });
    expect(onDown).not.toHaveBeenCalled();
  });

  it('uses the latest callback closure without resubscribing', () => {
    const seen: number[] = [];
    let value = 1;
    const { rerender } = renderHook(
      ({ v }) => {
        value = v;
        return useScrollDirection({ onDown: () => seen.push(value), downThresholdPx: 4 });
      },
      { initialProps: { v: 1 } },
    );

    act(() => {
      fireScroll(10);
      flushRaf();
    });
    expect(seen).toEqual([1]);

    rerender({ v: 2 });

    act(() => {
      fireScroll(20);
      flushRaf();
    });
    expect(seen).toEqual([1, 2]);
  });
});
