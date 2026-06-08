// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { Climb } from '@boardsesh/queue';

const ctrl = vi.hoisted(() => ({ back: vi.fn() }));

// ── React Native ──────────────────────────────────────────────────────────────
vi.mock('react-native', () => ({
  View: ({
    children,
    pointerEvents,
    style,
    onLayout,
  }: {
    children?: ReactNode;
    pointerEvents?: string;
    style?: unknown;
    onLayout?: (e: unknown) => void;
  }) => {
    const attrs: Record<string, unknown> = {};
    if (pointerEvents) attrs['data-pointer-events'] = pointerEvents;
    if (onLayout) attrs['data-has-layout'] = 'true';
    return createElement('div', attrs, children);
  },
  StyleSheet: {
    create: (s: Record<string, unknown>) => s,
    absoluteFill: {},
    hairlineWidth: 1,
  },
}));

// ── Reanimated ────────────────────────────────────────────────────────────────
vi.mock('react-native-reanimated', () => ({
  default: {
    View: ({ children, style }: { children?: ReactNode; style?: unknown }) =>
      createElement('div', { 'data-animated-view': 'true' }, children),
  },
  useAnimatedStyle: () => ({}),
  useSharedValue: (v: number) => ({ value: v }),
  // useAnimatedReaction runs on a worklet thread — no-op in jsdom; the
  // component initialises `collapsed` to false via useState, which is what the
  // tests assert against.
  useAnimatedReaction: () => undefined,
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  interpolate: (v: number) => v,
  Extrapolation: { CLAMP: 'CLAMP' },
}));

// ── Expo / third-party ────────────────────────────────────────────────────────
vi.mock('expo-linear-gradient', () => ({
  LinearGradient: ({
    colors,
    children,
  }: {
    colors: string[];
    children?: ReactNode;
  }) => createElement('div', { 'data-gradient': JSON.stringify(colors) }, children ?? null),
}));

vi.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    ListHeaderComponent,
    ListEmptyComponent,
    ListFooterComponent,
    onEndReached,
  }: {
    data?: unknown[];
    ListHeaderComponent?: ReactNode;
    ListEmptyComponent?: ReactNode;
    ListFooterComponent?: ReactNode;
    onEndReached?: () => void;
  }) =>
    createElement(
      'div',
      { 'data-list': 'true', onClick: onEndReached },
      ListHeaderComponent ?? null,
      data?.length === 0 ? ListEmptyComponent ?? null : null,
      ListFooterComponent ?? null,
    ),
}));

vi.mock('expo-router', () => ({ useRouter: () => ({ back: ctrl.back }) }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => key }),
}));

// ── Theme / providers ─────────────────────────────────────────────────────────
vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({ systemColors: { label: '#000000', fill: '#eeeeee' } }),
}));

vi.mock('../../../providers/drawer-host-provider', () => ({
  useDrawerHost: () => ({ boardConfig: null }),
}));

vi.mock('../../../hooks/use-bottom-chrome-metrics', () => ({
  useBottomChromeMetrics: () => ({ scrollBottomPadding: 0 }),
}));

vi.mock('../../../theme/layout', () => ({ glassSize: { standard: 48, capsule: 36, hero: 56 } }));
vi.mock('../../../theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 4: 16, 5: 20, 12: 48 },
  borderRadius: { xl: 24 },
}));
vi.mock('../../../theme/colors', () => ({
  withAlpha: (color: string, alpha: number) => `${color}|${alpha}`,
}));
vi.mock('../../../theme/ios-colors', () => ({
  iosSystemColors: { white: '#ffffff', systemGray4: '#aeaeb2' },
}));

// ── Leaf components ───────────────────────────────────────────────────────────
vi.mock('../../Text', () => ({
  Text: ({ children, variant }: { children?: ReactNode; variant?: string }) =>
    createElement('span', { 'data-variant': variant ?? '' }, children),
}));

vi.mock('../../Icon', () => ({
  Icon: ({ name, size }: { name: string; size?: number }) =>
    createElement('span', { 'data-icon': name, 'data-size': size }),
}));

vi.mock('../../ActivityIndicator', () => ({
  ActivityIndicator: ({ size }: { size?: string }) =>
    createElement('div', { 'data-spinner': size ?? 'default' }),
}));

vi.mock('../../ClimbListRow', () => ({ ClimbListRow: () => null }));

vi.mock('../../GlassIconButton', () => ({
  GlassIconButton: ({
    iconName,
    onPress,
    accessibilityLabel,
  }: {
    iconName: string;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => createElement('button', { 'data-icon': iconName, onClick: onPress, 'aria-label': accessibilityLabel }),
}));

vi.mock('../PlaylistBoardBackdrop', () => ({
  PlaylistBoardBackdrop: ({ boardType }: { boardType: string }) =>
    createElement('div', { 'data-backdrop': boardType }),
}));

// Use real playlist-gradient and playlist-colors (pure TS, no RN imports).

// ── Subject ───────────────────────────────────────────────────────────────────
import { PlaylistDetailView, type PlaylistDetailViewProps } from '../PlaylistDetailView';

// ── Helpers ───────────────────────────────────────────────────────────────────
const CLIMB: Climb = {
  uuid: 'abc-123',
  name: 'Test Route',
  setter_username: 'tester',
  frames: '',
  angle: 40,
  ascensionist_count: 5,
  difficulty: '10',
  quality_average: '3.0',
  stars: 3,
  difficulty_error: '0',
  benchmark_difficulty: null,
};

function makeProps(overrides: Partial<PlaylistDetailViewProps> = {}): PlaylistDetailViewProps {
  return {
    hero: {
      name: 'My Playlist',
      climbCount: 12,
      color: '#8C4A52',
    },
    climbs: [],
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    onActivateClimb: vi.fn(),
    emptyMessage: 'No climbs yet',
    ...overrides,
  };
}

describe('PlaylistDetailView', () => {
  beforeEach(() => {
    ctrl.back.mockClear();
  });

  // ── Navigation ──────────────────────────────────────────────────────────────

  it('always renders the back FAB', () => {
    const { container } = render(<PlaylistDetailView {...makeProps()} />);
    const btn = container.querySelector('[data-icon="back"]');
    expect(btn).not.toBeNull();
  });

  it('clicking the back FAB calls router.back', () => {
    const { container } = render(<PlaylistDetailView {...makeProps()} />);
    fireEvent.click(container.querySelector('[data-icon="back"]') as HTMLElement);
    expect(ctrl.back).toHaveBeenCalledTimes(1);
  });

  // ── Action threading ────────────────────────────────────────────────────────

  it('calls actions(false) initially and renders the returned node', () => {
    const actions = vi.fn((collapsed: boolean) =>
      createElement('span', { 'data-action-collapsed': String(collapsed) }, 'action'),
    );
    const { container } = render(<PlaylistDetailView {...makeProps({ actions })} />);
    expect(actions).toHaveBeenCalledWith(false);
    expect(container.querySelector('[data-action-collapsed="false"]')).not.toBeNull();
  });

  it('renders no actions container when actions prop is omitted', () => {
    const { container } = render(<PlaylistDetailView {...makeProps()} />);
    // Only the back FAB button should be present; no extra data-icon= elements
    const allButtons = container.querySelectorAll('button[data-icon]');
    expect(allButtons).toHaveLength(1);
  });

  // ── Hero content ────────────────────────────────────────────────────────────

  it('renders the playlist name in the collapsed header bar', () => {
    const { getAllByText } = render(<PlaylistDetailView {...makeProps()} />);
    // The name appears both in the hero banner and the collapsed header bar
    const nodes = getAllByText('My Playlist');
    expect(nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the emoji icon when hero.icon is set', () => {
    const { getByText } = render(<PlaylistDetailView {...makeProps({ hero: { name: 'P', climbCount: 0, icon: '🏔️' } })} />);
    expect(getByText('🏔️')).not.toBeNull();
  });

  it('falls back to the tag icon when hero.icon is absent', () => {
    const { container } = render(<PlaylistDetailView {...makeProps()} />);
    expect(container.querySelector('[data-icon="tag"]')).not.toBeNull();
  });

  it('renders description when provided', () => {
    const { getByText } = render(
      <PlaylistDetailView {...makeProps({ hero: { name: 'P', climbCount: 0, description: 'A great playlist' } })} />,
    );
    expect(getByText('A great playlist')).not.toBeNull();
  });

  it('renders subtitle when provided', () => {
    const { getByText } = render(
      <PlaylistDetailView {...makeProps({ hero: { name: 'P', climbCount: 0, subtitle: 'by Setter A' } })} />,
    );
    expect(getByText('by Setter A')).not.toBeNull();
  });

  it('renders follower label when provided', () => {
    const { getByText } = render(
      <PlaylistDetailView {...makeProps({ hero: { name: 'P', climbCount: 0, followerLabel: '42 followers' } })} />,
    );
    expect(getByText('42 followers')).not.toBeNull();
  });

  // ── Loading / empty states ──────────────────────────────────────────────────

  it('shows large loading spinner when isLoading=true and climbs is empty', () => {
    const { container } = render(<PlaylistDetailView {...makeProps({ isLoading: true, climbs: [] })} />);
    expect(container.querySelector('[data-spinner="large"]')).not.toBeNull();
  });

  it('shows empty message and playlist icon when not loading and climbs is empty', () => {
    const { getByText, container } = render(
      <PlaylistDetailView {...makeProps({ isLoading: false, climbs: [] })} />,
    );
    expect(getByText('No climbs yet')).not.toBeNull();
    expect(container.querySelector('[data-icon="playlist"]')).not.toBeNull();
  });

  it('shows a small footer spinner when isFetchingNextPage=true', () => {
    const { container } = render(
      <PlaylistDetailView {...makeProps({ isFetchingNextPage: true, climbs: [CLIMB] })} />,
    );
    expect(container.querySelector('[data-spinner="small"]')).not.toBeNull();
  });

  it('shows no footer spinner when isFetchingNextPage=false', () => {
    const { container } = render(
      <PlaylistDetailView {...makeProps({ isFetchingNextPage: false, climbs: [CLIMB] })} />,
    );
    expect(container.querySelector('[data-spinner="small"]')).toBeNull();
  });

  // ── Board backdrop ──────────────────────────────────────────────────────────

  it('renders PlaylistBoardBackdrop when showBoardBackdrop and boardType are set', () => {
    const { container } = render(
      <PlaylistDetailView
        {...makeProps({ hero: { name: 'P', climbCount: 0, showBoardBackdrop: true, boardType: 'kilter' } })}
      />,
    );
    expect(container.querySelector('[data-backdrop="kilter"]')).not.toBeNull();
  });

  it('does not render backdrop when showBoardBackdrop is false', () => {
    const { container } = render(
      <PlaylistDetailView
        {...makeProps({ hero: { name: 'P', climbCount: 0, showBoardBackdrop: false, boardType: 'kilter' } })}
      />,
    );
    expect(container.querySelector('[data-backdrop]')).toBeNull();
  });

  it('uses translucent gradient colors when board backdrop is enabled', () => {
    const { container } = render(
      <PlaylistDetailView
        {...makeProps({ hero: { name: 'P', climbCount: 0, showBoardBackdrop: true, boardType: 'kilter', color: '#8C4A52' } })}
      />,
    );
    const gradients = container.querySelectorAll('[data-gradient]');
    // The first gradient is the colour wash — its colors should be the withAlpha strings
    const firstGradientColors: string[] = JSON.parse(gradients[0]?.getAttribute('data-gradient') ?? '[]');
    expect(firstGradientColors.every((c) => c.includes('|0.82'))).toBe(true);
  });

  it('uses opaque gradient colors when board backdrop is disabled', () => {
    const { container } = render(
      <PlaylistDetailView
        {...makeProps({ hero: { name: 'P', climbCount: 0, showBoardBackdrop: false, color: '#8C4A52' } })}
      />,
    );
    const gradients = container.querySelectorAll('[data-gradient]');
    const firstGradientColors: string[] = JSON.parse(gradients[0]?.getAttribute('data-gradient') ?? '[]');
    // No alpha suffix means opaque colors from buildHeroGradient
    expect(firstGradientColors.every((c) => !c.includes('|0.82'))).toBe(true);
  });
});
