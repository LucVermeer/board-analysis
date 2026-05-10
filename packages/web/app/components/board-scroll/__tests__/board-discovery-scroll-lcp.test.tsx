// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { UserBoard, PopularBoardConfig } from '@boardsesh/shared-schema';

// --- Capture per-card fetchPriority via the mock so tests can assert on the
//     specific card that received the LCP hint, regardless of the user's
//     auth/BLE/saved-board state. ---

vi.mock('../board-scroll-card', () => ({
  default: ({
    userBoard,
    popularConfig,
    fetchPriority,
  }: {
    userBoard?: UserBoard;
    popularConfig?: PopularBoardConfig;
    fetchPriority?: 'high' | 'low' | 'auto';
  }) => {
    const id = userBoard?.uuid ?? `${popularConfig?.boardType}-${popularConfig?.layoutId}-${popularConfig?.sizeId}`;
    return <div data-testid={`board-card-${id}`} data-fetch-priority={fetchPriority ?? 'unset'} />;
  },
}));

vi.mock('../board-scroll-section', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="board-scroll-section">{children}</div>,
}));

vi.mock('../find-nearby-card', () => ({ default: () => <div data-testid="find-nearby-card" /> }));
vi.mock('../custom-board-card', () => ({ default: () => <div data-testid="custom-board-card" /> }));
vi.mock('../search-boards-card', () => ({ default: () => <div data-testid="search-boards-card" /> }));
vi.mock('../bluetooth-quick-start-card', () => ({ default: () => <div data-testid="bluetooth-card" /> }));
vi.mock('../../board-search-drawer/board-search-drawer', () => ({ default: () => null }));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('@/app/lib/i18n/use-locale-router', () => ({
  useLocaleRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../board-scroll.module.css', () => ({
  default: new Proxy({}, { get: (_t, p) => String(p) }),
}));

// --- Configurable hook outputs so tests can compose the four list inputs
//     (discoverBoards / bleOnlyBoards / myBoards / popularConfigs). ---

let mockDiscoverBoards: UserBoard[] = [];
let mockMyBoards: UserBoard[] = [];
let mockBleOnlyBoards: UserBoard[] = [];
let mockPopularConfigs: PopularBoardConfig[] = [];

vi.mock('@/app/hooks/use-discover-boards', () => ({
  useDiscoverBoards: () => ({
    boards: mockDiscoverBoards,
    isLoading: false,
    hasLocation: false,
    error: null,
  }),
}));

vi.mock('@/app/hooks/use-popular-board-configs', () => ({
  usePopularBoardConfigs: () => ({
    configs: mockPopularConfigs,
    isLoadingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}));

vi.mock('@/app/hooks/use-my-boards', () => ({
  useMyBoards: () => ({ boards: mockMyBoards }),
}));

vi.mock('@/app/hooks/use-bluetooth-scan', () => ({
  useBluetoothScan: () => ({
    devices: [],
    resolvedBoards: new Map(
      mockBleOnlyBoards.map((board) => [board.uuid, { kind: 'saved' as const, board }]),
    ),
    status: 'idle',
    startScan: vi.fn(),
  }),
}));

vi.mock('../../board-bluetooth-control/bluetooth-aurora', () => ({
  parseSerialNumber: () => null,
}));

import BoardDiscoveryScroll from '../board-discovery-scroll';

function makeUserBoard(uuid: string, overrides: Partial<UserBoard> = {}): UserBoard {
  return {
    uuid,
    slug: `slug-${uuid}`,
    ownerId: 'owner-1',
    boardType: 'kilter',
    layoutId: 1,
    sizeId: 1,
    setIds: '1',
    angle: 40,
    name: `Board ${uuid}`,
    locationName: 'Gym',
    isPublic: true,
    isUnlisted: false,
    hideLocation: false,
    isOwned: false,
    isAngleAdjustable: false,
    createdAt: '2026-01-01T00:00:00Z',
    totalAscents: 100,
    uniqueClimbers: 0,
    followerCount: 0,
    commentCount: 0,
    isFollowedByMe: false,
    ...overrides,
  };
}

function makePopularConfig(boardType: string, layoutId: number, sizeId: number): PopularBoardConfig {
  return {
    boardType,
    layoutId,
    sizeId,
    setIds: '1',
    displayName: `${boardType} ${layoutId} ${sizeId}`,
    boardCount: 100,
    totalAscents: 1000,
  } as unknown as PopularBoardConfig;
}

function renderScroll() {
  return render(
    <BoardDiscoveryScroll
      onBoardClick={vi.fn()}
      onConfigClick={vi.fn()}
      onCustomClick={vi.fn()}
      myBoards={mockMyBoards.length > 0 ? mockMyBoards : undefined}
    />,
  );
}

beforeEach(() => {
  mockDiscoverBoards = [];
  mockMyBoards = [];
  mockBleOnlyBoards = [];
  mockPopularConfigs = [];
});

describe('BoardDiscoveryScroll fetchPriority routing', () => {
  it('marks the first popular config as high-priority for unauthenticated visitors (no other lists)', () => {
    mockPopularConfigs = [
      makePopularConfig('kilter', 1, 1),
      makePopularConfig('kilter', 1, 2),
      makePopularConfig('tension', 8, 3),
    ];

    renderScroll();

    expect(screen.getByTestId('board-card-kilter-1-1').getAttribute('data-fetch-priority')).toBe('high');
    expect(screen.getByTestId('board-card-kilter-1-2').getAttribute('data-fetch-priority')).toBe('unset');
    expect(screen.getByTestId('board-card-tension-8-3').getAttribute('data-fetch-priority')).toBe('unset');
  });

  it('marks the first nearby (discover) board as high-priority when present', () => {
    mockDiscoverBoards = [makeUserBoard('discover-1'), makeUserBoard('discover-2')];
    mockPopularConfigs = [makePopularConfig('kilter', 1, 1)];

    renderScroll();

    expect(screen.getByTestId('board-card-discover-1').getAttribute('data-fetch-priority')).toBe('high');
    expect(screen.getByTestId('board-card-discover-2').getAttribute('data-fetch-priority')).toBe('unset');
    // Popular configs render below discoverBoards — must not also claim the hint.
    expect(screen.getByTestId('board-card-kilter-1-1').getAttribute('data-fetch-priority')).toBe('unset');
  });

  it('does NOT apply fetchPriority to BLE or myBoards cards (they fade in from opacity:0)', () => {
    // These two lists render with a CSS fade-in (opacity 0 → 1) gated on a
    // requestAnimationFrame callback, so their first-paint state is invisible.
    // Hinting them as LCP would just download a non-LCP image early.
    mockBleOnlyBoards = [makeUserBoard('ble-1')];
    mockMyBoards = [makeUserBoard('my-1')];
    mockPopularConfigs = [makePopularConfig('kilter', 1, 1)];

    renderScroll();

    expect(screen.getByTestId('board-card-ble-1').getAttribute('data-fetch-priority')).toBe('unset');
    expect(screen.getByTestId('board-card-my-1').getAttribute('data-fetch-priority')).toBe('unset');
    // The popular config wins the hint — discoverBoards is empty, BLE and
    // myBoards aren't visible at first paint.
    expect(screen.getByTestId('board-card-kilter-1-1').getAttribute('data-fetch-priority')).toBe('high');
  });

  it('prefers nearby boards over popular configs when both exist', () => {
    mockDiscoverBoards = [makeUserBoard('discover-1')];
    mockBleOnlyBoards = [makeUserBoard('ble-1')];
    mockMyBoards = [makeUserBoard('my-1')];
    mockPopularConfigs = [makePopularConfig('kilter', 1, 1)];

    renderScroll();

    // discoverBoards wins the LCP hint over every other list.
    expect(screen.getByTestId('board-card-discover-1').getAttribute('data-fetch-priority')).toBe('high');
    expect(screen.getByTestId('board-card-ble-1').getAttribute('data-fetch-priority')).toBe('unset');
    expect(screen.getByTestId('board-card-my-1').getAttribute('data-fetch-priority')).toBe('unset');
    expect(screen.getByTestId('board-card-kilter-1-1').getAttribute('data-fetch-priority')).toBe('unset');
  });

  it('does not crash when every list is empty', () => {
    renderScroll();
    // No board cards rendered. The wrapper utility cards still mount.
    expect(screen.queryByTestId('search-boards-card')).not.toBeNull();
  });
});
