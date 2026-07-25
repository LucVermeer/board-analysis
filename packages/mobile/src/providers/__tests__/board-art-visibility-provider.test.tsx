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
});
