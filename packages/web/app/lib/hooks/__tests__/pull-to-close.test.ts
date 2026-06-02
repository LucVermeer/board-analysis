import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { renderHook, act } from '@testing-library/react';
import { usePullToClose, findScrollContainer, onTransformSettled } from '../pull-to-close';

function createPaperElement(): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'offsetHeight', { value: 500, configurable: true });
  return el;
}

function createScrollContainer(scrollTop = 0): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true });
  return el;
}

describe('findScrollContainer', () => {
  it('returns element with overflowY: auto', () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.appendChild(child);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === parent) return { overflowY: 'auto' } as CSSStyleDeclaration;
      return { overflowY: 'visible' } as CSSStyleDeclaration;
    });

    expect(findScrollContainer(child)).toBe(parent);
  });

  it('returns element with overflowY: scroll', () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.appendChild(child);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === parent) return { overflowY: 'scroll' } as CSSStyleDeclaration;
      return { overflowY: 'visible' } as CSSStyleDeclaration;
    });

    expect(findScrollContainer(child)).toBe(parent);
  });

  it('returns null when no scroll container found', () => {
    const el = document.createElement('div');
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      overflowY: 'visible',
    } as CSSStyleDeclaration);

    expect(findScrollContainer(el)).toBe(null);
  });

  it('stops at stopAt element', () => {
    const grandparent = document.createElement('div');
    const parent = document.createElement('div');
    const child = document.createElement('div');
    grandparent.appendChild(parent);
    parent.appendChild(child);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === grandparent) return { overflowY: 'auto' } as CSSStyleDeclaration;
      return { overflowY: 'visible' } as CSSStyleDeclaration;
    });

    // Should not find grandparent because we stop at parent
    expect(findScrollContainer(child, parent)).toBe(null);
  });
});

describe('usePullToClose', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns stable handler functions', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    expect(typeof result.current.onTouchStart).toBe('function');
    expect(typeof result.current.onTouchMove).toBe('function');
    expect(typeof result.current.onTouchEnd).toBe('function');
    expect(result.current.stateRef.current).toBeDefined();
  });

  it('does not start pulling until delta exceeds dead zone (default 10px)', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(105, 1); // 5px — under dead zone
    });

    expect(paper.style.transform).toBe('');
  });

  it('translates paper when pulling past dead zone', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(130, 1); // 30px — past dead zone
    });

    expect(paper.style.transform).toBe('translateY(30px)');
    expect(paper.style.transition).toBe('none');
  });

  it('respects custom dead zone', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose, deadZone: 60 }));

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(150, 1); // 50px — under 60px dead zone
    });

    expect(paper.style.transform).toBe('');

    act(() => {
      result.current.onTouchMove(170, 1); // 70px — past 60px dead zone
    });

    expect(paper.style.transform).toBe('translateY(70px)');
  });

  it('offsets transform by dead zone when offsetByDeadZone is true', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() =>
      usePullToClose({ paperEl: paper, onClose, deadZone: 60, offsetByDeadZone: true }),
    );

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(170, 1); // 70px delta, minus 60px dead zone = 10px
    });

    expect(paper.style.transform).toBe('translateY(10px)');
  });

  it('calls onClose when pull exceeds close threshold (default 80px)', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(200, 1); // 100px — past 80px threshold
      result.current.onTouchEnd();
    });

    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(210);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('animates the paper to its full offsetHeight (off-screen) when closing', () => {
    // The close target is the paper's layout height (offsetHeight, mocked to
    // 500) — the off-screen distance for a bottom drawer — not the
    // gesture-translated bounding-rect top.
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(200, 1); // 100px — past 80px threshold
      result.current.onTouchEnd();
    });

    expect(paper.style.transform).toBe('translateY(500px)');
  });

  it('respects custom close threshold', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose, closeThreshold: 70 }));

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(175, 1); // 75px — past 70px threshold
      result.current.onTouchEnd();
    });

    act(() => {
      vi.advanceTimersByTime(210);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('snaps back when pull does not exceed close threshold', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(150, 1); // 50px — under 80px threshold
      result.current.onTouchEnd();
    });

    // Should snap back
    expect(paper.style.transform).toBe('');
    expect(paper.style.transition).toContain('200ms');

    act(() => {
      vi.advanceTimersByTime(210);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(paper.style.transition).toBe('');
  });

  it('cancels pull when user reverses direction', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(130, 1); // pulling down
    });
    expect(paper.style.transform).toBe('translateY(30px)');

    act(() => {
      result.current.onTouchMove(90, 1); // reversed — above start
    });

    expect(paper.style.transform).toBe('');
    expect(paper.style.transition).toBe('');
  });

  it('cancels pull on multi-touch', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(130, 1);
    });
    expect(paper.style.transform).toBe('translateY(30px)');

    act(() => {
      result.current.onTouchMove(150, 2); // multi-touch
    });

    expect(paper.style.transform).toBe('');
  });

  it('cancels pull when cancelled flag is true', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(130, 1);
    });
    expect(paper.style.transform).toBe('translateY(30px)');

    act(() => {
      result.current.onTouchMove(150, 1, true); // cancelled externally (e.g. zoomed)
    });

    expect(paper.style.transform).toBe('');
  });

  it('does not pull when scroll container is not at top', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const scrollContainer = createScrollContainer(50); // scrolled down
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(100, scrollContainer);
      result.current.onTouchMove(200, 1);
    });

    expect(paper.style.transform).toBe('');
  });

  it('pulls when scroll container is at top', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const scrollContainer = createScrollContainer(0); // at top
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(100, scrollContainer);
      result.current.onTouchMove(130, 1);
    });

    expect(paper.style.transform).toBe('translateY(30px)');
  });

  it('clears pending timers on unmount', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result, unmount } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(200, 1);
      result.current.onTouchEnd();
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(210);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses latest onClose callback via ref', () => {
    const onClose1 = vi.fn();
    const onClose2 = vi.fn();
    const paper = createPaperElement();
    const { result, rerender } = renderHook(({ onClose }) => usePullToClose({ paperEl: paper, onClose }), {
      initialProps: { onClose: onClose1 },
    });

    rerender({ onClose: onClose2 });

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(200, 1);
      result.current.onTouchEnd();
    });

    act(() => {
      vi.advanceTimersByTime(210);
    });

    expect(onClose1).not.toHaveBeenCalled();
    expect(onClose2).toHaveBeenCalledTimes(1);
  });

  it('does not pull on upward swipe', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(200, null);
      result.current.onTouchMove(100, 1); // swipe up
    });

    expect(paper.style.transform).toBe('');
  });

  it('resets lingering transform on touchend without pull', () => {
    const onClose = vi.fn();
    const paper = createPaperElement();
    const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose }));

    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(105, 1); // small move, no pull
      result.current.onTouchEnd();
    });

    expect(paper.style.transform).toBe('');
  });

  describe('trackPullOrigin', () => {
    it('sets pullOriginY to clientY when scroll starts at top', () => {
      const onClose = vi.fn();
      const paper = createPaperElement();
      const scrollContainer = createScrollContainer(0);
      const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose, trackPullOrigin: true }));

      act(() => {
        result.current.onTouchStart(100, scrollContainer);
      });

      expect(result.current.stateRef.current.pullOriginY).toBe(100);
    });

    it('sets pullOriginY to 0 when scroll starts below top', () => {
      const onClose = vi.fn();
      const paper = createPaperElement();
      const scrollContainer = createScrollContainer(50);
      const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose, trackPullOrigin: true }));

      act(() => {
        result.current.onTouchStart(100, scrollContainer);
      });

      expect(result.current.stateRef.current.pullOriginY).toBe(0);
    });

    it('updates pullOriginY when scroll reaches top mid-gesture', () => {
      const onClose = vi.fn();
      const paper = createPaperElement();
      const scrollContainer = createScrollContainer(50);
      const { result } = renderHook(() => usePullToClose({ paperEl: paper, onClose, trackPullOrigin: true }));

      act(() => {
        result.current.onTouchStart(100, scrollContainer);
      });

      // Simulate scroll reaching top mid-gesture
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, configurable: true });

      act(() => {
        result.current.onTouchMove(200, 1); // at top, moving down
      });

      // pullOriginY should be set to the current Y (200) since it was 0
      expect(result.current.stateRef.current.pullOriginY).toBe(200);
    });
  });

  it('no-ops gracefully when paperEl is null', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => usePullToClose({ paperEl: null, onClose }));

    // Should not throw
    act(() => {
      result.current.onTouchStart(100, null);
      result.current.onTouchMove(200, 1);
      result.current.onTouchEnd();
    });

    act(() => {
      vi.advanceTimersByTime(210);
    });

    // onClose is NOT called because the close animation path requires a paper element
    // to calculate offsetHeight for the off-screen target
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('onTransformSettled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the callback on a transform transitionend', () => {
    const el = document.createElement('div');
    const cb = vi.fn();
    onTransformSettled(el, 999, cb);

    const event = new Event('transitionend') as TransitionEvent;
    Object.defineProperty(event, 'propertyName', { value: 'transform' });
    el.dispatchEvent(event);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('ignores transitionend for other properties', () => {
    const el = document.createElement('div');
    const cb = vi.fn();
    onTransformSettled(el, 999, cb);

    const event = new Event('transitionend') as TransitionEvent;
    Object.defineProperty(event, 'propertyName', { value: 'opacity' });
    el.dispatchEvent(event);

    expect(cb).not.toHaveBeenCalled();
  });

  it('fires the callback via the fallback timer when transitionend never arrives', () => {
    const el = document.createElement('div');
    const cb = vi.fn();
    onTransformSettled(el, 250, cb);

    expect(cb).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('only fires once when both transitionend and the timer would fire', () => {
    const el = document.createElement('div');
    const cb = vi.fn();
    onTransformSettled(el, 250, cb);

    const event = new Event('transitionend') as TransitionEvent;
    Object.defineProperty(event, 'propertyName', { value: 'transform' });
    el.dispatchEvent(event);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancel cleanup prevents the callback from firing', () => {
    const el = document.createElement('div');
    const cb = vi.fn();
    const cancel = onTransformSettled(el, 250, cb);

    cancel();
    const event = new Event('transitionend') as TransitionEvent;
    Object.defineProperty(event, 'propertyName', { value: 'transform' });
    el.dispatchEvent(event);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(cb).not.toHaveBeenCalled();
  });
});
