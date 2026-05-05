import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';
import { render, act } from '@testing-library/react';
import React from 'react';
import MarqueeText from '../marquee-text';

const setElementWidth = (
  element: HTMLElement,
  { scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number },
) => {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth });
};

describe('MarqueeText', () => {
  let resizeCallbacks: ResizeObserverCallback[] = [];
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    resizeCallbacks = [];
    class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        resizeCallbacks.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    vi.restoreAllMocks();
  });

  const renderMarquee = (props: { active: boolean }) => {
    const { container } = render(
      <MarqueeText active={props.active}>
        <span data-testid="content">Some long climb name that overflows</span>
      </MarqueeText>,
    );
    const outer = container.firstElementChild as HTMLElement;
    const inner = outer.firstElementChild as HTMLElement;
    return { outer, inner };
  };

  const triggerMeasurement = () => {
    act(() => {
      resizeCallbacks.forEach((cb) => cb([] as unknown as ResizeObserverEntry[], {} as ResizeObserver));
    });
  };

  it('uses the static (ellipsis) class when text fits', () => {
    const { outer, inner } = renderMarquee({ active: true });
    setElementWidth(outer, { scrollWidth: 200, clientWidth: 200 });
    setElementWidth(inner, { scrollWidth: 200, clientWidth: 200 });
    triggerMeasurement();

    expect(inner.className).toContain('innerStatic');
    expect(inner.className).not.toContain('innerScrolling');
    // Style vars are not set when not scrolling
    expect(inner.style.getPropertyValue('--marquee-distance')).toBe('');
  });

  it('uses the scrolling class and sets CSS vars when active and text overflows', () => {
    const { outer, inner } = renderMarquee({ active: true });
    // Inner content is wider than the outer container by 80px
    setElementWidth(outer, { clientWidth: 100, scrollWidth: 100 });
    setElementWidth(inner, { scrollWidth: 180, clientWidth: 180 });
    triggerMeasurement();

    expect(inner.className).toContain('innerScrolling');
    expect(inner.className).not.toContain('innerStatic');
    expect(inner.style.getPropertyValue('--marquee-distance')).toBe('80px');
    expect(inner.style.getPropertyValue('--marquee-duration')).not.toBe('');
  });

  it('does not animate when active is false, even if text would overflow', () => {
    const { outer, inner } = renderMarquee({ active: false });
    setElementWidth(outer, { clientWidth: 100, scrollWidth: 100 });
    setElementWidth(inner, { scrollWidth: 180, clientWidth: 180 });
    // The component should not have registered an observer at all when inactive.
    expect(resizeCallbacks).toHaveLength(0);

    expect(inner.className).toContain('innerStatic');
    expect(inner.className).not.toContain('innerScrolling');
    expect(inner.style.getPropertyValue('--marquee-distance')).toBe('');
  });

  it('falls back to static when overflow becomes zero on a later measurement', () => {
    const { outer, inner } = renderMarquee({ active: true });

    // First measurement: overflow > 0 → scrolling.
    setElementWidth(outer, { clientWidth: 100, scrollWidth: 100 });
    setElementWidth(inner, { scrollWidth: 180, clientWidth: 180 });
    triggerMeasurement();
    expect(inner.className).toContain('innerScrolling');

    // Second measurement: container grew to fit → static.
    setElementWidth(outer, { clientWidth: 200, scrollWidth: 200 });
    setElementWidth(inner, { scrollWidth: 180, clientWidth: 180 });
    triggerMeasurement();
    expect(inner.className).toContain('innerStatic');
    expect(inner.className).not.toContain('innerScrolling');
  });
});
