// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { createElement, useEffect, type ReactNode } from 'react';
import type { ClimbQueueItemInput, ResolvedBoard } from '@boardsesh/shared-schema';

const flags = vi.hoisted(() => ({ value: false as boolean }));
const transport = vi.hoisted(() => ({
  resolveBoardForSerial: vi.fn(
    async (_args: unknown) => ({ boardId: 42, boardName: 'Garage Wall' }) as unknown as ResolvedBoard,
  ),
  resolveBoardForConfig: vi.fn(
    async (_args: unknown) => ({ boardId: 43, boardName: 'MoonBoard 40' }) as unknown as ResolvedBoard,
  ),
  reportClimb: vi.fn(async () => true),
}));
const sharedProvider = vi.hoisted(() => ({ lastBoardId: undefined as number | null | undefined }));

vi.mock('../feature-flags-provider', () => ({
  useFeatureFlag: () => flags.value,
}));

vi.mock('../../lib/board-presence/board-presence-client', () => ({
  createMobileBoardPresenceClient: () => ({
    resolveBoardForSerial: transport.resolveBoardForSerial,
    resolveBoardForConfig: transport.resolveBoardForConfig,
    subscribeNowPlaying: () => () => {},
    fetchRecentClimbs: async () => [],
    fetchStats: async () => null,
    reportClimb: transport.reportClimb,
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
    transport.resolveBoardForSerial.mockResolvedValue({
      boardId: 42,
      boardName: 'Garage Wall',
    } as unknown as ResolvedBoard);
    transport.resolveBoardForConfig.mockClear();
    transport.resolveBoardForConfig.mockResolvedValue({
      boardId: 43,
      boardName: 'MoonBoard 40',
    } as unknown as ResolvedBoard);
    transport.reportClimb.mockClear();
    transport.reportClimb.mockResolvedValue(true);
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

  it('resolves+binds by config when no serial is available', async () => {
    flags.value = true;
    renderProvider();

    await act(async () => {
      const resolved = await capturedControls?.resolveAndBindBoardByConfig({
        boardType: 'moonboard',
        layoutId: 1,
        sizeId: 1,
        setIds: '2019',
      });
      expect(resolved?.boardId).toBe(43);
    });

    expect(transport.resolveBoardForConfig).toHaveBeenCalledWith({
      boardType: 'moonboard',
      layoutId: 1,
      sizeId: 1,
      setIds: '2019',
    });
    await waitFor(() => {
      expect(sharedProvider.lastBoardId).toBe(43);
    });
  });

  it('does not re-resolve an unchanged config once bound', async () => {
    flags.value = true;
    renderProvider();

    const args = {
      boardType: 'moonboard',
      layoutId: 1,
      sizeId: 1,
      setIds: '2019',
    };
    await act(async () => {
      await capturedControls?.resolveAndBindBoardByConfig(args);
    });
    await waitFor(() => {
      expect(sharedProvider.lastBoardId).toBe(43);
    });

    await act(async () => {
      const resolved = await capturedControls?.resolveAndBindBoardByConfig(args);
      expect(resolved).toBeNull();
    });
    expect(transport.resolveBoardForConfig).toHaveBeenCalledTimes(1);
  });

  it('ignores stale config resolve results after a newer selected config resolves', async () => {
    flags.value = true;
    let resolveFirst: ((value: ResolvedBoard) => void) | null = null;
    let resolveSecond: ((value: ResolvedBoard) => void) | null = null;
    transport.resolveBoardForConfig.mockImplementation(
      (args: unknown) =>
        new Promise<ResolvedBoard>((resolve) => {
          const boardType = (args as { boardType: string }).boardType;
          if (boardType === 'moonboard') {
            resolveFirst = resolve;
            return;
          }
          resolveSecond = resolve;
        }),
    );
    renderProvider();

    let firstPromise: Promise<ResolvedBoard | null> | undefined;
    let secondPromise: Promise<ResolvedBoard | null> | undefined;
    act(() => {
      firstPromise = capturedControls?.resolveAndBindBoardByConfig({
        boardType: 'moonboard',
        layoutId: 1,
        sizeId: 1,
        setIds: '2019',
      });
      secondPromise = capturedControls?.resolveAndBindBoardByConfig({
        boardType: 'kilter',
        layoutId: 1,
        sizeId: 10,
        setIds: '1,2',
      });
    });

    await act(async () => {
      resolveSecond?.({ boardId: 44, boardName: 'Kilter' } as unknown as ResolvedBoard);
      await secondPromise;
    });
    await waitFor(() => {
      expect(sharedProvider.lastBoardId).toBe(44);
    });

    let firstResult: ResolvedBoard | null | undefined;
    await act(async () => {
      resolveFirst?.({ boardId: 43, boardName: 'MoonBoard 40' } as unknown as ResolvedBoard);
      firstResult = await firstPromise;
    });

    expect(firstResult).toBeNull();
    expect(sharedProvider.lastBoardId).toBe(44);
  });

  it('returns null instead of leaking a rejected serial resolve', async () => {
    flags.value = true;
    transport.resolveBoardForSerial.mockRejectedValue(new Error('backend disabled'));
    renderProvider();

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

    expect(sharedProvider.lastBoardId).toBeNull();
  });

  it('reports directly to a resolved board id', async () => {
    flags.value = true;
    renderProvider();

    await act(async () => {
      const accepted = await capturedControls?.reportClimbForBoard(
        42,
        { uuid: 'queue-1', climb: { uuid: 'climb-1' } } as ClimbQueueItemInput,
        40,
      );
      expect(accepted).toBe(true);
    });

    expect(transport.reportClimb).toHaveBeenCalledWith(42, { uuid: 'queue-1', climb: { uuid: 'climb-1' } }, 40);
  });
});
