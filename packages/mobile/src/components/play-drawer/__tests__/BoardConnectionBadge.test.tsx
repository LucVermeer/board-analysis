// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { BoardConnectionHolder, BoardPresenceClimb } from '@boardsesh/shared-schema';

// The badge reads BoardPresenceCurrentContext directly (not useBoardPresenceCurrent,
// which throws outside a provider) so it can never crash a screen. Mock the package
// to expose a real context the tests drive via its Provider.
vi.mock('@boardsesh/board-presence-react', async () => {
  const react = await import('react');
  return { BoardPresenceCurrentContext: react.createContext(undefined) };
});

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, hairlineWidth: 1 },
}));
// Avatar → expose the uri/name it was handed so we can assert identity selection.
vi.mock('../../Avatar', () => ({
  Avatar: ({ uri, name }: { uri?: string | null; name?: string | null }) =>
    createElement('span', { 'data-testid': 'avatar', 'data-uri': uri ?? '', 'data-name': name ?? '' }),
}));
vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', { 'data-testid': 'text' }, children),
}));
vi.mock('../../../theme/ios-colors', () => ({
  iosSystemColors: { white: '#fff', systemGray: '#888' },
}));

import { BoardConnectionBadge } from '../BoardConnectionBadge';
import { BoardPresenceCurrentContext } from '@boardsesh/board-presence-react';

function holder(overrides: Partial<BoardConnectionHolder> = {}): BoardConnectionHolder {
  return { userId: 'u1', displayName: 'Crusher Carla', avatarUrl: 'https://x/c.jpg', lastSentAt: null, ...overrides };
}
function climb(sentAt: string, overrides: Partial<BoardPresenceClimb> = {}): BoardPresenceClimb {
  return {
    climbUuid: 'c1',
    sentAt,
    seq: 1,
    sentByDisplayName: 'Crusher Carla',
    sentByAvatarUrl: 'https://x/c.jpg',
    ...overrides,
  };
}

function renderBadge(value: { holder: BoardConnectionHolder | null; currentClimb: BoardPresenceClimb | null }) {
  return render(
    createElement(
      BoardPresenceCurrentContext.Provider,
      { value: { ...value, previousClimb: null, undoTarget: null, isLive: true } },
      createElement(BoardConnectionBadge),
    ),
  );
}

describe('BoardConnectionBadge', () => {
  beforeEach(() => cleanup());

  it('renders nothing (no crash) when rendered outside the board-presence provider', () => {
    const { container } = render(createElement(BoardConnectionBadge));
    expect(container.querySelector('[data-testid="avatar"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders nothing when the wall is free', () => {
    const { container } = renderBadge({ holder: null, currentClimb: null });
    expect(container.querySelector('[data-testid="avatar"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('shows the holder avatar from the live climb identity when held and recent', () => {
    const { container } = renderBadge({ holder: holder(), currentClimb: climb(new Date().toISOString()) });
    const avatar = container.querySelector('[data-testid="avatar"]');
    expect(avatar).not.toBeNull();
    expect(avatar?.getAttribute('data-name')).toBe('Crusher Carla');
    expect(avatar?.getAttribute('data-uri')).toBe('https://x/c.jpg');
    // Recent → no idle "?" overlay.
    expect(container.textContent).not.toContain('?');
  });

  it('passes null identity through for an anonymous holder (Avatar renders "?")', () => {
    const { container } = renderBadge({
      holder: holder({ userId: null, displayName: null, avatarUrl: null }),
      currentClimb: null,
    });
    const avatar = container.querySelector('[data-testid="avatar"]');
    expect(avatar).not.toBeNull();
    expect(avatar?.getAttribute('data-name')).toBe('');
    expect(avatar?.getAttribute('data-uri')).toBe('');
  });

  it('adds the idle "?" overlay once the last send is older than 15 minutes', () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { container } = renderBadge({ holder: holder(), currentClimb: climb(twentyMinAgo) });
    expect(container.querySelector('[data-testid="avatar"]')).not.toBeNull();
    expect(container.textContent).toContain('?');
  });

  it('falls back to the holder lastSentAt for idle when no current climb', () => {
    const { container } = renderBadge({
      holder: holder({ lastSentAt: new Date(Date.now() - 20 * 60 * 1000).toISOString() }),
      currentClimb: null,
    });
    expect(container.textContent).toContain('?');
  });
});
