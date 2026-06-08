// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionFeedParticipant } from '@boardsesh/shared-schema';

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    hairlineWidth: 1,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));

vi.mock('../../../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

vi.mock('../../../Avatar', () => ({
  Avatar: ({ name }: { name?: string | null }) => createElement('span', { 'data-avatar': name ?? '' }),
}));

vi.mock('../../../SectionHeader', () => ({
  SectionHeader: ({ title }: { title: string }) => createElement('h2', null, title),
}));

vi.mock('../../../../providers/theme-provider', () => ({
  useTheme: () => ({
    brandColors: {
      primary: '#007aff',
      success: '#34c759',
      warning: '#ff9500',
    },
    systemColors: {
      secondaryBackground: '#f2f2f7',
      separator: '#c6c6c8',
      secondaryLabel: '#6e6e73',
    },
  }),
}));

vi.mock('../../../../theme/colors', () => ({
  brandColors: {
    primary: '#007aff',
    success: '#34c759',
    warning: '#ff9500',
  },
  withAlpha: (color: string) => `${color}1a`,
}));

vi.mock('../../../../theme/ios-colors', () => ({
  iosSystemColors: {
    systemGray: '#8e8e93',
  },
}));

vi.mock('../../../../theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 3: 12 },
  borderRadius: { full: 999, lg: 12 },
}));

import { SessionLeaderboard } from '../SessionLeaderboard';

const participant = (overrides: Partial<SessionFeedParticipant>): SessionFeedParticipant => ({
  userId: 'user-1',
  displayName: 'Alex',
  avatarUrl: null,
  sends: 1,
  flashes: 0,
  attempts: 0,
  ...overrides,
});

describe('SessionLeaderboard', () => {
  it('marks the driver by database user id after participant id mapping', () => {
    const participants = [
      participant({ userId: 'db-user-1', displayName: 'Ari', sends: 2 }),
      participant({ userId: 'db-user-2', displayName: 'Bo', sends: 1 }),
    ];

    const { container } = render(
      <SessionLeaderboard participants={participants} driverUserId="db-user-1" selfUserId={null} />,
    );

    expect(container.textContent).toContain('Ari');
    expect(container.textContent).toContain('mobile.session.inDriverLabel');
    expect(container.querySelector('[data-icon="lightbulb.fill"]')).not.toBeNull();
  });

  it('does not mark a row when only the session participant id is provided', () => {
    const participants = [
      participant({ userId: 'db-user-1', displayName: 'Ari', sends: 2 }),
      participant({ userId: 'db-user-2', displayName: 'Bo', sends: 1 }),
    ];

    const { container } = render(
      <SessionLeaderboard participants={participants} driverUserId="session-participant-1" selfUserId={null} />,
    );

    expect(container.textContent).not.toContain('mobile.session.inDriverLabel');
    expect(container.querySelector('[data-icon="lightbulb.fill"]')).toBeNull();
  });
});
