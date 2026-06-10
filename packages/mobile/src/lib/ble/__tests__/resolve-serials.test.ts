// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserBoard } from '@boardsesh/shared-schema';
import {
  GET_BOARDS_BY_SERIAL_NUMBERS,
  GET_MY_BOARD_SERIAL_CONFIGS,
  type BoardSerialConfig,
} from '@boardsesh/graphql/operations';

const harness = vi.hoisted(() => ({
  authToken: null as string | null,
  request: vi.fn(),
}));

vi.mock('../../auth-store', () => ({
  getAuthToken: vi.fn(() => Promise.resolve(harness.authToken)),
}));

vi.mock('../../graphql/client', () => ({
  getHttpClient: () => ({ request: harness.request }),
}));

vi.mock('../../graphql/use-auth-token', () => ({
  useAuthToken: vi.fn(() => ({ data: null })),
}));

import { useAuthToken } from '../../graphql/use-auth-token';
import { resolveBleSerialNumbers, serialsFromDiscoveredDevices, useResolvedBleDeviceBoards } from '../resolve-serials';

function makeBoard(serialNumber: string, overrides: Partial<UserBoard> = {}): UserBoard {
  return {
    uuid: `board-${serialNumber}`,
    slug: `board-${serialNumber}`,
    ownerId: 'owner-1',
    boardType: 'kilter',
    layoutId: 1,
    sizeId: 10,
    setIds: '1,20',
    name: `Board ${serialNumber}`,
    isPublic: false,
    isUnlisted: false,
    hideLocation: false,
    isOwned: true,
    angle: 40,
    isAngleAdjustable: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    totalAscents: 0,
    uniqueClimbers: 0,
    followerCount: 0,
    commentCount: 0,
    isFollowedByMe: false,
    serialNumber,
    ...overrides,
  };
}

function makeConfig(serialNumber: string, overrides: Partial<BoardSerialConfig> = {}): BoardSerialConfig {
  return {
    serialNumber,
    boardName: 'kilter',
    layoutId: 1,
    sizeId: 10,
    setIds: '1,20',
    apiLevel: 3,
    updatedAt: '2026-01-02T00:00:00.000Z',
    boardUuid: null,
    boardSlug: null,
    ...overrides,
  };
}

beforeEach(() => {
  harness.authToken = null;
  harness.request.mockReset();
});

describe('serialsFromDiscoveredDevices', () => {
  it('extracts unique serials from BLE device names and caps at 20', () => {
    const devices = Array.from({ length: 22 }, (_unused, deviceIndex) => ({
      deviceId: `device-${deviceIndex}`,
      name: `Kilter Board#SN-${deviceIndex}@3`,
      rssi: -40,
    }));
    devices.push({ deviceId: 'duplicate', name: 'Kilter Board#SN-1@3', rssi: -30 });

    const serialNumbers = serialsFromDiscoveredDevices(devices);

    expect(serialNumbers).toHaveLength(20);
    expect(serialNumbers[0]).toBe('SN-0');
    expect(serialNumbers.at(-1)).toBe('SN-19');
  });
});

describe('resolveBleSerialNumbers', () => {
  it('resolves saved boards and lets saved boards win over recorded configs', async () => {
    harness.authToken = 'token-1';
    const savedBoard = makeBoard('SN-1', { name: 'Saved board' });
    const recordedConfig = makeConfig('SN-1', { boardName: 'tension' });
    harness.request.mockImplementation((operation: unknown) => {
      if (operation === GET_BOARDS_BY_SERIAL_NUMBERS) {
        return Promise.resolve({ boardsBySerialNumbers: [savedBoard] });
      }
      if (operation === GET_MY_BOARD_SERIAL_CONFIGS) {
        return Promise.resolve({ myBoardSerialConfigs: [recordedConfig, makeConfig('SN-2')] });
      }
      return Promise.reject(new Error('Unexpected operation'));
    });

    const resolvedBoards = await resolveBleSerialNumbers(['SN-1', 'SN-2']);

    expect(resolvedBoards.get('SN-1')).toEqual({ kind: 'saved', board: savedBoard });
    expect(resolvedBoards.get('SN-2')).toEqual({ kind: 'recorded', config: makeConfig('SN-2') });
  });

  it('skips recorded configs when signed out', async () => {
    harness.request.mockImplementation((operation: unknown) => {
      if (operation === GET_BOARDS_BY_SERIAL_NUMBERS) {
        return Promise.resolve({ boardsBySerialNumbers: [] });
      }
      if (operation === GET_MY_BOARD_SERIAL_CONFIGS) {
        return Promise.resolve({ myBoardSerialConfigs: [makeConfig('SN-1')] });
      }
      return Promise.reject(new Error('Unexpected operation'));
    });

    const resolvedBoards = await resolveBleSerialNumbers(['SN-1']);

    expect(resolvedBoards.size).toBe(0);
    expect(harness.request).toHaveBeenCalledTimes(1);
    expect(harness.request).toHaveBeenCalledWith(GET_BOARDS_BY_SERIAL_NUMBERS, { serialNumbers: ['SN-1'] });
  });

  it('uses the provided auth token instead of reading storage', async () => {
    harness.request.mockImplementation((operation: unknown) => {
      if (operation === GET_BOARDS_BY_SERIAL_NUMBERS) {
        return Promise.resolve({ boardsBySerialNumbers: [] });
      }
      if (operation === GET_MY_BOARD_SERIAL_CONFIGS) {
        return Promise.resolve({ myBoardSerialConfigs: [makeConfig('SN-1')] });
      }
      return Promise.reject(new Error('Unexpected operation'));
    });

    const resolvedBoards = await resolveBleSerialNumbers(['SN-1'], 'token-from-hook');

    expect(resolvedBoards.get('SN-1')).toEqual({ kind: 'recorded', config: makeConfig('SN-1') });
    expect(harness.request).toHaveBeenCalledTimes(2);
  });
});

// ── useResolvedBleDeviceBoards — hook-level enabled guard ───────────────────

function makeQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeDevices(serials: string[]) {
  return serials.map((serial, index) => ({
    deviceId: `device-${index}`,
    name: `Kilter Board#${serial}@3`,
    rssi: -50,
  }));
}

describe('useResolvedBleDeviceBoards', () => {
  beforeEach(() => {
    harness.request.mockReset();
    vi.mocked(useAuthToken).mockReturnValue({ data: undefined } as ReturnType<typeof useAuthToken>);
  });

  it('fires the saved-boards query when signed out (authToken === null) because null !== undefined', async () => {
    // The enabled guard is `authToken !== undefined`, so null (signed-out) lets
    // the query through — only the recorded-configs branch requires a token.
    vi.mocked(useAuthToken).mockReturnValue({ data: null } as ReturnType<typeof useAuthToken>);
    harness.request.mockImplementation((operation: unknown) => {
      if (operation === GET_BOARDS_BY_SERIAL_NUMBERS) {
        return Promise.resolve({ boardsBySerialNumbers: [makeBoard('SN-A')] });
      }
      return Promise.reject(new Error('Unexpected operation'));
    });

    const { result } = renderHook(
      () => useResolvedBleDeviceBoards(makeDevices(['SN-A'])),
      { wrapper: makeQueryWrapper() },
    );

    await waitFor(() => expect(result.current.size).toBeGreaterThan(0));

    expect(result.current.get('SN-A')).toEqual({ kind: 'saved', board: makeBoard('SN-A') });
    // Only the public saved-boards query fires; the auth-gated recorded-configs
    // query is skipped because authToken is null (falsy) inside resolveBleSerialNumbers.
    expect(harness.request).toHaveBeenCalledTimes(1);
    expect(harness.request).toHaveBeenCalledWith(GET_BOARDS_BY_SERIAL_NUMBERS, { serialNumbers: ['SN-A'] });
  });

  it('does not fire any query while authToken is still loading (authToken === undefined)', async () => {
    // useAuthToken returns { data: undefined } while the token query is pending.
    // The enabled guard `authToken !== undefined` evaluates to false, so the
    // hook should return the empty map without making any requests.
    vi.mocked(useAuthToken).mockReturnValue({ data: undefined } as ReturnType<typeof useAuthToken>);

    const { result } = renderHook(
      () => useResolvedBleDeviceBoards(makeDevices(['SN-B'])),
      { wrapper: makeQueryWrapper() },
    );

    // Give TanStack Query a tick to evaluate the enabled guard.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.request).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });
});
