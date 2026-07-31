// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';

const segments = vi.hoisted(() => ({ value: ['(tabs)', 'home'] as readonly string[] }));
vi.mock('expo-router', () => ({ useSegments: () => segments.value }));

const deviceLayout = vi.hoisted(() => ({ isPad: true }));
vi.mock('../../hooks/use-device-layout', () => ({ useDeviceLayout: () => ({ isPad: deviceLayout.isPad }) }));

import { BoardArtVisibilityProvider, type BoardArtTab } from '../board-art-visibility-provider';
import { useBoardArtVisible } from '../../components/board-art-visibility-context';

function VisibleProbe() {
  return createElement('span', { 'data-visible': String(useBoardArtVisible()) });
}

function renderWithin(tab: BoardArtTab) {
  return render(createElement(BoardArtVisibilityProvider, { tab, children: createElement(VisibleProbe) }));
}

function readVisible(container: HTMLElement): string | null {
  return container.querySelector('span')?.getAttribute('data-visible') ?? null;
}

describe('BoardArtVisibilityProvider', () => {
  beforeEach(() => {
    deviceLayout.isPad = true;
    segments.value = ['(tabs)', 'home'];
  });

  it('reports visible on the focused iPad tab', () => {
    segments.value = ['(tabs)', 'climbs'];
    const { container } = renderWithin('climbs');
    expect(readVisible(container)).toBe('true');
  });

  it('reports hidden on an inactive iPad tab', () => {
    segments.value = ['(tabs)', 'home'];
    const { container } = renderWithin('climbs');
    expect(readVisible(container)).toBe('false');
  });

  it('stays visible for a pushed sub-route of the focused tab', () => {
    // A sub-route keeps the tab active (segment 1 is still 'climbs').
    segments.value = ['(tabs)', 'climbs', 'abc-uuid'];
    const { container } = renderWithin('climbs');
    expect(readVisible(container)).toBe('true');
  });

  it('hides every tab while a root modal / player route is focused', () => {
    segments.value = ['play'];
    const { container } = renderWithin('climbs');
    expect(readVisible(container)).toBe('false');
  });

  it('is always visible on a non-iPad device regardless of the focused tab', () => {
    deviceLayout.isPad = false;
    segments.value = ['(tabs)', 'home'];
    const { container } = renderWithin('climbs');
    expect(readVisible(container)).toBe('true');
  });

  // The player paints its own opaque backing over the whole tab shell, so the tab's
  // list thumbnails are occluded but still mounted — pinning their decoded bitmaps
  // through the app's peak board-art moment (the player's own full-res board is live,
  // and remixing from it opens the create board too). #3804.
  it('hides tab board art on iPhone while the player is up', () => {
    deviceLayout.isPad = false;
    segments.value = ['play'];
    const { container } = renderWithin('climbs');
    expect(readVisible(container)).toBe('false');
  });

  // Over-blanking guards. Both of these are root/pushed surfaces that float over a
  // still-VISIBLE list, so blanking under them would be a user-facing regression —
  // which is why occlusion is an allowlist of opaque-backed routes rather than
  // "no tab is active".
  it('stays visible on iPhone under the user drawer', () => {
    deviceLayout.isPad = false;
    segments.value = ['user-drawer'];
    const { container } = renderWithin('climbs');
    expect(readVisible(container)).toBe('true');
  });

  it('stays visible on iPhone under the create drawer', () => {
    deviceLayout.isPad = false;
    segments.value = ['(tabs)', 'climbs', 'create'];
    const { container } = renderWithin('climbs');
    expect(readVisible(container)).toBe('true');
  });

  it('still blanks an inactive iPad tab under the user drawer', () => {
    // iPad behaviour is unchanged: a root modal leaves no tab active, so every tab
    // blanks via the iPad branch regardless of the new player check.
    segments.value = ['user-drawer'];
    const { container } = renderWithin('climbs');
    expect(readVisible(container)).toBe('false');
  });
});
