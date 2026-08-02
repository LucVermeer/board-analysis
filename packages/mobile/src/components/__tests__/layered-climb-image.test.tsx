// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

type ViewMockProps = { children?: ReactNode; testID?: string };
const platform = vi.hoisted(() => ({ os: 'ios' as 'ios' | 'web' }));
const imageEvents = vi.hoisted(() => ({ loadCallbacks: [] as Array<() => void> }));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return platform.os;
    },
  },
  View: ({ children, testID }: ViewMockProps) => createElement('div', { 'data-testid': testID }, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

vi.mock('expo-image', () => ({
  Image: ({
    source,
    testID,
    transition,
    recyclingKey,
    onLoad,
    onError,
  }: {
    source: { uri: string };
    testID?: string;
    transition?: number;
    recyclingKey?: string;
    onLoad?: () => void;
    onError?: (event: { error: string }) => void;
  }) => {
    if (onLoad) imageEvents.loadCallbacks.push(onLoad);
    return createElement('img', {
      src: source.uri,
      'data-testid': testID ?? 'expo-image',
      'data-transition': transition,
      'data-recycling-key': recyclingKey,
      onLoad,
      onError: () => onError?.({ error: 'mock image failure' }),
    });
  },
}));

// These tests exercise the foregrounded render path; the backgrounded blank is
// covered in layered-climb-image-backgrounded.test.tsx.
vi.mock('../../lib/app-visibility', () => ({ useIsAppBackgrounded: () => false }));

import { LayeredClimbImage } from '../LayeredClimbImage';

describe('LayeredClimbImage', () => {
  beforeEach(() => {
    // The expo-image mock records every mounted overlay's onLoad; tests that
    // replay queued native events index into this list, so it must start empty
    // regardless of which tests rendered an Image before them.
    imageEvents.loadCallbacks.length = 0;
  });

  it('renders a visible backing layer when no image layer is available yet', () => {
    const { container } = render(createElement(LayeredClimbImage, { overlayUri: null, backgroundPaths: [] }));

    expect(container.querySelector('[data-testid="layered-climb-image-empty-fallback"]')).toBeTruthy();
  });

  it('keeps the backing layer behind an overlay when the background is unavailable', () => {
    const { container } = render(
      createElement(LayeredClimbImage, { overlayUri: 'file:///overlay.png', backgroundPaths: [] }),
    );

    expect(container.querySelector('[data-testid="layered-climb-image-empty-fallback"]')).toBeTruthy();
    expect(container.querySelector('img[src="file:///overlay.png"]')).toBeTruthy();
  });

  it('does not render the empty backing layer when a real background path is present', () => {
    const { container } = render(
      createElement(LayeredClimbImage, { overlayUri: null, backgroundPaths: ['/bundled/kilter.webp'] }),
    );

    expect(container.querySelector('[data-testid="layered-climb-image-empty-fallback"]')).toBeNull();
    expect(container.querySelector('img[src="file:///bundled/kilter.webp"]')).toBeTruthy();
  });

  it('keeps browser asset URLs loadable instead of turning them into file URLs', () => {
    platform.os = 'web';
    const { container } = render(
      createElement(LayeredClimbImage, { overlayUri: null, backgroundPaths: ['/assets/kilter.webp'] }),
    );

    expect(container.querySelector('img[src="/assets/kilter.webp"]')).toBeTruthy();
    platform.os = 'ios';
  });

  it('lets missing-background placeholders own the fallback state', () => {
    const { container } = render(
      createElement(LayeredClimbImage, { overlayUri: null, backgroundPaths: [], missingBackgroundCount: 1 }),
    );

    expect(container.querySelector('[data-testid="layered-climb-image-empty-fallback"]')).toBeNull();
  });

  it('cross-fades the holds overlay by default', () => {
    const { container } = render(
      createElement(LayeredClimbImage, {
        overlayUri: 'file:///overlay.png',
        backgroundPaths: ['/bundled/kilter.webp'],
      }),
    );

    expect(container.querySelector('img[src="file:///overlay.png"]')?.getAttribute('data-transition')).toBe('150');
  });

  it('swaps the holds overlay instantly when suppressOverlayTransition is set (no end-of-swipe flash)', () => {
    const { container } = render(
      createElement(LayeredClimbImage, {
        overlayUri: 'file:///overlay.png',
        backgroundPaths: ['/bundled/kilter.webp'],
        suppressOverlayTransition: true,
      }),
    );

    expect(container.querySelector('img[src="file:///overlay.png"]')?.getAttribute('data-transition')).toBe('0');
  });

  it('forwards recyclingKey to the holds-overlay <Image> so the carousel recycles on climb change', () => {
    const { container } = render(
      createElement(LayeredClimbImage, {
        overlayUri: 'file:///overlay.png',
        backgroundPaths: ['/bundled/kilter.webp'],
        recyclingKey: 'climb-frames-abc',
      }),
    );

    const overlay = container.querySelector('img[src="file:///overlay.png"]');
    expect(overlay?.getAttribute('data-recycling-key')).toBe('climb-frames-abc');
  });

  it('forces a React remount when a regenerated overlay keeps the same URI', () => {
    const { container, rerender } = render(
      createElement(LayeredClimbImage, {
        overlayUri: 'file:///overlay.png',
        overlayLoadKey: '1:0',
        backgroundPaths: [],
      }),
    );
    const failedImage = container.querySelector('img[src="file:///overlay.png"]');

    rerender(
      createElement(LayeredClimbImage, {
        overlayUri: 'file:///overlay.png',
        overlayLoadKey: '2:1',
        backgroundPaths: [],
      }),
    );

    expect(container.querySelector('img[src="file:///overlay.png"]')).not.toBe(failedImage);
  });

  it('forwards exact load and error notifications to the cache recovery owner', () => {
    const onOverlayLoad = vi.fn();
    const onOverlayError = vi.fn();
    const { container } = render(
      createElement(LayeredClimbImage, {
        overlayUri: 'file:///overlay.png',
        overlayLoadKey: '1:0',
        backgroundPaths: [],
        onOverlayLoad,
        onOverlayError,
      }),
    );
    const overlay = container.querySelector('img[src="file:///overlay.png"]');
    if (!overlay) throw new Error('Expected overlay image');

    fireEvent.load(overlay);
    fireEvent.error(overlay);

    expect(onOverlayLoad).toHaveBeenCalledExactlyOnceWith('1:0');
    expect(onOverlayError).toHaveBeenCalledWith({ error: 'mock image failure' }, '1:0');
  });

  it('does not expose the painted anchor for a queued load from a replaced overlay generation', () => {
    const onOverlayLoad = vi.fn();
    const { container, rerender } = render(
      createElement(LayeredClimbImage, {
        overlayUri: 'file:///overlay.png',
        overlayLoadKey: '1:0',
        backgroundPaths: [],
        overlayTestID: 'play-drawer-board-overlay',
        onOverlayLoad,
      }),
    );
    const staleOverlay = container.querySelector('img[src="file:///overlay.png"]');
    if (!staleOverlay) throw new Error('Expected first-generation overlay image');

    rerender(
      createElement(LayeredClimbImage, {
        overlayUri: 'file:///overlay.png',
        overlayLoadKey: '2:0',
        backgroundPaths: [],
        overlayTestID: 'play-drawer-board-overlay',
        onOverlayLoad,
      }),
    );
    const currentOverlay = container.querySelector('img[src="file:///overlay.png"]');
    if (!currentOverlay) throw new Error('Expected replacement overlay image');

    act(() => imageEvents.loadCallbacks[0]?.());

    expect(container.querySelector('[data-testid="play-drawer-board-overlay"]')).toBeNull();
    expect(onOverlayLoad).toHaveBeenCalledExactlyOnceWith('1:0');

    act(() => imageEvents.loadCallbacks[1]?.());

    expect(container.querySelector('[data-testid="play-drawer-board-overlay"]')).toBeTruthy();
    expect(onOverlayLoad).toHaveBeenLastCalledWith('2:0');
  });
});
