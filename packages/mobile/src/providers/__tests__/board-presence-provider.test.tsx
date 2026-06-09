// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { createElement, useEffect, type ReactNode } from 'react';
import type { ResolvedBoard } from '@boardsesh/shared-schema';

const flags = vi.hoisted(() => ({ value: false as boolean }));
const transport = vi.hoisted(() => ({
  resolveBoardForSerial: vi.fn(async () => ({ boardId: 42, boardName: 'Garage Wall' }) as unknown as ResolvedBoard),
}));
const sharedProvider = vi.hoisted(() => ({ lastBoardId: undefined as number | null | undefined }));

vi.mock('../feature-flags-provider', () => ({
  useFeatureFlag: () => flags.value,
}));

vi.mock('../../lib/board-presence/board-presence-client', () => ({
  createMobileBoardPresenceClient: () => ({
    resolveBoardForSerial: transport.resolveBoardForSerial,
    subscribeNowPlaying: () => () => {},
    fetchRecentClimbs: async () => [],
    fetchStats: async () => null,
    reportClimb: async () => true,
  }),
}));

vi.mock('../../lib/graphql/ws-client', () => ({ getWsClient: () => ({}) }));

// Capture the boardId handed to the shared provider so we can assert it updates
// after resolve.
vi.mock('@boardsesh/board-presence-react', () => ({
  BoardPresenceProvider: ({ boardId, children }: { boardId: number | null; children: ReactNode }) => {
    sharedProvider.lastBoardId = boardId;
    return createElement('div', { 'data-board-id': String(boardId) }, children);
  },
}));

import { MobileBoardPresenceProvider, useBoardPresenceControls } from '../board-presence-provider';

let capturedControls: ReturnType<typeof useBoardPresenceControls> | null = null;
function Probe() {
  const controls = useBoardPresenceControls();
  useEffect(() => {
    capturedControls = controls;
  }, [controls]);
  return null;
}

function renderProvider() {
  return render(createElement(MobileBoardPresenceProvider, null, createElement(Probe)));
}

describe('MobileBoardPresenceProvider', () => {
  beforeEach(() => {
    flags.value = false;
    transport.resolveBoardForSerial.mockClear();
    sharedProvider.lastBoardId = undefined;
    capturedControls = null;
  });

  it('is inert when the flag is off: null boardId, resolve no-ops', async () => {
    renderProvider();
    expect(sharedProvider.lastBoardId).toBeNull();
    expect(capturedControls?.enabled).toBe(false);

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
});
