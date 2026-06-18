// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ContextType, type ReactNode } from 'react';

vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

// Animated.View just renders children; FadeIn is a no-op chainable.
vi.mock('react-native-reanimated', () => {
  const chain: Record<string, () => unknown> = {};
  chain.springify = () => chain;
  chain.damping = () => chain;
  chain.stiffness = () => chain;
  return {
    default: { View: ({ children }: { children?: ReactNode }) => createElement('div', null, children) },
    FadeIn: chain,
  };
});

// t interpolates the holder name so "Lit by {name}" is assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name?: string }) => {
      if (key === 'mobile.boardPresence.litByLine') return `Lit by ${opts?.name}`;
      if (key === 'playView.onWallBadge') return 'On the wall';
      return key;
    },
  }),
}));

vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));

// Icon renders an identifiable marker so the glyph name is assertable.
vi.mock('../../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('i', { 'data-icon': name }),
}));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({ brandColors: { warning: '#B45309' } }),
}));

vi.mock('../../../theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 4: 16 },
}));

// A real context (created inside the hoisted factory) so the test can inject a
// holder via its Provider; imported back below to reach the same instance.
vi.mock('@boardsesh/board-presence-react', async () => {
  const React = await import('react');
  return { BoardPresenceCurrentContext: React.createContext<unknown>(null) };
});

import { BoardPresenceCurrentContext } from '@boardsesh/board-presence-react';
import { PlayDrawerOnWallBanner } from '../PlayDrawerOnWallBanner';

describe('PlayDrawerOnWallBanner', () => {
  it('shows the broadcast glyph and a quiet "On the wall" line for an anonymous holder', () => {
    const { container } = render(createElement(PlayDrawerOnWallBanner));
    expect(container.textContent).toContain('On the wall');
    expect(container.querySelector('[data-icon="bluetooth.connected"]')).toBeTruthy();
  });

  it('attributes the climb to the holder when their name is known', () => {
    // Runtime uses the mocked context; the cast only satisfies the real type.
    const presenceValue = { currentClimb: { sentByDisplayName: 'Marco' }, holder: null } as unknown as ContextType<
      typeof BoardPresenceCurrentContext
    >;
    const { container } = render(
      createElement(
        BoardPresenceCurrentContext.Provider,
        { value: presenceValue },
        createElement(PlayDrawerOnWallBanner),
      ),
    );
    expect(container.textContent).toContain('Lit by Marco');
    expect(container.textContent).not.toContain('On the wall');
  });

  it('renders no button and no "Set active" — it is read-only status, not a promotable preview', () => {
    const { container } = render(createElement(PlayDrawerOnWallBanner));
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).not.toContain('playView.setActive');
  });
});
