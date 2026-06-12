// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionFeedItem } from '@boardsesh/shared-schema';
import { SessionFeedCard } from '../SessionFeedCard';

type ViewProps = {
  children?: ReactNode;
  pointerEvents?: string;
};

const chartProps = vi.hoisted(() => ({
  latest: null as Record<string, unknown> | null,
}));

vi.mock('react-native', () => ({
  View: ({ children, pointerEvents }: ViewProps) =>
    createElement('div', { 'data-pointer-events': pointerEvents ?? '' }, children),
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@boardsesh/profile-stats', () => ({ formatTickRelativeTime: () => 'now' }));
vi.mock('@boardsesh/play-view', () => ({ getGradeTextColor: () => '#000000' }));
vi.mock('../../Card', () => ({
  Card: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) =>
    createElement('button', { onClick: onPress }, children),
}));
vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../Icon', () => ({ Icon: () => createElement('span', null) }));
vi.mock('../AvatarGroup', () => ({ AvatarGroup: () => createElement('span', null) }));
vi.mock('../FeedSocialRow', () => ({ FeedSocialRow: () => createElement('span', null) }));
vi.mock('../YouCharts', () => ({
  StackedBarChart: (props: Record<string, unknown>) => {
    chartProps.latest = props;
    return createElement('div', { 'data-testid': 'session-chart' });
  },
}));
vi.mock('../../../hooks/use-grade-format', () => ({
  useGradeFormat: () => ({ formatGrade: (grade: string) => grade }),
}));
vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: {
      secondaryLabel: '#666666',
      tertiaryLabel: '#888888',
    },
    brandColors: {
      success: '#047857',
      warning: '#B45309',
    },
  }),
}));
vi.mock('../../../theme/colors', () => ({ withAlpha: (color: string) => color }));
vi.mock('../../../theme/ios-colors', () => ({ iosSystemColors: { systemGray: '#808080' } }));
vi.mock('../../../theme/tokens', () => ({ spacing: { 1: 4, 2: 8, 3: 12, 4: 16 }, borderRadius: { full: 999 } }));

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
  it('keeps the embedded chart from stealing the card press target', () => {
    const { getByTestId } = render(
      createElement(SessionFeedCard, {
        session: session(),
        onOpenComments: vi.fn(),
        onPress: vi.fn(),
      }),
    );

    expect(getByTestId('session-chart').parentElement?.getAttribute('data-pointer-events')).toBe('none');
    expect(chartProps.latest?.fitYAxisToData).toBe(true);
    expect(chartProps.latest?.interactive).toBe(false);
    expect(chartProps.latest?.zoomable).toBe(false);
  });
});
