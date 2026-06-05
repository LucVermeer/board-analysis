// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react';
import { createElement, useEffect, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClimbQueueItem, PlaylistSuggestionSource } from '@boardsesh/queue';
import type { UserBoard } from '@boardsesh/shared-schema';

const queue = vi.hoisted(() => ({
  sessionId: 'session-1' as string | null,
  driverParticipantId: 'participant-other' as string | null,
  participantId: 'participant-self' as string | null,
  setCurrentClimb: vi.fn(),
  addToQueue: vi.fn(),
  setSessionBoardPath: vi.fn(async () => {}),
}));

const playDrawer = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
}));

const queueSheet = vi.hoisted(() => ({
  props: null as null | {
    onClimbPress: (item: ClimbQueueItem) => void;
    onSuggestionPress: (climb: ClimbQueueItem['climb'], source: PlaylistSuggestionSource) => void;
  },
}));

const activeBoard = vi.hoisted(() => ({
  stored: {
    uuid: 'board-1',
    slug: 'board-1',
    ownerId: 'owner-1',
    boardType: 'kilter',
    layoutId: 1,
    sizeId: 10,
    setIds: '1,2',
    name: 'Test board',
    isPublic: true,
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
  } satisfies UserBoard,
  setActiveBoard: vi.fn(async () => {}),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.default },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, hairlineWidth: 1 },
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) =>
    createElement('button', { onClick: onPress }, children),
}));

vi.mock('react-native-screens', () => ({
  FullWindowOverlay: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));

vi.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid',
}));

vi.mock('../../components/play-drawer', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    PlayDrawer: React.forwardRef((_props: unknown, ref) => {
      React.useImperativeHandle(ref, () => ({
        open: playDrawer.open,
        close: playDrawer.close,
      }));
      return React.createElement('div', { 'data-play-drawer': 'true' });
    }),
  };
});

vi.mock('../../components/play-drawer/QueueSheet', () => ({
  QueueSheet: (props: {
    onClimbPress: (item: ClimbQueueItem) => void;
    onSuggestionPress: (climb: ClimbQueueItem['climb'], source: PlaylistSuggestionSource) => void;
  }) => {
    queueSheet.props = props;
    return createElement('div', { 'data-queue-sheet': 'true' });
  },
}));

vi.mock('../../components/LogAscentSheet', () => ({
  LogAscentSheet: () => createElement('div', { 'data-log-ascent': 'true' }),
}));
vi.mock('../../components/ClimbActionsSheet', () => ({
  ClimbActionsSheet: () => createElement('div', { 'data-climb-actions': 'true' }),
}));
vi.mock('../../components/AddToPlaylistSheet', () => ({
  AddToPlaylistSheet: () => createElement('div', { 'data-add-to-playlist': 'true' }),
}));
vi.mock('../../components/QueueAddedSnackbar', () => ({
  QueueAddedSnackbar: () => createElement('div', { 'data-queue-snackbar': 'true' }),
}));

vi.mock('../queue-provider', () => ({
  useQueue: () => ({
    addToQueue: queue.addToQueue,
    setSessionBoardPath: queue.setSessionBoardPath,
    setCurrentClimb: queue.setCurrentClimb,
    sessionId: queue.sessionId,
    driverParticipantId: queue.driverParticipantId,
    participantId: queue.participantId,
  }),
}));

vi.mock('../queue-snackbar-provider', () => ({
  useQueueSnackbar: () => ({
    visible: false,
    nonce: 0,
    dismissSnackbar: vi.fn(),
  }),
}));

vi.mock('../../lib/graphql/use-active-board', () => ({
  useActiveBoard: () => ({ data: activeBoard.stored }),
  useSetActiveBoard: () => activeBoard.setActiveBoard,
}));

vi.mock('../../lib/graphql/hooks', () => ({
  useToggleFavorite: () => ({ mutate: vi.fn() }),
  useProfile: () => ({ data: null }),
}));

vi.mock('../../lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('../../lib/climb-to-queue-item', () => ({
  climbToQueueItem: (climb: ClimbQueueItem['climb'], options?: { suggested?: boolean }) => ({
    uuid: `queue-${climb.uuid}`,
    climb,
    suggested: options?.suggested ?? false,
  }),
}));

import { DrawerHostProvider, useDrawerHost } from '../drawer-host-provider';

function makeQueueItem(uuid: string, climbUuid = uuid): ClimbQueueItem {
  return {
    uuid,
    climb: {
      uuid: climbUuid,
      name: `Climb ${climbUuid}`,
      frames: 'p1r12',
      setter_username: 'setter',
      angle: 40,
      ascensionist_count: 0,
      difficulty: 'V3',
      quality_average: '3.0',
      stars: 3,
      difficulty_error: '0.3',
      benchmark_difficulty: null,
    },
  };
}

function Probe({ onHost }: { onHost: (host: ReturnType<typeof useDrawerHost>) => void }) {
  const host = useDrawerHost();
  useEffect(() => {
    onHost(host);
  }, [host, onHost]);
  return null;
}

function renderHost(onHost: (host: ReturnType<typeof useDrawerHost>) => void) {
  return render(createElement(DrawerHostProvider, null, createElement(Probe, { onHost })));
}

describe('DrawerHostProvider queue sheet wall-control gating', () => {
  beforeEach(() => {
    queue.sessionId = 'session-1';
    queue.driverParticipantId = 'participant-other';
    queue.participantId = 'participant-self';
    queue.setCurrentClimb.mockClear();
    queue.addToQueue.mockClear();
    queue.setSessionBoardPath.mockClear();
    activeBoard.setActiveBoard.mockClear();
    playDrawer.open.mockClear();
    playDrawer.close.mockClear();
    queueSheet.props = null;
  });

  it('opens a preview without broadcasting when a party non-driver taps a queued climb', async () => {
    const hosts: Array<ReturnType<typeof useDrawerHost>> = [];
    renderHost((host) => hosts.push(host));
    await waitFor(() => expect(hosts.at(-1)).toBeDefined());

    act(() => {
      hosts.at(-1)?.openQueueSheet();
    });
    await waitFor(() => expect(queueSheet.props).not.toBeNull());

    const item = makeQueueItem('queue-1', 'climb-1');
    act(() => {
      queueSheet.props?.onClimbPress(item);
    });

    expect(queue.setCurrentClimb).not.toHaveBeenCalled();
    expect(playDrawer.open).toHaveBeenCalledWith(item.climb, { setAsCurrent: false, previewQueueItem: item });
  });

  it('opens a playlist preview without broadcasting when a party non-driver taps a suggestion', async () => {
    const hosts: Array<ReturnType<typeof useDrawerHost>> = [];
    renderHost((host) => hosts.push(host));
    await waitFor(() => expect(hosts.at(-1)).toBeDefined());

    act(() => {
      hosts.at(-1)?.openQueueSheet();
    });
    await waitFor(() => expect(queueSheet.props).not.toBeNull());

    const sourceItem = makeQueueItem('queue-source', 'climb-source');
    const suggestion = makeQueueItem('queue-suggestion', 'climb-suggestion').climb;
    const playlistSuggestionSource: PlaylistSuggestionSource = {
      playlistUuid: 'playlist-1',
      activatedClimbUuid: sourceItem.climb.uuid,
      boardKey: 'kilter:1:10:1,2',
      climbs: [sourceItem.climb, suggestion],
    };

    act(() => {
      queueSheet.props?.onSuggestionPress(suggestion, playlistSuggestionSource);
    });

    expect(queue.setCurrentClimb).not.toHaveBeenCalled();
    expect(playDrawer.open).toHaveBeenCalledWith(
      suggestion,
      expect.objectContaining({
        setAsCurrent: false,
        previewPlaylistSuggestionSource: playlistSuggestionSource,
        previewQueueItem: expect.objectContaining({
          climb: suggestion,
          suggested: true,
        }),
      }),
    );
  });

  it('broadcasts queued climb selection for the current party driver', async () => {
    queue.driverParticipantId = 'participant-self';
    const hosts: Array<ReturnType<typeof useDrawerHost>> = [];
    renderHost((host) => hosts.push(host));
    await waitFor(() => expect(hosts.at(-1)).toBeDefined());

    act(() => {
      hosts.at(-1)?.openQueueSheet();
    });
    await waitFor(() => expect(queueSheet.props).not.toBeNull());

    const item = makeQueueItem('queue-1', 'climb-1');
    act(() => {
      queueSheet.props?.onClimbPress(item);
    });

    expect(queue.setCurrentClimb).toHaveBeenCalledWith(item);
    expect(playDrawer.open).toHaveBeenCalledWith(item.climb, { setAsCurrent: false, previewQueueItem: item });
  });

  it('broadcasts suggestion selection for the current party driver while anchoring drawer navigation to that item', async () => {
    queue.driverParticipantId = 'participant-self';
    const hosts: Array<ReturnType<typeof useDrawerHost>> = [];
    renderHost((host) => hosts.push(host));
    await waitFor(() => expect(hosts.at(-1)).toBeDefined());

    act(() => {
      hosts.at(-1)?.openQueueSheet();
    });
    await waitFor(() => expect(queueSheet.props).not.toBeNull());

    const sourceItem = makeQueueItem('queue-source', 'climb-source');
    const suggestion = makeQueueItem('queue-suggestion', 'climb-suggestion').climb;
    const playlistSuggestionSource: PlaylistSuggestionSource = {
      playlistUuid: 'playlist-1',
      activatedClimbUuid: sourceItem.climb.uuid,
      boardKey: 'kilter:1:10:1,2',
      climbs: [sourceItem.climb, suggestion],
    };

    act(() => {
      queueSheet.props?.onSuggestionPress(suggestion, playlistSuggestionSource);
    });

    const suggestedItem = {
      uuid: `queue-${suggestion.uuid}`,
      climb: suggestion,
      suggested: true,
    };
    expect(queue.setCurrentClimb).toHaveBeenCalledWith(suggestedItem, {
      playlistSuggestionSource,
    });
    expect(playDrawer.open).toHaveBeenCalledWith(suggestion, {
      setAsCurrent: false,
      previewQueueItem: suggestedItem,
    });
  });
});
