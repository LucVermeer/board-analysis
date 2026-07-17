import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { queueReducer, initialState } from '@boardsesh/queue';
import { createQueueActionsCore, type QueueActionsCoreDeps, type QueueActionsCoreParty } from '../queue-actions-core';
import { getPlaylistPeekQueueItemUuid, createPlaylistSuggestionSource } from '../playlist-suggestions';
import type { Climb, SearchRequestPagination } from '@/app/lib/types';
import type { BoardDetails } from '@/app/lib/types';
import type { ClimbQueueItem, PlaylistSuggestionSource, QueueAction, QueueState } from '../types';

// -----------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------

const mockSearchParams: SearchRequestPagination = {
  page: 1,
  pageSize: 20,
  gradeAccuracy: 1,
  maxGrade: 18,
  minAscents: 1,
  minGrade: 1,
  minRating: 1,
  sortBy: 'quality',
  sortOrder: 'desc',
  name: '',
  onlyBenchmarks: false,
  onlyTallClimbs: false,
  onlyWideClimbs: false,
  onlyWithBetaVideos: false,
  settername: [],
  setternameSuggestion: '',
  holdsFilter: {},
  hideAttempted: false,
  hideCompleted: false,
  showOnlyAttempted: false,
  showOnlyCompleted: false,
  onlyDrafts: false,
  projectsOnly: false,
  boulders: true,
  routes: false,
  zoneBox: null,
  zoneMode: 'allHolds',
};

const testBoardDetails: BoardDetails = {
  board_name: 'kilter',
  layout_id: 1,
  size_id: 1,
  set_ids: '1',
  images_to_holds: {},
  layout_name: 'Original',
  size_name: '12x12',
  size_description: 'Standard',
  set_names: ['Base'],
  edge_left: 0,
  edge_right: 0,
  edge_bottom: 0,
  edge_top: 0,
} as unknown as BoardDetails;

function makeClimb(overrides: Partial<Climb> = {}): Climb {
  return {
    uuid: 'climb-1',
    setter_username: 'setter',
    name: 'Test Climb',
    description: '',
    frames: '',
    angle: 40,
    ascensionist_count: 5,
    difficulty: '7',
    quality_average: '3.5',
    stars: 3,
    difficulty_error: '',
    mirrored: false,
    benchmark_difficulty: null,
    userAscents: 0,
    userAttempts: 0,
    ...overrides,
  };
}

let itemCounter = 0;
function makeQueueItem(overrides: Partial<ClimbQueueItem> = {}): ClimbQueueItem {
  itemCounter += 1;
  return {
    climb: makeClimb(),
    addedBy: 'client-1',
    uuid: `item-${itemCounter}`,
    suggested: false,
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// Test harness
// -----------------------------------------------------------------------

type HarnessOptions = {
  /** When true, mimics the board-route provider: `applyLocal` always
   * dispatches into the real reducer, and party mutations are gated on
   * `hasConnected && !isDisconnected` (QueueContext model). When false,
   * mimics the bridge, where party mutations are attempted unconditionally
   * whenever a party session is active.
   *
   * NOTE: the `applyLocal` no-op below is a MODELING SHORTCUT, not production
   * behavior. Post-W6 the real bridge dispatches optimistically for party too;
   * its `getSnapshot` simply lags via a render-captured ref, so within one
   * synchronous action the factory reads pre-dispatch state either way — the
   * no-op reproduces that same mutation-payload behavior without wiring a live
   * reducer. The optimistic-STATE half of any fix therefore can't be exercised
   * here; it's pinned against the real reducer in queue-bridge-context.test.tsx
   * (MockRootQueueProvider). */
  gateOnConnection: boolean;
  initialQueue?: ClimbQueueItem[];
  initialCurrent?: ClimbQueueItem | null;
  initialPlaylistSource?: PlaylistSuggestionSource | null;
  partyOverrides?: Partial<QueueActionsCoreParty>;
  depsOverrides?: Partial<QueueActionsCoreDeps>;
};

function createHarness(options: HarnessOptions) {
  let state: QueueState = {
    ...initialState(mockSearchParams),
    queue: options.initialQueue ?? [],
    currentClimbQueueItem: options.initialCurrent ?? null,
    playlistSuggestionSource: options.initialPlaylistSource ?? null,
  };

  let isPartyActive = false;
  let hasConnected = true;
  let isDisconnected = false;

  const mutations = {
    addQueueItem: vi.fn().mockResolvedValue(undefined),
    removeQueueItem: vi.fn().mockResolvedValue(undefined),
    setCurrentClimb: vi.fn().mockResolvedValue(undefined),
    mirrorCurrentClimb: vi.fn().mockResolvedValue(undefined),
    setQueue: vi.fn().mockResolvedValue(undefined),
    replaceQueueItem: vi.fn().mockResolvedValue(undefined),
    reportWallDisconnect: vi.fn().mockResolvedValue(undefined),
  };

  const onOperationMetric = {
    success: vi.fn(),
    error: vi.fn(),
  };
  const onSetActiveClimb = vi.fn();
  const onClimbActivated = vi.fn();
  const onQueueItemAdded = vi.fn();
  const onQueueItemRemoved = vi.fn();
  const setPlaylistSuggestionSourceLocal = vi.fn((source: PlaylistSuggestionSource | null) => {
    state = { ...state, playlistSuggestionSource: source };
  });
  const refreshPlaylistSuggestionSourceLocal = vi.fn((source: PlaylistSuggestionSource) => {
    state = queueReducer(state, { type: 'REFRESH_PLAYLIST_SUGGESTION_SOURCE', payload: source });
  });
  const guardMutation = vi.fn(() => false);
  const validateClimbForQueue = vi.fn(() => true);
  const bufferAddition = vi.fn();
  const offlineBufferSpy = { bufferAddition };
  const tryAddToQueue = vi.fn(() => false);
  const trySetCurrentClimb = vi.fn((): 'seeded' | 'failed' | 'not-applicable' => 'not-applicable');

  const applyLocal = vi.fn((action: QueueAction) => {
    // Bridge model: while a party session is active, applyLocal is a no-op —
    // the surface waits for the server echo instead of applying an
    // optimistic update. QueueContext model: always applies.
    if (!options.gateOnConnection && isPartyActive) return;
    state = queueReducer(state, action);
  });

  const party: QueueActionsCoreParty = {
    get isActive() {
      return isPartyActive;
    },
    get hasConnected() {
      return hasConnected;
    },
    get isDisconnected() {
      return isDisconnected;
    },
    get attemptMutation() {
      return options.gateOnConnection ? hasConnected && !isDisconnected : true;
    },
    reuseExistingQueueItemOnSetCurrentClimb: false,
    returnNullOnSetCurrentClimbFailure: false,
    mutations,
    nextCorrelationId: vi.fn(() => (isPartyActive ? `client-1-${itemCounter}` : undefined)),
    ...options.partyOverrides,
  };

  const deps: QueueActionsCoreDeps = {
    getSnapshot: () => ({
      queue: state.queue,
      currentClimbQueueItem: state.currentClimbQueueItem,
      playlistSuggestionSource: state.playlistSuggestionSource,
    }),
    applyLocal,
    setPlaylistSuggestionSourceLocal,
    refreshPlaylistSuggestionSourceLocal,
    buildItem: (climb, suggested) => makeQueueItem({ climb, suggested: !!suggested, addedBy: 'client-1' }),
    guardMutation,
    validateClimbForQueue,
    offlineBuffer: offlineBufferSpy,
    resolveShouldAddToQueueOnActivate: (item) => !!item.suggested,
    resolveNextCurrentForSetQueue: () => state.currentClimbQueueItem,
    buildReplacementItem: (existing, climb, uuid) => {
      if (!existing) return null;
      return { ...existing, climb, uuid };
    },
    discoverNext: vi.fn(() => null),
    discoverPrev: vi.fn(() => null),
    coldStart: { tryAddToQueue, trySetCurrentClimb },
    party,
    hooks: {
      resolveSetActiveClimbSource: (kind) =>
        kind === 'setCurrentClimb' ? 'setCurrentClimb' : 'setCurrentClimbQueueItem',
      onSetActiveClimb,
      onClimbActivated,
      onQueueItemAdded,
      onQueueItemRemoved,
      onOperationMetric,
    },
    errorMessages: {
      addToQueue: 'Failed to add queue item:',
      removeFromQueue: 'Failed to remove queue item:',
      setQueue: 'Failed to set queue:',
      mirrorClimb: 'Failed to mirror climb:',
      replaceQueueItem: 'Failed to replace queue item:',
      setCurrentClimb: {
        reuse: 'Failed to set current climb (reuse):',
        playlist: 'Failed to set current climb (playlist):',
        add: 'Failed to set current climb (add):',
        activate: 'Failed to set current climb (activate):',
      },
      setCurrentClimbQueueItem: 'Failed to set current climb queue item:',
      reportWallDisconnect: 'Failed to report wall disconnect:',
    },
    ...options.depsOverrides,
  };

  const actions = createQueueActionsCore(deps);

  return {
    actions,
    deps,
    mutations,
    onOperationMetric,
    onSetActiveClimb,
    onClimbActivated,
    onQueueItemAdded,
    onQueueItemRemoved,
    setPlaylistSuggestionSourceLocal,
    refreshPlaylistSuggestionSourceLocal,
    guardMutation,
    validateClimbForQueue,
    bufferAddition,
    tryAddToQueue,
    trySetCurrentClimb,
    applyLocal,
    getState: () => state,
    setPartyActive: (value: boolean) => {
      isPartyActive = value;
    },
    setHasConnected: (value: boolean) => {
      hasConnected = value;
    },
    setDisconnected: (value: boolean) => {
      isDisconnected = value;
    },
  };
}

beforeEach(() => {
  itemCounter = 0;
});

// -----------------------------------------------------------------------
// addToQueue
// -----------------------------------------------------------------------

describe('addToQueue', () => {
  it('dispatches DELTA_ADD_QUEUE_ITEM through applyLocal', () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.actions.addToQueue(makeClimb());
    expect(harness.getState().queue).toHaveLength(1);
    expect(harness.getState().queue[0].climb.uuid).toBe('climb-1');
  });

  it('is blocked by guardMutation', () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.guardMutation.mockReturnValue(true);
    harness.actions.addToQueue(makeClimb());
    expect(harness.getState().queue).toHaveLength(0);
    expect(harness.applyLocal).not.toHaveBeenCalled();
  });

  it('is blocked by validateClimbForQueue rejection', () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.validateClimbForQueue.mockReturnValue(false);
    harness.actions.addToQueue(makeClimb());
    expect(harness.getState().queue).toHaveLength(0);
  });

  it('calls onQueueItemAdded with the source and post-add queue length', () => {
    const harness = createHarness({
      gateOnConnection: true,
      initialQueue: [makeQueueItem()],
    });
    harness.actions.addToQueue(makeClimb(), 'search');
    expect(harness.onQueueItemAdded).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'search', queueLengthAfter: 2 }),
    );
  });

  it('buffers offline additions instead of calling the party mutation (isDisconnected && party.isActive)', () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.setPartyActive(true);
    harness.setDisconnected(true);
    harness.actions.addToQueue(makeClimb());
    expect(harness.bufferAddition).toHaveBeenCalledTimes(1);
    expect(harness.mutations.addQueueItem).not.toHaveBeenCalled();
    expect(harness.onOperationMetric.success).toHaveBeenCalledWith('addToQueue', expect.any(Number), 'party-offline');
  });

  it('calls the party mutation when connected (QueueContext model)', () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.setPartyActive(true);
    harness.actions.addToQueue(makeClimb());
    expect(harness.mutations.addQueueItem).toHaveBeenCalledTimes(1);
  });

  it('calls the party mutation unconditionally whenever active, regardless of connection (bridge model)', () => {
    const harness = createHarness({ gateOnConnection: false });
    harness.setPartyActive(true);
    harness.setHasConnected(false);
    harness.actions.addToQueue(makeClimb());
    expect(harness.mutations.addQueueItem).toHaveBeenCalledTimes(1);
  });

  it('does not apply an optimistic local update while a party session is active (bridge model)', () => {
    const harness = createHarness({ gateOnConnection: false });
    harness.setPartyActive(true);
    harness.actions.addToQueue(makeClimb());
    // applyLocal was invoked (unconditionally, matching QueueContext's shape)
    // but the wiring's no-op-while-party guard means state never changes —
    // this is THE documented pre-existing behavior difference this PR
    // preserves rather than fixes.
    expect(harness.applyLocal).toHaveBeenCalled();
    expect(harness.getState().queue).toHaveLength(0);
    expect(harness.mutations.addQueueItem).toHaveBeenCalledTimes(1);
  });

  it('falls through to cold-start seeding when solo and no board is active', () => {
    const harness = createHarness({ gateOnConnection: false });
    harness.tryAddToQueue.mockReturnValue(true);
    harness.actions.addToQueue(makeClimb());
    expect(harness.tryAddToQueue).toHaveBeenCalledTimes(1);
    expect(harness.mutations.addQueueItem).not.toHaveBeenCalled();
  });

  it('does not consult cold-start seeding while a party session is active', () => {
    const harness = createHarness({ gateOnConnection: false });
    harness.setPartyActive(true);
    harness.actions.addToQueue(makeClimb());
    expect(harness.tryAddToQueue).not.toHaveBeenCalled();
  });

  it('tracks a local-mode success metric when solo and cold-start does not apply', () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.actions.addToQueue(makeClimb());
    expect(harness.onOperationMetric.success).toHaveBeenCalledWith('addToQueue', expect.any(Number), 'local');
  });

  it('logs and tracks an error metric when the party mutation rejects', async () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.setPartyActive(true);
    harness.mutations.addQueueItem.mockRejectedValueOnce(new Error('boom'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.actions.addToQueue(makeClimb());
    await vi.waitFor(() => expect(harness.onOperationMetric.error).toHaveBeenCalledWith('addToQueue', 'party'));
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to add queue item:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });
});

// -----------------------------------------------------------------------
// removeFromQueue
// -----------------------------------------------------------------------

describe('removeFromQueue', () => {
  it('dispatches DELTA_REMOVE_QUEUE_ITEM and clears the current climb when it was removed', () => {
    const item = makeQueueItem();
    const harness = createHarness({ gateOnConnection: true, initialQueue: [item], initialCurrent: item });
    harness.actions.removeFromQueue(item);
    expect(harness.getState().queue).toHaveLength(0);
    // With the shared reducer as the applyLocal backend (QueueContext model),
    // removing the current item clears current to null. The bridge's solo
    // wiring layers its own promote-the-new-head override on top of the
    // reducer (see applyLocalSolo in queue-bridge-context.tsx) — that quirk is
    // a wiring concern, not factory semantics.
    expect(harness.getState().currentClimbQueueItem).toBeNull();
  });

  it('fires onQueueItemRemoved', () => {
    const item = makeQueueItem();
    const harness = createHarness({ gateOnConnection: true, initialQueue: [item] });
    harness.actions.removeFromQueue(item);
    expect(harness.onQueueItemRemoved).toHaveBeenCalledWith({ item });
  });

  it('calls the party mutation when attemptMutation is true', () => {
    const item = makeQueueItem();
    const harness = createHarness({ gateOnConnection: true, initialQueue: [item] });
    harness.setPartyActive(true);
    harness.actions.removeFromQueue(item);
    expect(harness.mutations.removeQueueItem).toHaveBeenCalledWith(item.uuid);
  });

  it('is blocked by guardMutation', () => {
    const item = makeQueueItem();
    const harness = createHarness({ gateOnConnection: true, initialQueue: [item] });
    harness.guardMutation.mockReturnValue(true);
    harness.actions.removeFromQueue(item);
    expect(harness.getState().queue).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------
// setCurrentClimb
// -----------------------------------------------------------------------

describe('setCurrentClimb', () => {
  it('inserts the new item immediately after the current item (insertAfterCurrent positioning)', async () => {
    const first = makeQueueItem({ uuid: 'first' });
    const second = makeQueueItem({ uuid: 'second' });
    const harness = createHarness({
      gateOnConnection: true,
      initialQueue: [first, second],
      initialCurrent: first,
    });
    await harness.actions.setCurrentClimb(makeClimb({ uuid: 'new-climb' }), { playlistSuggestionSource: null });
    const queue = harness.getState().queue;
    expect(queue.map((queueItem) => queueItem.uuid)).toEqual(['first', queue[1].uuid, 'second']);
    expect(queue[1].climb.uuid).toBe('new-climb');
    expect(harness.getState().currentClimbQueueItem?.climb.uuid).toBe('new-climb');
  });

  it('appends when there is no current climb', async () => {
    const existing = makeQueueItem({ uuid: 'existing' });
    const harness = createHarness({ gateOnConnection: true, initialQueue: [existing], initialCurrent: null });
    await harness.actions.setCurrentClimb(makeClimb({ uuid: 'new-climb' }), { playlistSuggestionSource: null });
    const queue = harness.getState().queue;
    expect(queue).toHaveLength(2);
    expect(queue[1].climb.uuid).toBe('new-climb');
  });

  it('resolves to null and short-circuits when guardMutation blocks', async () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.guardMutation.mockReturnValue(true);
    const result = await harness.actions.setCurrentClimb(makeClimb(), { playlistSuggestionSource: null });
    expect(result).toBeNull();
    expect(harness.applyLocal).not.toHaveBeenCalled();
  });

  it('resolves to null when validation rejects the climb', async () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.validateClimbForQueue.mockReturnValue(false);
    const result = await harness.actions.setCurrentClimb(makeClimb(), { playlistSuggestionSource: null });
    expect(result).toBeNull();
  });

  it('splits the party-mode add+activate into two sequential awaits, in FIFO order', async () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.setPartyActive(true);
    const callOrder: string[] = [];
    harness.mutations.addQueueItem.mockImplementation(async () => {
      callOrder.push('addQueueItem');
    });
    harness.mutations.setCurrentClimb.mockImplementation(async () => {
      callOrder.push('setCurrentClimb');
    });
    await harness.actions.setCurrentClimb(makeClimb(), { playlistSuggestionSource: null });
    expect(callOrder).toEqual(['addQueueItem', 'setCurrentClimb']);
    expect(harness.mutations.setCurrentClimb).toHaveBeenCalledWith(expect.any(Object), false, expect.any(String));
  });

  it('fires analytics, then applies the optimistic local dispatch, before the party mutation initiates', async () => {
    // Locks the ordering contract this PR relies on when flipping bridge-party
    // `applyLocal` from a no-op to a real dispatch (W6). `setCurrentClimb`
    // fires 'Set Active Climb' analytics first (it doesn't depend on queue
    // state), then applies the optimistic local dispatch, and only then
    // initiates the party mutation — so a consumer reading state from the
    // moment the mutation promise starts always sees the optimistic update
    // already applied, and analytics never observes a torn intermediate state.
    const harness = createHarness({ gateOnConnection: true });
    harness.setPartyActive(true);
    await harness.actions.setCurrentClimb(makeClimb(), { playlistSuggestionSource: null });

    const analyticsOrder = harness.onSetActiveClimb.mock.invocationCallOrder[0];
    const applyLocalOrder = harness.applyLocal.mock.invocationCallOrder[0];
    const mutationOrder = harness.mutations.addQueueItem.mock.invocationCallOrder[0];

    expect(analyticsOrder).toBeLessThan(applyLocalOrder);
    expect(applyLocalOrder).toBeLessThan(mutationOrder);
  });

  it('reuses an existing queue entry matched by climb.uuid instead of adding a duplicate (bridge invariant)', async () => {
    const climb = makeClimb({ uuid: 'shared-climb' });
    const existing = makeQueueItem({ climb, uuid: 'existing-item' });
    const harness = createHarness({
      gateOnConnection: false,
      initialQueue: [existing],
      partyOverrides: { reuseExistingQueueItemOnSetCurrentClimb: true },
    });
    harness.setPartyActive(true);
    const result = await harness.actions.setCurrentClimb(climb, { playlistSuggestionSource: null });
    expect(harness.mutations.addQueueItem).not.toHaveBeenCalled();
    expect(harness.mutations.setCurrentClimb).toHaveBeenCalledWith(existing, false, expect.any(String));
    expect(result).toEqual(existing);
    // The mutation reuses the existing item (not a fresh-uuid clone). The
    // optimistic-state half of this fix — that the pre-dispatch reuse
    // resolution keeps the local queue from gaining a phantom duplicate — is
    // pinned against the real reducer in queue-bridge-context.test.tsx, since
    // this factory harness abstracts `applyLocal` behind the wiring seam.
  });

  it('restores the playlist suggestion source after a setQueue echo clears it (party)', async () => {
    const source: PlaylistSuggestionSource = createPlaylistSuggestionSource({
      playlistUuid: 'pl-echo',
      activatedClimb: makeClimb({ uuid: 'activated' }),
      climbs: [makeClimb({ uuid: 'activated' })],
      boardDetails: testBoardDetails,
    });
    const harness = createHarness({ gateOnConnection: false });
    harness.setPartyActive(true);
    // Simulate the server's own UPDATE_QUEUE echo landing while the setQueue
    // mutation is in flight: it clears the reducer-owned playlistSuggestionSource
    // exactly as the real reducer's UPDATE_QUEUE case does.
    harness.mutations.setQueue.mockImplementationOnce(async () => {
      harness.setPlaylistSuggestionSourceLocal(null);
    });
    await harness.actions.setCurrentClimb(makeClimb(), { playlistSuggestionSource: source });
    expect(harness.mutations.setQueue).toHaveBeenCalledTimes(1);
    // reconcileAfterSetQueue must have re-set the source the echo wiped, so
    // "Next" keeps drawing suggestions from the playlist.
    expect(harness.getState().playlistSuggestionSource).toEqual(source);
  });

  it('does not reuse an existing entry when reuseExistingQueueItemOnSetCurrentClimb is false (QueueContext invariant)', async () => {
    const climb = makeClimb({ uuid: 'shared-climb' });
    const existing = makeQueueItem({ climb, uuid: 'existing-item' });
    const harness = createHarness({ gateOnConnection: true, initialQueue: [existing] });
    harness.setPartyActive(true);
    await harness.actions.setCurrentClimb(climb, { playlistSuggestionSource: null });
    expect(harness.mutations.addQueueItem).toHaveBeenCalledTimes(1);
  });

  it('rolls back the optimistic playlistSuggestionSource on mutation failure (plain add+activate branch)', async () => {
    const previousSource: PlaylistSuggestionSource = createPlaylistSuggestionSource({
      playlistUuid: 'pl-1',
      activatedClimb: makeClimb({ uuid: 'activated' }),
      climbs: [makeClimb({ uuid: 'activated' })],
      boardDetails: testBoardDetails,
    });
    const harness = createHarness({
      gateOnConnection: true,
      initialPlaylistSource: previousSource,
    });
    harness.setPartyActive(true);
    harness.mutations.addQueueItem.mockRejectedValueOnce(new Error('add failed'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // A `null` next playlist source drives the plain add+activate branch
    // (not the playlist-source setQueue branch), so mocking addQueueItem to
    // reject exercises the failure path this test targets.
    const result = await harness.actions.setCurrentClimb(makeClimb(), { playlistSuggestionSource: null });

    // harness default is returnNullOnSetCurrentClimbFailure: false (QueueContext
    // model) — the optimistic item is still returned even though the party
    // mutation failed; only the playlist-source rollback + error tracking fire.
    expect(result).not.toBeNull();
    expect(harness.setPlaylistSuggestionSourceLocal).toHaveBeenLastCalledWith(previousSource);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to set current climb (add):', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('rolls back the optimistic playlistSuggestionSource on mutation failure (playlist-source branch)', async () => {
    const previousSource: PlaylistSuggestionSource = createPlaylistSuggestionSource({
      playlistUuid: 'pl-1',
      activatedClimb: makeClimb({ uuid: 'activated' }),
      climbs: [makeClimb({ uuid: 'activated' })],
      boardDetails: testBoardDetails,
    });
    const nextSource: PlaylistSuggestionSource = createPlaylistSuggestionSource({
      playlistUuid: 'pl-2',
      activatedClimb: makeClimb({ uuid: 'other' }),
      climbs: [makeClimb({ uuid: 'other' })],
      boardDetails: testBoardDetails,
    });
    const harness = createHarness({
      gateOnConnection: true,
      initialPlaylistSource: previousSource,
    });
    harness.setPartyActive(true);
    harness.mutations.setQueue.mockRejectedValueOnce(new Error('queue replace failed'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await harness.actions.setCurrentClimb(makeClimb(), { playlistSuggestionSource: nextSource });

    expect(result).not.toBeNull();
    expect(harness.setPlaylistSuggestionSourceLocal).toHaveBeenLastCalledWith(previousSource);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to set current climb (playlist):', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('returns the optimistic item on mutation failure when returnNullOnSetCurrentClimbFailure is false (QueueContext model)', async () => {
    const harness = createHarness({
      gateOnConnection: true,
      partyOverrides: { returnNullOnSetCurrentClimbFailure: false },
    });
    harness.setPartyActive(true);
    harness.mutations.addQueueItem.mockRejectedValueOnce(new Error('add failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await harness.actions.setCurrentClimb(makeClimb({ uuid: 'x' }), { playlistSuggestionSource: null });
    expect(result).not.toBeNull();
    expect(result?.climb.uuid).toBe('x');
  });

  it('returns null on mutation failure when returnNullOnSetCurrentClimbFailure is true (bridge model)', async () => {
    const harness = createHarness({
      gateOnConnection: false,
      partyOverrides: { returnNullOnSetCurrentClimbFailure: true },
    });
    harness.setPartyActive(true);
    harness.mutations.addQueueItem.mockRejectedValueOnce(new Error('add failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await harness.actions.setCurrentClimb(makeClimb(), { playlistSuggestionSource: null });
    expect(result).toBeNull();
  });

  it('buffers offline instead of sending the mutation when isDisconnected && party.isActive', async () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.setPartyActive(true);
    harness.setDisconnected(true);
    const result = await harness.actions.setCurrentClimb(makeClimb(), { playlistSuggestionSource: null });
    expect(harness.bufferAddition).toHaveBeenCalledTimes(1);
    expect(harness.mutations.addQueueItem).not.toHaveBeenCalled();
    expect(harness.mutations.setCurrentClimb).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
  });

  it('replaces the party queue in one setQueue call when a playlist source is supplied', async () => {
    const current = makeQueueItem({ uuid: 'current' });
    const harness = createHarness({ gateOnConnection: true, initialQueue: [current], initialCurrent: current });
    harness.setPartyActive(true);
    const source = createPlaylistSuggestionSource({
      playlistUuid: 'pl-1',
      activatedClimb: makeClimb({ uuid: 'new-climb' }),
      climbs: [makeClimb({ uuid: 'new-climb' })],
      boardDetails: testBoardDetails,
    });
    await harness.actions.setCurrentClimb(makeClimb({ uuid: 'new-climb' }), { playlistSuggestionSource: source });
    expect(harness.mutations.setQueue).toHaveBeenCalledTimes(1);
    expect(harness.mutations.addQueueItem).not.toHaveBeenCalled();
    expect(harness.mutations.setCurrentClimb).not.toHaveBeenCalled();
  });

  describe('cold-start seeding', () => {
    it('seeds and returns the item when trySetCurrentClimb reports "seeded"', async () => {
      const harness = createHarness({ gateOnConnection: false });
      harness.trySetCurrentClimb.mockReturnValue('seeded');
      const result = await harness.actions.setCurrentClimb(makeClimb({ uuid: 'cold' }), {
        playlistSuggestionSource: null,
      });
      expect(result?.climb.uuid).toBe('cold');
      expect(harness.onOperationMetric.success).toHaveBeenCalled();
    });

    it('rolls back playlistSuggestionSource and returns null when trySetCurrentClimb reports "failed"', async () => {
      const previousSource: PlaylistSuggestionSource = createPlaylistSuggestionSource({
        playlistUuid: 'pl-1',
        activatedClimb: makeClimb({ uuid: 'activated' }),
        climbs: [makeClimb({ uuid: 'activated' })],
        boardDetails: testBoardDetails,
      });
      const harness = createHarness({ gateOnConnection: false, initialPlaylistSource: previousSource });
      harness.trySetCurrentClimb.mockReturnValue('failed');
      const result = await harness.actions.setCurrentClimb(makeClimb({ uuid: 'orphan' }), {
        playlistSuggestionSource: null,
      });
      expect(result).toBeNull();
      expect(harness.setPlaylistSuggestionSourceLocal).toHaveBeenLastCalledWith(previousSource);
    });

    it('falls through to the local branch when trySetCurrentClimb reports "not-applicable"', async () => {
      const harness = createHarness({ gateOnConnection: false });
      harness.trySetCurrentClimb.mockReturnValue('not-applicable');
      const result = await harness.actions.setCurrentClimb(makeClimb({ uuid: 'x' }), {
        playlistSuggestionSource: null,
      });
      expect(result?.climb.uuid).toBe('x');
      expect(harness.getState().currentClimbQueueItem?.climb.uuid).toBe('x');
    });
  });
});

// -----------------------------------------------------------------------
// setCurrentClimbQueueItem
// -----------------------------------------------------------------------

describe('setCurrentClimbQueueItem', () => {
  it('promotes a playlist-peek item to a fresh queue-item uuid on activation', () => {
    const climb = makeClimb({ uuid: 'peeked' });
    const peekItem: ClimbQueueItem = {
      climb,
      uuid: getPlaylistPeekQueueItemUuid(climb.uuid),
      suggested: true,
    };
    const harness = createHarness({ gateOnConnection: true });
    harness.actions.setCurrentClimbQueueItem(peekItem);
    const current = harness.getState().currentClimbQueueItem;
    expect(current).not.toBeNull();
    expect(current?.uuid).not.toBe(peekItem.uuid);
    expect(current?.climb.uuid).toBe('peeked');
    expect(current?.suggested).toBe(true);
  });

  it('leaves a non-peek item untouched (no fresh uuid minted)', () => {
    const item = makeQueueItem({ uuid: 'plain-item' });
    const harness = createHarness({ gateOnConnection: true });
    harness.actions.setCurrentClimbQueueItem(item);
    expect(harness.getState().currentClimbQueueItem?.uuid).toBe('plain-item');
  });

  it('adds the item to the queue only when resolveShouldAddToQueueOnActivate says so', () => {
    const item = makeQueueItem({ uuid: 'not-queued', suggested: false });
    const harness = createHarness({
      gateOnConnection: true,
      depsOverrides: { resolveShouldAddToQueueOnActivate: (queueItem) => !!queueItem.suggested },
    });
    harness.actions.setCurrentClimbQueueItem(item);
    expect(harness.getState().queue).toHaveLength(0);
    expect(harness.getState().currentClimbQueueItem?.uuid).toBe('not-queued');
  });

  it('always adds the item when resolveShouldAddToQueueOnActivate returns true unconditionally (bridge invariant)', () => {
    const item = makeQueueItem({ uuid: 'always-queued', suggested: false });
    const harness = createHarness({
      gateOnConnection: false,
      depsOverrides: { resolveShouldAddToQueueOnActivate: () => true },
    });
    harness.actions.setCurrentClimbQueueItem(item);
    expect(harness.getState().queue.map((queueItem) => queueItem.uuid)).toContain('always-queued');
  });

  it('resolves the Set Active Climb source using the party/solo variant', () => {
    const bridgeHooks: QueueActionsCoreDeps['hooks'] = {
      resolveSetActiveClimbSource: (kind, variant) =>
        kind === 'setCurrentClimb'
          ? 'bridge.setCurrentClimb'
          : variant === 'party'
            ? 'bridge.setCurrentClimbQueueItem.party'
            : 'bridge.setCurrentClimbQueueItem.solo',
      onSetActiveClimb: vi.fn(),
    };
    const harness = createHarness({
      gateOnConnection: false,
      depsOverrides: { hooks: bridgeHooks },
    });
    const onSetActiveClimb = harness.deps.hooks.onSetActiveClimb as ReturnType<typeof vi.fn>;
    harness.actions.setCurrentClimbQueueItem(makeQueueItem());
    expect(onSetActiveClimb).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'bridge.setCurrentClimbQueueItem.solo' }),
    );

    harness.setPartyActive(true);
    harness.actions.setCurrentClimbQueueItem(makeQueueItem());
    expect(onSetActiveClimb).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'bridge.setCurrentClimbQueueItem.party' }),
    );
  });

  it('always re-sends the party mutation even when the item is already current (bridge invariant)', () => {
    const item = makeQueueItem({ uuid: 'already-current' });
    const harness = createHarness({ gateOnConnection: false, initialQueue: [item], initialCurrent: item });
    harness.setPartyActive(true);
    harness.actions.setCurrentClimbQueueItem(item);
    expect(harness.mutations.setCurrentClimb).toHaveBeenCalledTimes(1);
  });
});

// -----------------------------------------------------------------------
// setQueue
// -----------------------------------------------------------------------

describe('setQueue', () => {
  it('uses resolveNextCurrentForSetQueue to pick the next current climb', () => {
    const survivor = makeQueueItem({ uuid: 'survivor' });
    const other = makeQueueItem({ uuid: 'other' });
    const harness = createHarness({
      gateOnConnection: true,
      initialCurrent: survivor,
      depsOverrides: {
        resolveNextCurrentForSetQueue: (newQueue, current) =>
          current && newQueue.some((queueItem) => queueItem.uuid === current.uuid) ? current : (newQueue[0] ?? null),
      },
    });
    harness.actions.setQueue([survivor, other]);
    expect(harness.getState().currentClimbQueueItem?.uuid).toBe('survivor');
  });

  it('falls back to the new queue head when the current climb did not survive', () => {
    const gone = makeQueueItem({ uuid: 'gone' });
    const replacement = makeQueueItem({ uuid: 'replacement' });
    const harness = createHarness({
      gateOnConnection: true,
      initialCurrent: gone,
      depsOverrides: {
        resolveNextCurrentForSetQueue: (newQueue, current) =>
          current && newQueue.some((queueItem) => queueItem.uuid === current.uuid) ? current : (newQueue[0] ?? null),
      },
    });
    harness.actions.setQueue([replacement]);
    expect(harness.getState().currentClimbQueueItem?.uuid).toBe('replacement');
  });

  it('QueueContext model: always keeps the existing current climb regardless of new queue contents', () => {
    const current = makeQueueItem({ uuid: 'stays-current' });
    const harness = createHarness({ gateOnConnection: true, initialCurrent: current });
    harness.actions.setQueue([makeQueueItem({ uuid: 'unrelated' })]);
    expect(harness.getState().currentClimbQueueItem?.uuid).toBe('stays-current');
  });

  it('sends the resolved current climb to the party mutation', () => {
    const survivor = makeQueueItem({ uuid: 'survivor' });
    const harness = createHarness({
      gateOnConnection: true,
      initialCurrent: survivor,
      depsOverrides: { resolveNextCurrentForSetQueue: () => survivor },
    });
    harness.setPartyActive(true);
    harness.actions.setQueue([survivor]);
    expect(harness.mutations.setQueue).toHaveBeenCalledWith([survivor], survivor);
  });
});

// -----------------------------------------------------------------------
// mirrorClimb
// -----------------------------------------------------------------------

describe('mirrorClimb', () => {
  it('no-ops when there is no current climb', () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.actions.mirrorClimb();
    expect(harness.applyLocal).not.toHaveBeenCalled();
  });

  it('toggles mirrored on the current climb', () => {
    const current = makeQueueItem({ climb: makeClimb({ mirrored: false }) });
    const harness = createHarness({ gateOnConnection: true, initialQueue: [current], initialCurrent: current });
    harness.actions.mirrorClimb();
    expect(harness.getState().currentClimbQueueItem?.climb.mirrored).toBe(true);
    expect(harness.getState().queue[0].climb.mirrored).toBe(true);
  });

  it('calls the party mirror mutation when active', () => {
    const current = makeQueueItem({ climb: makeClimb({ mirrored: false }) });
    const harness = createHarness({ gateOnConnection: true, initialCurrent: current });
    harness.setPartyActive(true);
    harness.actions.mirrorClimb();
    expect(harness.mutations.mirrorCurrentClimb).toHaveBeenCalledWith(true);
  });
});

// -----------------------------------------------------------------------
// replaceQueueItem
// -----------------------------------------------------------------------

describe('replaceQueueItem', () => {
  it('aborts when buildReplacementItem returns null (bridge: no existing entry)', () => {
    const harness = createHarness({
      gateOnConnection: false,
      depsOverrides: {
        buildReplacementItem: (existing, climb, uuid) => (existing ? { ...existing, climb, uuid } : null),
      },
    });
    harness.actions.replaceQueueItem('missing-uuid', makeClimb());
    expect(harness.applyLocal).not.toHaveBeenCalled();
  });

  it('replaces the item in place, preserving its uuid', () => {
    const existing = makeQueueItem({ uuid: 'slot-1', climb: makeClimb({ uuid: 'old' }) });
    const harness = createHarness({ gateOnConnection: true, initialQueue: [existing] });
    harness.actions.replaceQueueItem('slot-1', makeClimb({ uuid: 'new' }));
    expect(harness.getState().queue[0].uuid).toBe('slot-1');
    expect(harness.getState().queue[0].climb.uuid).toBe('new');
  });

  it('is blocked by validateClimbForQueue', () => {
    const existing = makeQueueItem({ uuid: 'slot-1' });
    const harness = createHarness({ gateOnConnection: true, initialQueue: [existing] });
    harness.validateClimbForQueue.mockReturnValue(false);
    harness.actions.replaceQueueItem('slot-1', makeClimb());
    expect(harness.applyLocal).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// getNextClimbQueueItem / getPreviousClimbQueueItem
// -----------------------------------------------------------------------

describe('getNextClimbQueueItem / getPreviousClimbQueueItem', () => {
  it('resolves the anchor from options.from when provided', () => {
    const from = makeQueueItem({ uuid: 'from-item' });
    const harness = createHarness({ gateOnConnection: true });
    harness.actions.getNextClimbQueueItem({ from });
    expect(harness.deps.discoverNext).toHaveBeenCalledWith(from);
  });

  it('falls back to the current climb when options.from is omitted', () => {
    const current = makeQueueItem({ uuid: 'current-item' });
    const harness = createHarness({ gateOnConnection: true, initialCurrent: current });
    harness.actions.getNextClimbQueueItem();
    expect(harness.deps.discoverNext).toHaveBeenCalledWith(current);
  });

  it('falls back to the current climb when options.from is explicitly null', () => {
    const current = makeQueueItem({ uuid: 'current-item' });
    const harness = createHarness({ gateOnConnection: true, initialCurrent: current });
    harness.actions.getNextClimbQueueItem({ from: null });
    expect(harness.deps.discoverNext).toHaveBeenCalledWith(current);
  });

  it('delegates getPreviousClimbQueueItem the same way', () => {
    const from = makeQueueItem({ uuid: 'from-item' });
    const harness = createHarness({ gateOnConnection: true });
    harness.actions.getPreviousClimbQueueItem({ from });
    expect(harness.deps.discoverPrev).toHaveBeenCalledWith(from);
  });
});

// -----------------------------------------------------------------------
// previewClimbFromBrowse
// -----------------------------------------------------------------------

describe('previewClimbFromBrowse', () => {
  it('activates the climb with a null playlistSuggestionSource', async () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.actions.previewClimbFromBrowse(makeClimb({ uuid: 'browsed' }));
    // setCurrentClimb runs asynchronously (fire-and-forget `void`); flush it.
    await vi.waitFor(() => expect(harness.getState().currentClimbQueueItem?.climb.uuid).toBe('browsed'));
    expect(harness.getState().playlistSuggestionSource).toBeNull();
  });
});

// -----------------------------------------------------------------------
// setPlaylistSuggestionSource / refreshPlaylistSuggestionSource
// -----------------------------------------------------------------------

describe('setPlaylistSuggestionSource / refreshPlaylistSuggestionSource', () => {
  it('setPlaylistSuggestionSource always applies the new value', () => {
    const source = createPlaylistSuggestionSource({
      playlistUuid: 'pl-1',
      activatedClimb: makeClimb({ uuid: 'a' }),
      climbs: [makeClimb({ uuid: 'a' })],
      boardDetails: testBoardDetails,
    });
    const harness = createHarness({ gateOnConnection: true });
    harness.actions.setPlaylistSuggestionSource(source);
    expect(harness.setPlaylistSuggestionSourceLocal).toHaveBeenCalledWith(source);
  });

  it('refreshPlaylistSuggestionSource delegates to the surface-injected refresher (which does the identity-match check against live state)', () => {
    // The match semantics themselves live in the wiring — the reducer's
    // REFRESH_PLAYLIST_SUGGESTION_SOURCE case for QueueContext, a functional
    // setState updater for the bridge — because both must read live store
    // state, not a latestRef snapshot. The harness's refresher runs the real
    // reducer, so this also pins the end-to-end match/no-match outcome.
    const original = createPlaylistSuggestionSource({
      playlistUuid: 'pl-1',
      activatedClimb: makeClimb({ uuid: 'a' }),
      climbs: [makeClimb({ uuid: 'a' })],
      boardDetails: testBoardDetails,
    });
    const staleRefresh = createPlaylistSuggestionSource({
      playlistUuid: 'pl-1',
      activatedClimb: makeClimb({ uuid: 'b' }),
      climbs: [makeClimb({ uuid: 'b' })],
      boardDetails: testBoardDetails,
    });
    const matchingRefresh = createPlaylistSuggestionSource({
      playlistUuid: 'pl-1',
      activatedClimb: makeClimb({ uuid: 'a' }),
      climbs: [makeClimb({ uuid: 'a' }), makeClimb({ uuid: 'c' })],
      boardDetails: testBoardDetails,
    });
    const harness = createHarness({ gateOnConnection: true, initialPlaylistSource: original });

    harness.actions.refreshPlaylistSuggestionSource(staleRefresh);
    expect(harness.refreshPlaylistSuggestionSourceLocal).toHaveBeenCalledWith(staleRefresh);
    expect(harness.getState().playlistSuggestionSource).toEqual(original);

    harness.actions.refreshPlaylistSuggestionSource(matchingRefresh);
    expect(harness.getState().playlistSuggestionSource).toEqual(matchingRefresh);
  });
});

// -----------------------------------------------------------------------
// reportWallDisconnect
// -----------------------------------------------------------------------

describe('reportWallDisconnect', () => {
  it('is a no-op in solo (no active party session)', async () => {
    const harness = createHarness({ gateOnConnection: true });
    await harness.actions.reportWallDisconnect();
    expect(harness.mutations.reportWallDisconnect).not.toHaveBeenCalled();
  });

  it('is a no-op while the WS is reconnecting (hasConnected false)', async () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.setPartyActive(true);
    harness.setHasConnected(false);
    await harness.actions.reportWallDisconnect();
    expect(harness.mutations.reportWallDisconnect).not.toHaveBeenCalled();
  });

  it('delegates to the party mutation when active and connected', async () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.setPartyActive(true);
    await harness.actions.reportWallDisconnect();
    expect(harness.mutations.reportWallDisconnect).toHaveBeenCalledTimes(1);
  });

  it('catches and logs mutation errors instead of throwing', async () => {
    const harness = createHarness({ gateOnConnection: true });
    harness.setPartyActive(true);
    harness.mutations.reportWallDisconnect.mockRejectedValueOnce(new Error('ws down'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(harness.actions.reportWallDisconnect()).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to report wall disconnect:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });
});
