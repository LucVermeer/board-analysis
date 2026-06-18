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

// t interpolates the driver name so the a11y label is assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name?: string }) => {
      if (key === 'mobile.boardPresence.drivenByA11y') return `${opts?.name} is lighting the wall. Open profile.`;
      if (key === 'mobile.boardPresence.drivenByAnonA11y') return 'Someone is lighting the wall.';
      return key;
    },
  }),
}));

// The avatar atom renders its props as data attributes so the banner's
// prop-passing (identity + status + a11y label) is assertable without the deep
// PressableAvatar / expo-router tree.
type DriverAvatarProps = {
  userId?: string | null;
  name?: string | null;
  status?: string;
  accessibilityLabel?: string;
};
vi.mock('../../board-presence/BoardDriverAvatar', () => ({
  BoardDriverAvatar: ({ userId, name, status, accessibilityLabel }: DriverAvatarProps) =>
    createElement('div', {
      'data-driver-avatar': 'true',
      'data-user-id': userId ?? '',
      'data-name': name ?? '',
      'data-status': status,
      'data-a11y': accessibilityLabel,
    }),
}));

// A real context (created inside the hoisted factory) so the test can inject a
// holder via its Provider; imported back below to reach the same instance. The
// useBoardDriver hook (not mocked) reads this same context.
vi.mock('@boardsesh/board-presence-react', async () => {
  const React = await import('react');
  return { BoardPresenceCurrentContext: React.createContext<unknown>(null) };
});

import { BoardPresenceCurrentContext } from '@boardsesh/board-presence-react';
import { PlayDrawerOnWallBanner } from '../PlayDrawerOnWallBanner';

const driverAvatar = (container: HTMLElement) =>
  container.querySelector('[data-driver-avatar="true"]') as HTMLElement | null;

describe('PlayDrawerOnWallBanner', () => {
  it('renders an anonymous, non-pressable driver avatar when no holder is known', () => {
    const { container } = render(createElement(PlayDrawerOnWallBanner));
    const avatar = driverAvatar(container);

    expect(avatar).toBeTruthy();
    // No holder → no user id (not pressable), connected Bluetooth badge, anon a11y.
    expect(avatar?.getAttribute('data-user-id')).toBe('');
    expect(avatar?.getAttribute('data-status')).toBe('connected');
    expect(avatar?.getAttribute('data-a11y')).toBe('Someone is lighting the wall.');
  });

  it('attributes the wall to the holder and links their profile when known', () => {
    // Runtime uses the mocked context; the cast only satisfies the real type.
    const presenceValue = {
      currentClimb: { sentByDisplayName: 'Marco', sentByUserId: 'u1' },
      holder: { userId: 'u1', displayName: 'Marco' },
    } as unknown as ContextType<typeof BoardPresenceCurrentContext>;
    const { container } = render(
      createElement(
        BoardPresenceCurrentContext.Provider,
        { value: presenceValue },
        createElement(PlayDrawerOnWallBanner),
      ),
    );
    const avatar = driverAvatar(container);

    expect(avatar?.getAttribute('data-name')).toBe('Marco');
    expect(avatar?.getAttribute('data-user-id')).toBe('u1');
    expect(avatar?.getAttribute('data-status')).toBe('connected');
    expect(avatar?.getAttribute('data-a11y')).toBe('Marco is lighting the wall. Open profile.');
  });

  it('renders no button text and no "Set active" — it is read-only status, not a promotable preview', () => {
    const { container } = render(createElement(PlayDrawerOnWallBanner));
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).not.toContain('playView.setActive');
  });
});
