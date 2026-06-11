// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Captures the history list's reserved bottom padding so the test can assert the
// in-session list clears the bottom chrome without an End action bar.
const list = vi.hoisted(() => ({
  contentContainerStyle: null as Record<string, unknown> | null,
}));

const bottomChrome = vi.hoisted(() => ({
  metrics: {
    fixedFooterBottom: 88,
    tabBarBottom: 50,
  },
}));

vi.mock('react-native', () => ({
  Pressable: ({ children }: { children?: ReactNode }) => createElement('button', null, children),
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  View: ({ children, testID }: { children?: ReactNode; testID?: string }) =>
    createElement('div', testID ? { 'data-testid': testID } : null, children),
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

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@shopify/flash-list', () => ({
  FlashList: ({
    ListHeaderComponent,
    ListFooterComponent,
    contentContainerStyle,
  }: {
    ListHeaderComponent?: ReactNode;
    ListFooterComponent?: ReactNode;
    contentContainerStyle?: Record<string, unknown>;
  }) => {
    list.contentContainerStyle = contentContainerStyle ?? null;
    return createElement('div', null, ListHeaderComponent, ListFooterComponent);
  },
}));

vi.mock('expo-crypto', () => ({ randomUUID: () => 'test-uuid' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@boardsesh/queue-runtime', () => ({ deriveIsDriver: () => true }));
vi.mock('@boardsesh/play-view', () => ({ formatGrade: (grade: string) => grade, getGradeTextColor: () => '#fff' }));
vi.mock('../../../Button', () => ({ Button: () => createElement('button') }));
vi.mock('../../../Card', () => ({
  Card: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../../../GlassSurface', () => ({ GlassSurface: () => null }));
vi.mock('../../../ListRow', () => ({ ListRow: () => null }));
vi.mock('../../../PressableSurface', () => ({
  PressableSurface: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../../../SectionHeader', () => ({ SectionHeader: () => null }));
vi.mock('../../RecordTopChrome', () => ({ RecordTopChrome: () => null }));
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
vi.mock('../../../../hooks/use-native-glass', () => ({ useNativeGlass: () => false }));
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

describe('InSessionView footer', () => {
  beforeEach(() => {
    list.contentContainerStyle = null;
    bottomChrome.metrics = { fixedFooterBottom: 88, tabBarBottom: 50 };
  });

  it('reserves only the bottom-chrome offset now that End moved to the top chrome', () => {
    render(createElement(InSessionView));

    // End no longer renders a bottom action bar, so the list reserves just the
    // fixed-footer offset (tab bar + climb accessory) — no extra footer height.
    expect(list.contentContainerStyle?.paddingBottom).toBe(88);
  });

  it('renders no in-session bottom action bar', () => {
    const { queryByTestId } = render(createElement(InSessionView));
    expect(queryByTestId('in-session-footer')).toBeNull();
  });
});
