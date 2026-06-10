// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { UserBoard } from '@boardsesh/shared-schema';
import type { BoardSerialConfig } from '@boardsesh/graphql/operations';
import type { ResolvedBoardEntry } from '../../../lib/ble/resolve-serials';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  PlatformColor: (colorName: string) => colorName,
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({
    children,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    style?: unknown;
  }) => createElement('button', { 'aria-label': accessibilityLabel }, children),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { time?: string }) => {
      if (key === 'devicePicker.lastConnectedAt') return `Last connected ${options?.time ?? ''}`;
      if (key === 'devicePicker.lastConnected') return 'Last connected board';
      if (key === 'devicePicker.unknownDevice') return 'Unknown device';
      return key;
    },
  }),
}));

vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));

vi.mock('../../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

vi.mock('../../BoardImageNative', () => ({
  BoardImageNative: ({ boardName }: { boardName: string }) => createElement('div', { 'data-board-image': boardName }),
}));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: {
      label: '#111111',
      secondaryLabel: '#666666',
      tertiaryLabel: '#999999',
      fill: '#eeeeee',
      background: '#ffffff',
      secondaryBackground: '#f8f8f8',
      tertiaryBackground: '#f0f0f0',
    },
  }),
}));

vi.mock('../../../theme/ios-colors', () => ({
  iosSystemColors: {
    systemGreen: '#34c759',
    systemYellow: '#ffcc00',
    systemRed: '#ff3b30',
  },
}));

vi.mock('../../../lib/haptics', () => ({
  hapticLight: vi.fn(),
}));

vi.mock('../../../lib/board-details', () => ({
  getBoardRenderData: vi.fn(() => ({
    boardWidth: 100,
    boardHeight: 200,
    edgeLeft: 0,
    edgeRight: 100,
    edgeBottom: 0,
    edgeTop: 200,
    imageUrls: [],
    holdsData: [],
  })),
}));

import { DeviceCard } from '../DeviceCard';

function makeBoard(overrides: Partial<UserBoard> = {}): UserBoard {
  return {
    uuid: 'board-1',
    slug: 'board-1',
    ownerId: 'owner-1',
    boardType: 'kilter',
    layoutId: 1,
    sizeId: 10,
    setIds: '1,20',
    name: 'Garage Kilter',
    isPublic: false,
    isUnlisted: false,
    hideLocation: false,
    isOwned: true,
    angle: 40,
    isAngleAdjustable: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    layoutName: 'Homewall',
    sizeName: '12x12',
    setNames: ['Original', 'Aux'],
    totalAscents: 0,
    uniqueClimbers: 0,
    followerCount: 0,
    commentCount: 0,
    isFollowedByMe: false,
    serialNumber: 'SN-1',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<BoardSerialConfig> = {}): BoardSerialConfig {
  return {
    serialNumber: 'SN-2',
    boardName: 'tension',
    layoutId: 1,
    sizeId: 10,
    setIds: '1',
    apiLevel: 2,
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    boardUuid: null,
    boardSlug: null,
    ...overrides,
  };
}

describe('DeviceCard', () => {
  it('uses the saved board name and preview when a serial resolves to a UserBoard', () => {
    const resolvedBoards = new Map<string, ResolvedBoardEntry>([['SN-1', { kind: 'saved', board: makeBoard() }]]);

    const { container, getByText } = render(
      <DeviceCard
        device={{ deviceId: 'device-1', name: 'Kilter Board#SN-1@3', rssi: -45 }}
        onSelect={vi.fn()}
        resolvedBoards={resolvedBoards}
      />,
    );

    expect(getByText('Garage Kilter')).not.toBeNull();
    expect(getByText('Kilter')).not.toBeNull();
    expect(container.querySelector('[data-board-image="kilter"]')).not.toBeNull();
  });

  it('uses recorded config previews for previously connected controllers', () => {
    const resolvedBoards = new Map<string, ResolvedBoardEntry>([['SN-2', { kind: 'recorded', config: makeConfig() }]]);

    const { container, getByText } = render(
      <DeviceCard
        device={{ deviceId: 'device-2', name: 'Tension Board#SN-2@2', rssi: -55 }}
        onSelect={vi.fn()}
        resolvedBoards={resolvedBoards}
      />,
    );

    expect(getByText('Tension Board#SN-2@2')).not.toBeNull();
    expect(getByText('Tension')).not.toBeNull();
    expect(container.querySelector('[data-board-image="tension"]')).not.toBeNull();
  });

  it('falls back to the active board preview for unresolved devices', () => {
    const { container, getByText } = render(
      <DeviceCard
        device={{ deviceId: 'device-3', name: 'Kilter Board#SN-3@3', rssi: -70 }}
        onSelect={vi.fn()}
        resolvedBoards={new Map()}
        currentBoardConfig={{ boardName: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,20' }}
      />,
    );

    expect(getByText('Kilter Board#SN-3@3')).not.toBeNull();
    expect(container.querySelector('[data-board-image="kilter"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="info"]')).not.toBeNull();
  });
});
