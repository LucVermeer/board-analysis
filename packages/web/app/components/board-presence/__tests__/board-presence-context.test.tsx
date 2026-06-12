import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, act, waitFor } from '@testing-library/react';
import React, { createElement, useEffect, type ReactNode } from 'react';
import type { ResolvedBoard } from '@boardsesh/shared-schema';

const flags = vi.hoisted(() => ({ value: false as boolean }));
const transport = vi.hoisted(() => ({
  resolveBoardForSerial: vi.fn(async () => ({ boardId: 42, boardName: 'Garage Wall' }) as unknown as ResolvedBoard),
  resolveBoardForConfig: vi.fn(async () => ({ boardId: 43, boardName: 'MoonBoard 2019' }) as unknown as ResolvedBoard),
}));
const auth = vi.hoisted(() => ({ token: 'tok' as string | null }));
const sharedProvider = vi.hoisted(() => ({
  lastBoardId: undefined as number | null | undefined,
  lastClient: null as unknown,
  clientHistory: [] as unknown[],
}));
const wsClient = vi.hoisted(() => ({ created: 0, disposed: 0, lastId: 0 }));

vi.mock('../../providers/feature-flags-provider', () => ({
  useFeatureFlag: () => flags.value,
}));

vi.mock('@/app/hooks/use-ws-auth-token', () => ({
  useWsAuthToken: () => ({ token: auth.token, isAuthenticated: true, isLoading: false, error: null }),
}));

vi.mock('@/app/lib/backend-url', () => ({
  getBackendWsUrl: () => 'ws://localhost/graphql',
}));

vi.mock('../../graphql-queue/graphql-client', () => ({
  createGraphQLClient: () => {
    wsClient.created += 1;
    wsClient.lastId += 1;
    return { id: wsClient.lastId, dispose: () => void (wsClient.disposed += 1) };
  },
}));

vi.mock('../board-presence-client', () => ({
  createWebBoardPresenceClient: (getClient: () => unknown) => ({
    wsClient: getClient(),
    resolveBoardForSerial: transport.resolveBoardForSerial,
    resolveBoardForConfig: transport.resolveBoardForConfig,
    subscribeNowPlaying: () => () => {},
    fetchRecentClimbs: async () => [],
    fetchStats: async () => null,
    reportClimb: async () => true,
  }),
}));

vi.mock('@/app/lib/analytics', () => ({ track: () => {} }));

// Capture the boardId handed to the shared provider so we can assert it updates
// after resolve.
vi.mock('@boardsesh/board-presence-react', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    BoardPresenceActionsContext: react.createContext(undefined),
    BoardPresenceCurrentContext: react.createContext({
      currentClimb: null,
      previousClimb: null,
      undoTarget: null,
      isLive: false,
    }),
    BoardPresenceProvider: ({
      boardId,
      client,
      children,
    }: {
      boardId: number | null;
      client: unknown;
      children: ReactNode;
    }) => {
      sharedProvider.lastBoardId = boardId;
      sharedProvider.lastClient = client;
      sharedProvider.clientHistory.push(client);
      return createElement('div', { 'data-board-id': String(boardId) }, children);
    },
  };
});

import { WebBoardPresenceProvider, useBoardPresenceControls } from '../board-presence-context';

let capturedControls: ReturnType<typeof useBoardPresenceControls> | null = null;
function Probe() {
  const controls = useBoardPresenceControls();
  useEffect(() => {
    capturedControls = controls;
  }, [controls]);
  return null;
}

function renderProvider() {
  return render(createElement(WebBoardPresenceProvider, null, createElement(Probe)));
}

describe('WebBoardPresenceProvider', () => {
  beforeEach(() => {
    flags.value = false;
    auth.token = 'tok';
    transport.resolveBoardForSerial.mockClear();
    transport.resolveBoardForConfig.mockClear();
    sharedProvider.lastBoardId = undefined;
    sharedProvider.lastClient = null;
    sharedProvider.clientHistory = [];
    capturedControls = null;
    wsClient.created = 0;
    wsClient.disposed = 0;
    wsClient.lastId = 0;
  });

  it('is inert when the flag is off: null boardId, resolve no-ops, no WS client', async () => {
    renderProvider();
    expect(sharedProvider.lastBoardId).toBeNull();
    expect(capturedControls?.enabled).toBe(false);
    expect(wsClient.created).toBe(0);

    await act(async () => {
      const resolved = await capturedControls?.resolveAndBindBoard({
        serial: 'SERIAL-1',
        boardType: 'kilter',
        layoutId: 1,
        sizeId: 10,
        setIds: '1,2',
      });
      expect(resolved).toBeNull();
    });
    expect(transport.resolveBoardForSerial).not.toHaveBeenCalled();
    expect(sharedProvider.lastBoardId).toBeNull();
  });

  it('resolves+binds the board and feeds its id to the shared provider when the flag is on', async () => {
    flags.value = true;
    renderProvider();
    expect(capturedControls?.enabled).toBe(true);
    expect(wsClient.created).toBe(1);

    await act(async () => {
      const resolved = await capturedControls?.resolveAndBindBoard({
        serial: 'SERIAL-1',
        boardType: 'kilter',
        layoutId: 1,
        sizeId: 10,
        setIds: '1,2',
      });
      expect(resolved?.boardId).toBe(42);
    });

    expect(transport.resolveBoardForSerial).toHaveBeenCalledWith({
      serial: 'SERIAL-1',
      boardType: 'kilter',
      layoutId: 1,
      sizeId: 10,
      setIds: '1,2',
    });
    await waitFor(() => {
      expect(sharedProvider.lastBoardId).toBe(42);
    });
  });

  it('does not re-resolve an unchanged serial once bound', async () => {
    flags.value = true;
    renderProvider();

    const args = { serial: 'SERIAL-1', boardType: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,2' };
    await act(async () => {
      await capturedControls?.resolveAndBindBoard(args);
    });
    await act(async () => {
      await capturedControls?.resolveAndBindBoard(args);
    });
    expect(transport.resolveBoardForSerial).toHaveBeenCalledTimes(1);
  });

  it('resolves serial-less boards through the config fallback', async () => {
    flags.value = true;
    renderProvider();

    await act(async () => {
      const resolved = await capturedControls?.resolveAndBindBoard({
        serial: null,
        boardType: 'moonboard',
        layoutId: 2019,
        sizeId: 1,
        setIds: '1',
      });
      expect(resolved?.boardId).toBe(43);
    });

    expect(transport.resolveBoardForSerial).not.toHaveBeenCalled();
    expect(transport.resolveBoardForConfig).toHaveBeenCalledWith({
      boardType: 'moonboard',
      layoutId: 2019,
      sizeId: 1,
      setIds: '1',
    });
    await waitFor(() => {
      expect(sharedProvider.lastBoardId).toBe(43);
    });
  });

  it('replaces the injected presence client when the auth token rebuilds the websocket', async () => {
    flags.value = true;
    const rendered = renderProvider();
    await waitFor(() => {
      expect(sharedProvider.lastClient).not.toBeNull();
    });
    const initialPresenceClient = sharedProvider.lastClient;

    auth.token = 'tok-2';
    rendered.rerender(createElement(WebBoardPresenceProvider, null, createElement(Probe)));

    await waitFor(() => {
      expect(wsClient.created).toBe(2);
      expect(wsClient.disposed).toBe(1);
      expect(sharedProvider.lastClient).not.toBe(initialPresenceClient);
    });
  });
});
