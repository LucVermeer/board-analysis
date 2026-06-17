// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPressableAvatar = vi.hoisted(() => vi.fn());

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: unknown) => styles },
}));
// AvatarGroup's whole job is to delegate each avatar to PressableAvatar with the
// right userId; PressableAvatar's own test covers that a tap navigates. So here we
// capture the props handed to each PressableAvatar.
vi.mock('../../PressableAvatar', () => ({
  PressableAvatar: (props: Record<string, unknown>) => {
    mockPressableAvatar(props);
    return createElement('div', { 'data-testid': 'pressable-avatar', 'data-user': String(props.userId ?? '') });
  },
}));
vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../../theme/colors', () => ({ brandColors: { primary: '#000' } }));
vi.mock('../../../theme/ios-colors', () => ({ iosSystemColors: { white: '#fff' } }));
vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({ systemColors: { secondaryBackground: '#eee' } }),
}));

import { AvatarGroup } from '../AvatarGroup';

type Participant = { userId: string; displayName?: string | null; avatarUrl?: string | null };

function participant(userId: string): Participant {
  return { userId, displayName: userId.toUpperCase(), avatarUrl: null };
}

beforeEach(() => {
  mockPressableAvatar.mockClear();
});

describe('AvatarGroup', () => {
  it('renders a single pressable avatar carrying the participant userId', () => {
    render(createElement(AvatarGroup, { participants: [participant('u1')] }));
    expect(mockPressableAvatar).toHaveBeenCalledTimes(1);
    expect(mockPressableAvatar).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
  });

  it('renders one pressable avatar per shown participant with its own userId', () => {
    render(createElement(AvatarGroup, { participants: ['u1', 'u2', 'u3'].map(participant) }));
    expect(mockPressableAvatar).toHaveBeenCalledTimes(3);
    const userIds = mockPressableAvatar.mock.calls.map((call) => (call[0] as Participant).userId);
    expect(userIds).toEqual(['u1', 'u2', 'u3']);
  });

  it('caps shown avatars at max and renders the +N overflow tile as non-interactive', () => {
    const { container } = render(
      createElement(AvatarGroup, { participants: ['u1', 'u2', 'u3', 'u4', 'u5'].map(participant) }),
    );
    // Default max is 3: only the first three become pressable; the rest collapse
    // into a "+N" tile that is NOT a PressableAvatar (it isn't a single user).
    expect(mockPressableAvatar).toHaveBeenCalledTimes(3);
    expect(container.querySelectorAll('[data-testid="pressable-avatar"]').length).toBe(3);
    expect(container.textContent).toContain('+2');
  });
});
