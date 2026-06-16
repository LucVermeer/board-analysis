// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionFeedItem, SessionFeedTickHighlight } from '@boardsesh/shared-schema';
import { SessionFeedCard } from '../SessionFeedCard';

type ViewProps = {
  children?: ReactNode;
  pointerEvents?: string;
};

type PressableProps = {
  children?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
};

const chartProps = vi.hoisted(() => ({ latest: {} as Record<string, unknown>, renderCount: 0 }));

vi.mock('react-native', () => ({
  View: ({ children, pointerEvents }: ViewProps) =>
    createElement('div', { 'data-pointer-events': pointerEvents ?? '' }, children),
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Linking: { canOpenURL: vi.fn().mockResolvedValue(true), openURL: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('expo-image', () => ({ Image: () => createElement('img') }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@boardsesh/profile-stats', () => ({ formatTickRelativeTime: () => 'now' }));
vi.mock('@boardsesh/shared-schema', () => ({
  isBetaVideoUrl: () => true,
  isInstagramUrl: () => true,
  isTikTokUrl: () => false,
}));
vi.mock('../../Card', () => ({
  Card: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../../PressableSurface', () => ({
  PressableSurface: ({ children, onPress, accessibilityLabel }: PressableProps) =>
    createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children),
}));
vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../Icon', () => ({ Icon: () => createElement('span', null) }));
vi.mock('../../ClimbListThumbnail', () => ({
  ClimbListThumbnail: () => createElement('span', null),
  THUMBNAIL_WIDTH: 76,
  THUMBNAIL_HEIGHT: 96,
}));
vi.mock('../AvatarGroup', () => ({ AvatarGroup: () => createElement('span', null) }));
vi.mock('../FeedSocialRow', () => ({ FeedSocialRow: () => createElement('span', null) }));
vi.mock('../MetricChip', () => ({ MetricChip: () => createElement('span', null) }));
vi.mock('../YouCharts', () => ({
  StackedBarChart: (props: Record<string, unknown>) => {
    chartProps.latest = props;
    chartProps.renderCount += 1;
    return createElement('div', { 'data-testid': 'session-chart' });
  },
}));
vi.mock('../profile-chart-colors', () => ({
  gradeBadgeColor: () => '#DC2626',
  buildSessionGradeBars: () => [],
}));
vi.mock('../../../hooks/use-grade-format', () => ({
  useGradeFormat: () => ({ formatGrade: (grade: string) => grade }),
}));
vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: {
      label: '#111111',
      secondaryLabel: '#666666',
      tertiaryLabel: '#888888',
      separator: '#dddddd',
      fill: '#eeeeee',
    },
    brandColors: { primary: '#2563eb', success: '#047857', warning: '#B45309', error: '#DC2626' },
  }),
}));
vi.mock('../../../providers/toast-provider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24 },
  borderRadius: { full: 999, md: 8 },
}));
vi.mock('../../../lib/haptics', () => ({ hapticLight: vi.fn() }));
vi.mock('../../../lib/beta-video-url', () => ({
  isInstagramUrl: (url: string) => url.includes('instagram.com'),
  isTikTokUrl: (url: string) => url.includes('tiktok.com'),
  mapBetaLink: (row: {
    climbUuid: string;
    link: string;
    foreignUsername: string | null;
    angle: number | null;
    thumbnail: string | null;
    isListed: boolean | null;
    createdAt: string;
    tickUuid?: string | null;
    boardId?: number | null;
  }) => ({
    climb_uuid: row.climbUuid,
    link: row.link,
    foreign_username: row.foreignUsername,
    angle: row.angle,
    thumbnail: row.thumbnail,
    is_listed: row.isListed ?? false,
    created_at: row.createdAt,
    tick_uuid: row.tickUuid ?? null,
    board_id: row.boardId ?? null,
  }),
}));
vi.mock('../../../lib/playlists/board-details-for-playlist', () => ({ getBoardConfigForPlaylist: () => null }));

function tick(overrides?: Partial<SessionFeedTickHighlight>): SessionFeedTickHighlight {
  return {
    uuid: 'tick-1',
    userId: 'user-1',
    climbUuid: 'climb-1',
    climbName: 'Moon Dust',
    boardType: 'kilter',
    layoutId: 1,
    angle: 40,
    status: 'send',
    attemptCount: 3,
    difficultyName: 'V4',
    isMirror: false,
    isBenchmark: false,
    isNoMatch: false,
    climbedAt: '2026-06-12T00:00:00.000Z',
    ...overrides,
  };
}

function session(overrides?: Partial<SessionFeedItem>): SessionFeedItem {
  return {
    sessionId: 'session-1',
    sessionType: 'party',
    participants: [],
    totalSends: 3,
    totalFlashes: 1,
    totalAttempts: 2,
    tickCount: 5,
    gradeDistribution: [{ grade: 'V4', flash: 1, send: 2, attempt: 0 }],
    boardTypes: ['kilter'],
    hardestGrade: 'V4',
    hardestSend: null,
    featuredBeta: null,
    socialEntityType: 'session',
    socialEntityId: 'session-1',
    firstTickAt: '2026-06-12T00:00:00.000Z',
    lastTickAt: '2026-06-12T00:00:00.000Z',
    upvotes: 0,
    downvotes: 0,
    voteScore: 0,
    commentCount: 0,
    ...overrides,
  };
}

describe('SessionFeedCard chart', () => {
  it('keeps the grade chart collapsed until the chart chip is pressed', async () => {
    chartProps.latest = {};
    chartProps.renderCount = 0;
    const { queryByTestId, getByLabelText } = render(
      createElement(SessionFeedCard, {
        session: session(),
        onOpenComments: vi.fn(),
        onPress: vi.fn(),
      }),
    );

    expect(queryByTestId('session-chart')).toBeNull();

    fireEvent.click(getByLabelText('sessionFeedCard.chartLabel'));

    await waitFor(() => expect(queryByTestId('session-chart')).not.toBeNull());
    expect(chartProps.latest?.fitYAxisToData).toBe(true);
    expect(chartProps.latest?.interactive).toBe(false);
    expect(chartProps.latest?.zoomable).toBe(false);
  });

  it('opens the hardest send via onOpenClimb when the hero is pressed', () => {
    const onOpenClimb = vi.fn();
    const hardest = tick();
    const { getByLabelText } = render(
      createElement(SessionFeedCard, {
        // No featuredBeta: when a featured beta is present it takes the single
        // hero slot (see heroIsHardestSend in SessionFeedCard). This test
        // exercises the hardest-send hero press, so the card must have no beta.
        session: session({ hardestSend: tick() }),
        onOpenComments: vi.fn(),
        onPress: vi.fn(),
        onOpenClimb,
      }),
    );

    fireEvent.click(getByLabelText('sessionFeedCard.openHardestClimb'));
    expect(onOpenClimb).toHaveBeenCalledWith(hardest);
  });
});
