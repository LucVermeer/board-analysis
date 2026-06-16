// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionDetailTick, SessionFeedParticipant } from '@boardsesh/shared-schema';

// Capture what ClimbListItemContent receives so we can assert primarySubtitleOverride.
const mockClimbListItemContent = vi.hoisted(() => vi.fn());

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@boardsesh/play-view', () => ({ getGradeTextColor: () => '#fff' }));
vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../Icon', () => ({ Icon: () => createElement('i', null) }));
vi.mock('../../ListRow', () => ({ ListRow: () => createElement('div', { 'data-testid': 'list-row' }) }));
vi.mock('../../Avatar', () => ({ Avatar: () => createElement('span', { 'data-testid': 'avatar' }) }));
vi.mock('../../PressableSurface', () => ({
  PressableSurface: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) =>
    createElement('div', { onClick: onPress }, children),
}));
vi.mock('../../ClimbListItemContent', () => ({
  ClimbListItemContent: (props: Record<string, unknown>) => {
    mockClimbListItemContent(props);
    return createElement('div', { 'data-testid': 'climb-content' });
  },
}));
vi.mock('../../you/profile-chart-colors', () => ({ gradeBadgeColor: () => '#000' }));
vi.mock('../../../hooks/use-grade-format', () => ({
  useGradeFormat: () => ({
    formatGrade: (g: string) => g,
    formatGradeByDifficultyId: () => null,
  }),
}));
vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: {
      secondaryBackground: '#fff',
      separator: '#ccc',
    },
  }),
}));
vi.mock('../../../theme/colors', () => ({
  brandColors: { warning: '#fa0', success: '#0a0' },
  withAlpha: (c: string) => c,
}));
vi.mock('../../../theme/ios-colors', () => ({ iosSystemColors: { systemGray: '#888', white: '#fff' } }));
vi.mock('../../../theme/tokens', () => ({
  spacing: { 2: 8, 3: 12 },
  borderRadius: { sm: 4 },
}));
vi.mock('../../../lib/playlists/board-details-for-playlist', () => ({
  getBoardConfigForPlaylist: () => ({
    boardName: 'kilter',
    layoutId: 1,
    sizeId: 1,
    setIds: [1],
  }),
}));
vi.mock('../../../lib/session-tick-mapping', () => ({
  sessionTickToClimb: () => ({
    uuid: 'climb-1',
    name: 'Test Climb',
    frames: 'some-frames',
    difficulty: 'V4',
    ascensionist_count: 10,
    quality_average: '3.5',
    setter_username: 'setter',
    benchmark_difficulty: null,
    mirrored: false,
    is_no_match: false,
  }),
}));
vi.mock('../../../lib/haptics', () => ({ hapticSelection: () => {} }));
vi.mock('../../icon-map', () => ({}));

import { SessionTickRow } from '../SessionTickRow';

function tick(overrides: Partial<SessionDetailTick> = {}): SessionDetailTick {
  return {
    uuid: 'tick-1',
    userId: 'user-1',
    climbUuid: 'climb-1',
    climbName: 'Test Climb',
    boardType: 'kilter',
    layoutId: 1,
    angle: 40,
    status: 'send',
    attemptCount: 1,
    difficulty: 12,
    difficultyName: 'V4',
    quality: null,
    isMirror: false,
    isBenchmark: false,
    isNoMatch: false,
    comment: null,
    frames: 'some-frames',
    setterUsername: 'setter',
    climbedAt: '2026-06-15T10:00:00.000Z',
    upvotes: 0,
    totalAttempts: 1,
    betaLinks: [],
    ...overrides,
  };
}

function participant(displayName: string): SessionFeedParticipant {
  return { userId: 'user-1', displayName, avatarUrl: null, sends: 1, flashes: 0, attempts: 0 };
}

beforeEach(() => {
  mockClimbListItemContent.mockClear();
});

describe('SessionTickRow — primarySubtitleOverride', () => {
  it('passes null in a solo session to suppress the default subtitle', () => {
    render(
      createElement(SessionTickRow, {
        tick: tick(),
        isMultiUser: false,
        onPress: () => {},
      }),
    );
    expect(mockClimbListItemContent).toHaveBeenCalledWith(expect.objectContaining({ primarySubtitleOverride: null }));
  });

  it('passes the participant display name in a multi-user session', () => {
    render(
      createElement(SessionTickRow, {
        tick: tick(),
        isMultiUser: true,
        participant: participant('Cata'),
        onPress: () => {},
      }),
    );
    expect(mockClimbListItemContent).toHaveBeenCalledWith(expect.objectContaining({ primarySubtitleOverride: 'Cata' }));
  });

  it('falls back to undefined (computed subtitle) in multi-user when participant is absent', () => {
    render(
      createElement(SessionTickRow, {
        tick: tick(),
        isMultiUser: true,
        participant: undefined,
        onPress: () => {},
      }),
    );
    expect(mockClimbListItemContent).toHaveBeenCalledWith(
      expect.objectContaining({ primarySubtitleOverride: undefined }),
    );
  });
});
