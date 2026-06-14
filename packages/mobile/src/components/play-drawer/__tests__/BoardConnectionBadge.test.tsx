// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { BoardConnectionHolder, BoardPresenceClimb } from '@boardsesh/shared-schema';

// useBoardPresenceCurrent is the only data source; drive it from a hoisted bag.
const presence = vi.hoisted(() => ({
  holder: null as BoardConnectionHolder | null,
  currentClimb: null as BoardPresenceClimb | null,
}));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, hairlineWidth: 1 },
}));
vi.mock('@boardsesh/board-presence-react', () => ({
  useBoardPresenceCurrent: () => ({
    holder: presence.holder,
    currentClimb: presence.currentClimb,
    previousClimb: null,
    undoTarget: null,
    isLive: true,
  }),
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

describe('BoardConnectionBadge', () => {
  beforeEach(() => {
    presence.holder = null;
    presence.currentClimb = null;
    cleanup();
  });

  it('renders nothing when the wall is free', () => {
    const { container } = render(createElement(BoardConnectionBadge));
    expect(container.querySelector('[data-testid="avatar"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('shows the holder avatar from the live climb identity when held and recent', () => {
    presence.holder = holder();
    presence.currentClimb = climb(new Date().toISOString());
    const { container } = render(createElement(BoardConnectionBadge));
    const avatar = container.querySelector('[data-testid="avatar"]');
    expect(avatar).not.toBeNull();
    expect(avatar?.getAttribute('data-name')).toBe('Crusher Carla');
    expect(avatar?.getAttribute('data-uri')).toBe('https://x/c.jpg');
    // Recent → no idle "?" overlay.
    expect(container.textContent).not.toContain('?');
  });

  it('passes null identity through for an anonymous holder (Avatar renders "?")', () => {
    presence.holder = holder({ userId: null, displayName: null, avatarUrl: null });
    presence.currentClimb = null;
    const { container } = render(createElement(BoardConnectionBadge));
    const avatar = container.querySelector('[data-testid="avatar"]');
    expect(avatar).not.toBeNull();
    expect(avatar?.getAttribute('data-name')).toBe('');
    expect(avatar?.getAttribute('data-uri')).toBe('');
  });

  it('adds the idle "?" overlay once the last send is older than 15 minutes', () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    presence.holder = holder();
    presence.currentClimb = climb(twentyMinAgo);
    const { container } = render(createElement(BoardConnectionBadge));
    expect(container.querySelector('[data-testid="avatar"]')).not.toBeNull();
    expect(container.textContent).toContain('?');
  });

  it('falls back to the holder lastSentAt for idle when no current climb', () => {
    presence.holder = holder({ lastSentAt: new Date(Date.now() - 20 * 60 * 1000).toISOString() });
    presence.currentClimb = null;
    const { container } = render(createElement(BoardConnectionBadge));
    expect(container.textContent).toContain('?');
  });
});
