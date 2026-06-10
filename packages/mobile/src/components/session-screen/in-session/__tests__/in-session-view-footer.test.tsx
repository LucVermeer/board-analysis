// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const footer = vi.hoisted(() => ({
  styles: [] as unknown[],
}));

const bottomChrome = vi.hoisted(() => ({
  metrics: {
    fixedFooterBottom: 88,
  },
}));

vi.mock('react-native', () => ({
  Pressable: ({ children }: { children?: ReactNode }) => createElement('button', null, children),
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  View: ({ children, testID, style }: { children?: ReactNode; testID?: string; style?: unknown }) => {
    if (testID === 'in-session-footer') {
      footer.styles = Array.isArray(style) ? style : [style];
    }
    return createElement('div', testID ? { 'data-testid': testID } : null, children);
  },
}));

vi.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: () => ({
      activeOffsetY: () => ({
        onStart: () => ({
          onUpdate: () => ({
            onEnd: () => ({}),
          }),
        }),
      }),
    }),
  },
  GestureDetector: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));

vi.mock('react-native-reanimated', () => ({
  useSharedValue: (value: number) => ({ value }),
  withSpring: (value: number) => value,
}));

vi.mock('@shopify/flash-list', () => ({
  FlashList: ({
    ListHeaderComponent,
    ListFooterComponent,
  }: {
    ListHeaderComponent?: ReactNode;
    ListFooterComponent?: ReactNode;
  }) => createElement('div', null, ListHeaderComponent, ListFooterComponent),
}));

vi.mock('expo-crypto', () => ({ randomUUID: () => 'test-uuid' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@boardsesh/queue-runtime', () => ({ deriveIsDriver: () => true }));
vi.mock('@boardsesh/play-view', () => ({ formatGrade: (grade: string) => grade, getGradeTextColor: () => '#fff' }));
vi.mock('../../../Button', () => ({ Button: () => createElement('button') }));
vi.mock('../../../ClimbListItemContent', () => ({ ClimbListItemContent: () => null }));
vi.mock('../../../EndSessionSheet', () => ({ EndSessionSheet: () => null }));
vi.mock('../../../Icon', () => ({ Icon: () => null }));
vi.mock('../../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: {
      background: '#000',
      secondaryBackground: '#111',
      secondaryLabel: '#999',
      separator: '#222',
    },
    brandColors: { success: '#0f0', warning: '#ff0' },
  }),
}));
vi.mock('../../../../providers/queue-provider', () => ({
  useQueueActions: () => ({ endSession: vi.fn(async () => null), setCurrentClimb: vi.fn() }),
  useQueueLiveStats: () => ({ liveStats: null, sessionUsers: [] }),
  useQueueSessionControls: () => ({
    driverParticipantId: null,
    participantId: 'participant-1',
    sessionId: 'session-1',
  }),
  useIsPartyPreviewOnly: () => false,
}));
vi.mock('../../../../providers/drawer-host-provider', () => ({ useDrawerHost: () => ({ openPlayDrawer: vi.fn() }) }));
vi.mock('../../../../lib/graphql/hooks', () => ({
  useSessionDetail: () => ({
    data: { totalSends: 0, totalFlashes: 0, gradeDistribution: [], participants: [], hardestGrade: null, ticks: [] },
  }),
  useSessionSummary: () => ({ data: { startedAt: '2026-01-01T00:00:00.000Z' } }),
}));
vi.mock('../../../../lib/climb-to-queue-item', () => ({ climbToQueueItem: vi.fn() }));
vi.mock('../../../../lib/playlists/board-details-for-playlist', () => ({ getBoardConfigForPlaylist: () => null }));
vi.mock('../../../../lib/session-tick-mapping', () => ({ navigateToSessionClimb: vi.fn() }));
vi.mock('../../../../hooks/use-grade-format', () => ({
  useGradeFormat: () => ({ formatGrade: (grade: string | null) => grade, formatGradeByDifficultyId: () => null }),
}));
vi.mock('../../../../hooks/use-bottom-chrome-metrics', () => ({
  useBottomChromeMetrics: () => bottomChrome.metrics,
}));
vi.mock('../../../../theme/colors', () => ({ withAlpha: (color: string) => color }));
vi.mock('../../../../theme/ios-colors', () => ({ iosSystemColors: { systemGray: '#999' } }));
vi.mock('../../../../theme/animations', () => ({ springs: { gentle: {} } }));
vi.mock('../../../../theme/tokens', () => ({ borderRadius: { lg: 16 }, spacing: { 2: 8, 3: 12, 4: 16 } }));
vi.mock('../../../you/profile-chart-colors', () => ({ gradeBadgeColor: () => '#fff' }));
vi.mock('../../../../lib/haptics', () => ({ hapticSelection: vi.fn() }));
vi.mock('../SessionAnalytics', () => ({ SessionAnalytics: () => null }));
vi.mock('../SessionLeaderboard', () => ({ SessionLeaderboard: () => null }));
vi.mock('../SessionPresenceRow', () => ({ SessionPresenceRow: () => null }));

import { InSessionView } from '../InSessionView';

function getPaddingBottom(styles: unknown[]): number | null {
  for (const style of styles) {
    if (style == null || typeof style !== 'object' || Array.isArray(style)) continue;
    const paddingBottom = (style as { paddingBottom?: unknown }).paddingBottom;
    if (typeof paddingBottom === 'number') return paddingBottom;
  }
  return null;
}

describe('InSessionView footer', () => {
  beforeEach(() => {
    footer.styles = [];
    bottomChrome.metrics = { fixedFooterBottom: 88 };
  });

  it('uses the fixed footer bottom metric for footer padding', () => {
    render(createElement(InSessionView));

    expect(getPaddingBottom(footer.styles)).toBe(100);
  });
});
