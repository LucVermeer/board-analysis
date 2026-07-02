'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useLayoutEffect,
  useRef,
  useEffect,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  QueueContext,
  QueueActionsContext,
  CurrentClimbContext,
  CurrentClimbUuidContext,
  QueueListContext,
  SearchContext,
  SessionContext,
  type GraphQLQueueContextType,
  type GraphQLQueueActionsType,
} from '../graphql-queue/QueueContext';
import type { CurrentClimbDataType, QueueListDataType, SearchDataType, SessionDataType } from '../graphql-queue/types';
import { usePersistentSession } from '../persistent-session';
import { usePartyProfile } from '../party-manager/party-profile-context';
import { getBaseBoardPath, extractAngleFromPathname, DEFAULT_SEARCH_PARAMS } from '@/app/lib/url-utils';
import type { BoardDetails, Angle, Climb, SearchRequestPagination } from '@/app/lib/types';
import type { ClimbQueueItem, QueueItemUser, PlaylistSuggestionSource, QueueState, QueueAction } from './types';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { canAddClimbToBoard } from '@/app/lib/board-compatibility';
import { getBoardDetailsForPlaylist } from '@/app/lib/board-config-for-playlist';
import { useSnackbar } from '../providers/snackbar-provider';
import { queueAddErrorMessage } from '../board-lock/queue-add-error-messages';
import { QueueBridgeBoardInfoContext, type QueueBridgeBoardInfo } from './queue-bridge-board-info-context';
import { track } from '@/app/lib/analytics';
import { getPlaylistSuggestedClimbs, playlistSuggestionSourceMatches } from './playlist-suggestions';
import { findNextQueueItemWithSuggestions } from '@boardsesh/play-view';
import { queueReducer } from '@boardsesh/queue';
import type {
  ClimbQueue as SharedClimbQueue,
  ClimbQueueItem as SharedClimbQueueItem,
  PlaylistSuggestionSource as SharedPlaylistSuggestionSource,
} from '@boardsesh/queue';
import {
  createQueueActionsCore,
  type QueueActionsCoreColdStart,
  type QueueActionsCoreDeps,
} from './queue-actions-core';

const LiveActivityBridge = dynamic(() => import('@/app/lib/live-activity/live-activity-bridge'), {
  ssr: false,
});

// Bridge web's queue types to the shared `findNextQueueItemWithSuggestions`
// across the documented type seam (see ./types): web's ClimbQueueItem / Climb /
// PlaylistSuggestionSource are structurally compatible with — but not identical
// to — their @boardsesh/queue counterparts (web's Climb is wider). Centralizing
// the `as unknown as` casts here keeps the call site clean and mirrors the same
// boundary casting in ./playlist-suggestions.
function findNextQueueItemAcrossSeam(
  queue: ClimbQueueItem[],
  anchor: ClimbQueueItem | null,
  source: PlaylistSuggestionSource | null,
): ClimbQueueItem | null {
  return findNextQueueItemWithSuggestions(
    queue as unknown as SharedClimbQueue,
    anchor as unknown as SharedClimbQueueItem | null,
    source as unknown as SharedPlaylistSuggestionSource | null,
  ) as unknown as ClimbQueueItem | null;
}

/**
 * Derive BoardDetails + baseBoardPath from a climb's own boardType/layoutId.
 *
 * Used to seed `ps.localBoardDetails` when a user selects a climb from a
 * surface that has no active board context (e.g. a playlist view when the
 * user has never been on a board route). The resulting `baseBoardPath` must
 * match `getBaseBoardPath` output so queue restoration (`use-queue-restoration`)
 * and party-session transfer (`start-sesh-drawer`) keep working.
 */
function deriveSeedStateFromClimb(climb: Climb): { boardDetails: BoardDetails; baseBoardPath: string } | null {
  if (!climb.boardType || climb.layoutId == null) return null;
  const details = getBoardDetailsForPlaylist(climb.boardType, climb.layoutId);
  if (!details) return null;
  const setIds = details.set_ids.join(',');
  const baseBoardPath =
    details.board_name === 'moonboard'
      ? `/moonboard/${details.layout_id}/${setIds}`
      : `/${details.board_name}/${details.layout_id}/${details.size_id}/${setIds}`;
  return { boardDetails: details, baseBoardPath };
}

// -------------------------------------------------------------------
// Board info context (for the root-level bottom bar to know what board is active)
// Extracted to ./queue-bridge-board-info-context so consumers (e.g. board-lock
// hooks) can import it without forming an import cycle through this file.
// -------------------------------------------------------------------

export { useQueueBridgeBoardInfo } from './queue-bridge-board-info-context';

// -------------------------------------------------------------------
// Setter context (for the injector to push board-route context into the bridge)
// -------------------------------------------------------------------

type QueueBridgeSetters = {
  inject: (
    ctx: GraphQLQueueContextType,
    actions: GraphQLQueueActionsType,
    bd: BoardDetails,
    angle: Angle,
    baseBoardPath: string,
    boardUuid: string | null,
  ) => void;
  updateContext: (ctx: GraphQLQueueContextType, actions: GraphQLQueueActionsType) => void;
  clear: () => void;
};

const QueueBridgeSetterContext = createContext<QueueBridgeSetters>({
  inject: () => {},
  updateContext: () => {},
  clear: () => {},
});

// -------------------------------------------------------------------
// usePersistentSessionQueueAdapter — thin adapter over PersistentSession
// Uses latestRef pattern for stable action callbacks (matches GraphQLQueueProvider).
// -------------------------------------------------------------------

function usePersistentSessionQueueAdapter(): {
  context: GraphQLQueueContextType;
  actionsValue: GraphQLQueueActionsType;
  boardDetails: BoardDetails | null;
  angle: Angle;
  hasResolvedAngle: boolean;
  hasActiveQueue: boolean;
  isHydrated: boolean;
  syncFromInjected: (q: ClimbQueueItem[], current: ClimbQueueItem | null, boardPath: string, bd: BoardDetails) => void;
} {
  const ps = usePersistentSession();
  const { showMessage } = useSnackbar();
  const { profile, username, avatarUrl } = usePartyProfile();

  // Mirror GraphQLQueueProvider's currentUserInfo so queue items created off
  // board routes carry the same "who added this" attribution.
  const currentUserInfo: QueueItemUser | undefined = useMemo(() => {
    if (!profile?.id) return undefined;
    return { id: profile.id, username: username || '', avatarUrl };
  }, [profile?.id, username, avatarUrl]);
  // NOTE: the main QueueContext keeps `playlistSuggestionSource` inside the
  // queue reducer (so `INITIAL_QUEUE_DATA` / `UPDATE_QUEUE` clear it for free).
  // The bridge stores it in component state because the bridge doesn't own a
  // reducer — full-queue replacement paths in the bridge (FullSync, peer
  // replace) must remember to call `setPlaylistSuggestionSourceState(null)`
  // explicitly. If you add a new full-queue reset path to the bridge, plumb
  // the clear through here too.
  const [playlistSuggestionSource, setPlaylistSuggestionSourceState] = useState<PlaylistSuggestionSource | null>(null);

  const isParty = !!ps.activeSession;
  const queue = isParty ? ps.queue : ps.localQueue;
  const currentClimbQueueItem = isParty ? ps.currentClimbQueueItem : ps.localCurrentClimbQueueItem;
  const boardDetails = isParty ? ps.activeSession!.boardDetails : ps.localBoardDetails;

  // Read angle live from the URL when the user is on a board route. The
  // session's `parsedParams.angle` is parsed from `Session.boardPath` at
  // activate-time and doesn't follow subsequent URL changes — using it
  // directly was making the angle revert to whatever the session started
  // with whenever `useDrawerUrlSync` rewrote the URL (see queue-control-bar
  // pivot — group-session feedback fix). Off-board surfaces (home, /you,
  // /playlists) get no route angle, so they still fall through to the
  // session angle (party) or the current local climb's angle (solo).
  //
  // `resolvedAngle` is null when nothing in the chain produced a value —
  // distinct from numeric 0 (a real angle on vertical-board configs).
  // `angle` keeps the existing `Angle` (number) contract for consumers
  // that pass it down to components needing a numeric prop; we only
  // surface the null vs 0 distinction through `hasResolvedAngle`, which
  // `useEffectiveAngle` (the log paths) gates on. This keeps the bridge
  // type backward-compatible across the 8+ existing consumers.
  const pathnameForAngle = usePathname();
  const routeAngle = extractAngleFromPathname(pathnameForAngle ?? '');
  const resolvedAngle: Angle | null = isParty
    ? (routeAngle ?? ps.activeSession!.parsedParams.angle)
    : (routeAngle ?? ps.localCurrentClimbQueueItem?.climb?.angle ?? null);
  const hasResolvedAngle = resolvedAngle != null;
  const angle: Angle = resolvedAngle ?? 0;

  const baseBoardPath = useMemo(() => {
    if (isParty && ps.activeSession?.boardPath) {
      return getBaseBoardPath(ps.activeSession.boardPath);
    }
    return ps.localBoardPath ?? '';
  }, [isParty, ps.activeSession?.boardPath, ps.localBoardPath]);

  const hasActiveQueue = (queue.length > 0 || !!currentClimbQueueItem || isParty) && !!boardDetails;

  const parsedParams = useMemo(() => {
    if (!boardDetails) {
      return { board_name: 'kilter' as const, layout_id: 0, size_id: 0, set_ids: [0], angle: 0 };
    }
    return {
      board_name: boardDetails.board_name,
      layout_id: boardDetails.layout_id,
      size_id: boardDetails.size_id,
      set_ids: boardDetails.set_ids,
      angle,
    };
  }, [boardDetails, angle]);

  // --- Ref holding latest values so action callbacks can be stable ---
  const latestRef = useRef({
    queue,
    currentClimbQueueItem,
    boardDetails,
    baseBoardPath,
    ps,
    showMessage,
    currentUserInfo,
    playlistSuggestionSource,
  });
  latestRef.current = {
    queue,
    currentClimbQueueItem,
    boardDetails,
    baseBoardPath,
    ps,
    showMessage,
    currentUserInfo,
    playlistSuggestionSource,
  };

  // Counter for correlation IDs sent with party-mode SET_CURRENT_CLIMB
  // mutations so the persistent session's pending-update tracker can
  // match local optimistic state with server confirmations.
  const correlationCounterRef = useRef(0);

  // Build a queue item from a climb, populating addedBy/addedByUser from the
  // current party profile so off-board mutations (logbook, session view)
  // carry the same attribution as items created from the board route.
  const buildQueueItem = useCallback((climb: Climb): ClimbQueueItem => {
    const { ps, currentUserInfo: user } = latestRef.current;
    return {
      climb,
      addedBy: ps.clientId ?? null,
      addedByUser: user,
      uuid: uuidv4(),
      suggested: false,
    };
  }, []);

  // Validates a climb against the locked board (session) or the current
  // adapter board. Shows a Snackbar error and returns false if not
  // compatible. Message formatting lives in `queue-add-error-messages`
  // so the board-route and root-level entry points speak the same copy.
  const validateClimbForQueue = useCallback((climb: Climb): boolean => {
    const { ps, boardDetails, showMessage } = latestRef.current;
    const target = ps.activeSession?.boardDetails ?? boardDetails;
    if (!target) return true;
    const result = canAddClimbToBoard(climb, target);
    if (result.ok) return true;
    showMessage(queueAddErrorMessage(climb, target, result), 'error');
    return false;
  }, []);

  // --- Single shared queue-actions implementation (see queue-actions-core.ts) ---
  // Every field here is a closure over `latestRef`, so this can be built once
  // (`useMemo(..., [])`) and stay fresh — same pattern as GraphQLQueueProvider.

  // Bridge-solo local store: reduce against the shared `@boardsesh/queue`
  // reducer (the same one QueueContext dispatches to) and persist the result
  // via `ps.setLocalQueueState`. This makes the reducer the single semantic
  // definition of "apply a queue action" even for the bridge's useState-backed
  // local store. Bridge PARTY mode is untouched: `applyLocal` no-ops there
  // (returns before running the reducer), matching the pre-existing behavior
  // of waiting for the server echo instead of applying an optimistic update.
  const applyLocalSolo = useCallback((action: QueueAction) => {
    const { ps, boardDetails, baseBoardPath, queue, currentClimbQueueItem, playlistSuggestionSource } =
      latestRef.current;
    if (ps.activeSession) return;
    if (!boardDetails) return;
    const pseudoState: QueueState = {
      queue,
      currentClimbQueueItem,
      playlistSuggestionSource,
      climbSearchParams: DEFAULT_SEARCH_PARAMS,
      hasDoneFirstFetch: false,
      initialQueueDataReceivedFromPeers: false,
      pendingCurrentClimbUpdates: [],
      lastReceivedSequence: null,
      lastReceivedStateHash: null,
      needsResync: false,
    };
    let nextState = queueReducer(pseudoState, action);
    // Two bridge-only quirks the shared reducer's generic DELTA_ADD_QUEUE_ITEM
    // / DELTA_REMOVE_QUEUE_ITEM cases don't reproduce (they only touch `queue`,
    // matching QueueContext, whose addToQueue/removeFromQueue never set the
    // current climb as a side effect). The bridge's pre-refactor local-state
    // math did, and existing tests pin it: adding to an un-activated queue also
    // activates the new item; removing the current item promotes the new head
    // instead of clearing to null. Behavior-preserving overrides, kept narrow.
    if (action.type === 'DELTA_ADD_QUEUE_ITEM' && !pseudoState.currentClimbQueueItem) {
      nextState = { ...nextState, currentClimbQueueItem: action.payload.item };
    } else if (
      action.type === 'DELTA_REMOVE_QUEUE_ITEM' &&
      pseudoState.currentClimbQueueItem?.uuid === action.payload.uuid
    ) {
      nextState = { ...nextState, currentClimbQueueItem: nextState.queue[0] ?? null };
    }
    // Reducer returned the same reference (a guard no-op, e.g. re-activating
    // the already-current item) — skip the redundant persist call.
    if (nextState === pseudoState) return;
    ps.setLocalQueueState(nextState.queue, nextState.currentClimbQueueItem, baseBoardPath, boardDetails);
  }, []);

  // Cold-start seeding: selecting a climb from a surface with no active board
  // (e.g. a playlist view) auto-activates the climb's own board. Solo-only —
  // party mode always has a board (the session carries one).
  const coldStart: QueueActionsCoreColdStart = useMemo(
    () => ({
      tryAddToQueue: (item) => {
        const { boardDetails, ps } = latestRef.current;
        if (boardDetails) return false;
        const seed = deriveSeedStateFromClimb(item.climb);
        if (!seed) return true;
        ps.setLocalQueueState([item], item, seed.baseBoardPath, seed.boardDetails);
        return true;
      },
      trySetCurrentClimb: (item) => {
        const { boardDetails, ps } = latestRef.current;
        if (boardDetails) return 'not-applicable';
        const seed = deriveSeedStateFromClimb(item.climb);
        if (!seed) return 'failed';
        ps.setLocalQueueState([item], item, seed.baseBoardPath, seed.boardDetails);
        return 'seeded';
      },
    }),
    [],
  );

  const actionsCoreDeps = useMemo<QueueActionsCoreDeps>(
    () => ({
      getSnapshot: () => ({
        queue: latestRef.current.queue,
        currentClimbQueueItem: latestRef.current.currentClimbQueueItem,
        playlistSuggestionSource: latestRef.current.playlistSuggestionSource,
      }),
      applyLocal: applyLocalSolo,
      setPlaylistSuggestionSourceLocal: (source) => setPlaylistSuggestionSourceState(source),
      // Functional updater so the identity-match check reads the latest state
      // (including same-tick updates a `latestRef` snapshot would miss).
      refreshPlaylistSuggestionSourceLocal: (source) =>
        setPlaylistSuggestionSourceState((current) =>
          playlistSuggestionSourceMatches(current, source) ? source : current,
        ),
      // `buildQueueItem` always builds `suggested: false`; override it here so
      // peek-promotion (setCurrentClimbQueueItem) can carry the peek's own flag
      // through, mirroring the pre-refactor `{ ...buildQueueItem(climb), suggested }`.
      buildItem: (climb, suggested) => ({ ...buildQueueItem(climb), suggested: !!suggested }),
      guardMutation: () => false,
      validateClimbForQueue,
      offlineBuffer: null,
      resolveShouldAddToQueueOnActivate: () => true,
      resolveNextCurrentForSetQueue: (newQueue, currentClimbQueueItem) => {
        if (newQueue.length === 0) return null;
        if (currentClimbQueueItem && newQueue.some((queueItem) => queueItem.uuid === currentClimbQueueItem.uuid)) {
          return currentClimbQueueItem;
        }
        return newQueue[0];
      },
      buildReplacementItem: (existing, climb) => (existing ? { ...existing, climb } : null),
      // Bridge-mode nav delegates to the shared @boardsesh/play-view helper
      // (`findNextQueueItemWithSuggestions`) so web's off-board swipe path
      // stays in lockstep with mobile, which already uses that helper. The
      // helper is queue-first and, once the queue is exhausted, re-walks the
      // playlist from the CURRENT climb's position in the source —
      // re-activating a playlist climb starts a fresh pass instead of
      // jumping to the first un-queued climb. The web↔shared type-seam casts
      // live in `findNextQueueItemAcrossSeam`.
      discoverNext: (anchor) => {
        const { queue, playlistSuggestionSource } = latestRef.current;
        return findNextQueueItemAcrossSeam(queue, anchor, playlistSuggestionSource);
      },
      discoverPrev: (anchor) => {
        const { queue } = latestRef.current;
        const idx = queue.findIndex(({ uuid }) => uuid === anchor?.uuid);
        return idx > 0 ? queue[idx - 1] : null;
      },
      coldStart,
      party: {
        get isActive() {
          return !!latestRef.current.ps.activeSession;
        },
        get hasConnected() {
          return latestRef.current.ps.hasConnected;
        },
        isDisconnected: false,
        attemptMutation: true,
        // The bridge (unlike QueueContext) reuses an existing queue entry
        // matched by climb.uuid instead of adding a duplicate — a peer may
        // have already queued this same climb from a logbook/session-view tap.
        reuseExistingQueueItemOnSetCurrentClimb: true,
        returnNullOnSetCurrentClimbFailure: true,
        mutations: {
          addQueueItem: (item, position) => latestRef.current.ps.addQueueItem(item, position),
          removeQueueItem: (uuid) => latestRef.current.ps.removeQueueItem(uuid),
          setCurrentClimb: (item, shouldAddToQueue, correlationId) =>
            latestRef.current.ps.setCurrentClimb(item, shouldAddToQueue, correlationId),
          mirrorCurrentClimb: (mirrored) => latestRef.current.ps.mirrorCurrentClimb(mirrored),
          setQueue: (queue, currentClimbQueueItem) => latestRef.current.ps.setQueue(queue, currentClimbQueueItem),
          replaceQueueItem: (uuid, item) => latestRef.current.ps.replaceQueueItem(uuid, item),
          reportWallDisconnect: () => latestRef.current.ps.reportWallDisconnect(),
        },
        nextCorrelationId: () => {
          const { ps } = latestRef.current;
          return ps.clientId ? `${ps.clientId}-${++correlationCounterRef.current}` : undefined;
        },
      },
      hooks: {
        resolveSetActiveClimbSource: (kind, variant) => {
          if (kind === 'setCurrentClimb') return 'bridge.setCurrentClimb';
          return variant === 'party' ? 'bridge.setCurrentClimbQueueItem.party' : 'bridge.setCurrentClimbQueueItem.solo';
        },
        onSetActiveClimb: (payload) => track('Set Active Climb', payload),
        // onClimbActivated / onQueueItemAdded / onQueueItemRemoved /
        // onOperationMetric are intentionally omitted — the bridge has never
        // tracked session-climbs-attempted, 'Climb Added/Removed to/from
        // Queue', or per-operation timing metrics.
      },
      errorMessages: {
        addToQueue: 'Failed to add queue item:',
        removeFromQueue: 'Failed to remove queue item:',
        setQueue: 'Failed to set queue:',
        mirrorClimb: 'Failed to mirror current climb:',
        replaceQueueItem: 'Failed to replace queue item:',
        setCurrentClimb: {
          reuse: 'Failed to set current climb:',
          playlist: 'Failed to replace queue before setting playlist current:',
          add: 'Failed to add queue item before setting current:',
          activate: 'Failed to set current climb after queue add:',
        },
        setCurrentClimbQueueItem: 'Failed to set current climb queue item:',
        reportWallDisconnect: 'Failed to report wall disconnect:',
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyLocalSolo, coldStart, validateClimbForQueue],
  );
  const actionsCore = useMemo(() => createQueueActionsCore(actionsCoreDeps), [actionsCoreDeps]);
  const {
    addToQueue,
    removeFromQueue,
    setCurrentClimb,
    previewClimbFromBrowse,
    setCurrentClimbQueueItem,
    setPlaylistSuggestionSource,
    refreshPlaylistSuggestionSource,
    replaceQueueItem,
    mirrorClimb,
    getNextClimbQueueItem,
    getPreviousClimbQueueItem,
    setQueue,
    reportWallDisconnect,
  } = actionsCore;

  // No-op functions for fields not used by the bottom bar
  const noop = useCallback(() => {}, []);
  const noopStartSession = useCallback(
    async (_options?: { discoverable?: boolean; name?: string; sessionId?: string }) => '',
    [],
  );
  const noopJoinSession = useCallback(async (_sessionId: string) => {}, []);
  const noopSetClimbSearchParams = useCallback((_params: SearchRequestPagination) => {}, []);
  // Wrap deactivateSession via ref so actionsValue deps are fully stable
  const stableDeactivateSession = useCallback(() => {
    latestRef.current.ps.deactivateSession();
  }, []);

  // Actions value is now stable — all callbacks use latestRef with empty deps
  const actionsValue: GraphQLQueueActionsType = useMemo(
    () => ({
      addToQueue,
      removeFromQueue,
      setCurrentClimb,
      previewClimbFromBrowse,
      setCurrentClimbQueueItem,
      setPlaylistSuggestionSource,
      refreshPlaylistSuggestionSource,
      replaceQueueItem,
      setClimbSearchParams: noopSetClimbSearchParams,
      setCountSearchParams: noopSetClimbSearchParams,
      mirrorClimb,
      fetchMoreClimbs: noop,
      getNextClimbQueueItem,
      getPreviousClimbQueueItem,
      setQueue,
      reportWallDisconnect,
      startSession: noopStartSession,
      joinSession: noopJoinSession,
      endSession: stableDeactivateSession,
      dismissSessionSummary: noop,
      disconnect: stableDeactivateSession,
    }),
    [
      addToQueue,
      removeFromQueue,
      setCurrentClimb,
      previewClimbFromBrowse,
      setCurrentClimbQueueItem,
      setPlaylistSuggestionSource,
      refreshPlaylistSuggestionSource,
      replaceQueueItem,
      noopSetClimbSearchParams,
      mirrorClimb,
      noop,
      getNextClimbQueueItem,
      getPreviousClimbQueueItem,
      setQueue,
      reportWallDisconnect,
      stableDeactivateSession,
      noopStartSession,
      noopJoinSession,
    ],
  );

  const context: GraphQLQueueContextType = useMemo(
    () => ({
      ...actionsValue,
      queue,
      currentClimbQueueItem,
      currentClimb: currentClimbQueueItem?.climb ?? null,
      climbSearchParams: DEFAULT_SEARCH_PARAMS,
      climbSearchResults: null,
      suggestedClimbs: getPlaylistSuggestedClimbs(playlistSuggestionSource, queue),
      playlistSuggestionSource,
      totalSearchResultCount: null,
      hasMoreResults: false,
      isFetchingClimbs: false,
      isFetchingNextPage: false,
      hasDoneFirstFetch: false,
      viewOnlyMode: false,
      connectionState: 'connected',
      canMutate: true,
      parsedParams,
      isSessionActive: isParty && ps.hasConnected,
      isPersistentSessionActive: isParty,
      sessionId: ps.activeSession?.sessionId ?? null,
      sessionSummary: null,
      sessionGoal: ps.session?.goal ?? null,
      users: isParty ? ps.users : [],
      clientId: ps.clientId,
      participantId: ps.participantId,
      isLeader: ps.isLeader,
      // Read the wall-lit indicator from the root persistent-session provider
      // (always mounted), so the off-board persistent bar/drawer lightbulb stays
      // correct even though this bridge has no session-event subscription of its
      // own. Solo (not a party) is never lit.
      wallConfirmed: isParty ? ps.isSessionWallLit : false,
      lastConnectedBoardSerial: isParty ? (ps.session?.lastConnectedBoardSerial ?? null) : null,
      isBackendMode: true,
      hasConnected: ps.hasConnected,
      connectionError: ps.error,
      isDisconnected: false,
    }),
    [
      actionsValue,
      queue,
      currentClimbQueueItem,
      playlistSuggestionSource,
      parsedParams,
      isParty,
      ps.hasConnected,
      ps.activeSession?.sessionId,
      ps.session?.goal,
      ps.session?.lastConnectedBoardSerial,
      ps.users,
      ps.clientId,
      ps.participantId,
      ps.isLeader,
      ps.isSessionWallLit,
      ps.error,
    ],
  );

  // Sync injected queue state to local queue so the adapter has fresh data
  // when the bridge falls back from injected mode. Only effective in local
  // (non-party) mode — setLocalQueueState no-ops when a party session is active.
  const syncFromInjected = useCallback(
    (q: ClimbQueueItem[], current: ClimbQueueItem | null, boardPath: string, bd: BoardDetails) => {
      latestRef.current.ps.setLocalQueueState(q, current, boardPath, bd);
    },
    [],
  );

  return {
    context,
    actionsValue,
    boardDetails,
    angle,
    hasResolvedAngle,
    hasActiveQueue,
    isHydrated: ps.isLocalQueueLoaded,
    syncFromInjected,
  };
}

// -------------------------------------------------------------------
// QueueBridgeProvider — wraps children + bottom bar at root level
// -------------------------------------------------------------------

export function QueueBridgeProvider({ children }: { children: React.ReactNode }) {
  // Whether a board route injector is currently mounted
  const [isInjected, setIsInjected] = useState(false);
  // Board details and angle from the injector (stable across context updates)
  const [injectedBoardDetails, setInjectedBoardDetails] = useState<BoardDetails | null>(null);
  const [injectedAngle, setInjectedAngle] = useState<Angle>(0);
  // Saved-board UUID from a `/b/{slug}` injector (null for non-saved board routes).
  const [injectedBoardUuid, setInjectedBoardUuid] = useState<string | null>(null);

  // Injected values stored in refs to avoid cleanup/setup cycles. The combined
  // context now carries every data field, so the separate `injectedDataRef`
  // that lived here before is gone — `injectedContextRef` is the single
  // source. The two version counters below are still needed (they drive the
  // `effectiveContext` / `effectiveActions` useMemo dep arrays).
  const injectedContextRef = useRef<GraphQLQueueContextType | null>(null);
  const injectedActionsRef = useRef<GraphQLQueueActionsType | null>(null);
  // Board state refs for reading during clear() — can't use state in stable callbacks
  const injectedBoardDetailsRef = useRef<BoardDetails | null>(null);
  const injectedBaseBoardPathRef = useRef<string>('');

  // Separate version counters: actionsVersion only bumps when the injected
  // actions object identity changes (rare — GraphQLQueueProvider uses latestRef
  // pattern). dataVersion bumps on every data change (expected).
  const [_actionsVersion, setActionsVersion] = useState(0);
  const [_dataVersion, setDataVersion] = useState(0);

  const adapter = usePersistentSessionQueueAdapter();

  // Ref for adapter sync function — keeps clear() deps empty
  const adapterSyncRef = useRef(adapter.syncFromInjected);
  adapterSyncRef.current = adapter.syncFromInjected;

  // Version counters are included in deps so useMemo re-reads the injected
  // refs on each updateContext() call. Without them the memo returns its
  // cached value from first injection (initial empty state), so consumers
  // never see queue updates that arrive after the board route mounts.
  const effectiveContext = useMemo(
    () => (isInjected && injectedContextRef.current ? injectedContextRef.current : adapter.context),
    [isInjected, adapter.context, _dataVersion, _actionsVersion],
  );

  const effectiveActions: GraphQLQueueActionsType = useMemo(() => {
    if (!isInjected) return adapter.actionsValue;
    return injectedActionsRef.current!;
  }, [isInjected, adapter.actionsValue, _actionsVersion]);

  const effectiveBoardDetails = isInjected ? injectedBoardDetails : adapter.boardDetails;
  // Only board-route injectors carry a saved-board UUID; the solo/session
  // adapter path has none.
  const effectiveBoardUuid = isInjected ? injectedBoardUuid : null;
  const effectiveAngle = isInjected ? injectedAngle : adapter.angle;
  // The injector path passes a fully-resolved angle from the board route
  // segment, so injected => resolved by definition.
  const effectiveHasResolvedAngle = isInjected ? true : adapter.hasResolvedAngle;
  const effectiveHasActiveQueue = isInjected
    ? true // If injected, a board route is active — always show bar
    : adapter.hasActiveQueue;
  // When a board route injector is active we already know board state
  // synchronously; otherwise mirror the persistent session's restore flag.
  const effectiveIsHydrated = isInjected ? true : adapter.isHydrated;

  const boardInfo = useMemo<QueueBridgeBoardInfo>(
    () => ({
      boardDetails: effectiveBoardDetails,
      boardUuid: effectiveBoardUuid,
      angle: effectiveAngle,
      hasResolvedAngle: effectiveHasResolvedAngle,
      hasActiveQueue: effectiveHasActiveQueue,
      isHydrated: effectiveIsHydrated,
    }),
    [
      effectiveBoardDetails,
      effectiveBoardUuid,
      effectiveAngle,
      effectiveHasResolvedAngle,
      effectiveHasActiveQueue,
      effectiveIsHydrated,
    ],
  );

  const inject = useCallback(
    (
      ctx: GraphQLQueueContextType,
      actions: GraphQLQueueActionsType,
      bd: BoardDetails,
      a: Angle,
      baseBoardPath: string,
      bu: string | null,
    ) => {
      injectedContextRef.current = ctx;
      injectedActionsRef.current = actions;
      injectedBoardDetailsRef.current = bd;
      injectedBaseBoardPathRef.current = baseBoardPath;
      setInjectedBoardDetails(bd);
      setInjectedAngle(a);
      setInjectedBoardUuid(bu);
      setIsInjected(true);
      setActionsVersion((v) => v + 1);
      setDataVersion((v) => v + 1);
    },
    [],
  );

  const updateContext = useCallback((ctx: GraphQLQueueContextType, actions: GraphQLQueueActionsType) => {
    const actionsChanged = actions !== injectedActionsRef.current;
    const dataChanged = ctx !== injectedContextRef.current;
    injectedContextRef.current = ctx;
    injectedActionsRef.current = actions;
    // Bump data version when the combined context reference changes — that's
    // the data signal now that the separate data context is gone.
    if (dataChanged) {
      setDataVersion((v) => v + 1);
    }
    // Only bump actions version when the actions object identity actually changed.
    // GraphQLQueueProvider's actionsValue uses latestRef with empty deps, so this
    // almost never changes — keeping QueueActionsContext stable for consumers.
    if (actionsChanged) {
      setActionsVersion((v) => v + 1);
    }
  }, []);

  const clear = useCallback(() => {
    // Before clearing: sync the last injected queue state to the persistent
    // session's local queue so the adapter has up-to-date data when it takes
    // over. In party mode this is a no-op (setLocalQueueState guards on
    // activeSession).
    const lastCtx = injectedContextRef.current;
    const bd = injectedBoardDetailsRef.current;
    const bbp = injectedBaseBoardPathRef.current;
    if (lastCtx && bd && bbp) {
      adapterSyncRef.current(lastCtx.queue, lastCtx.currentClimbQueueItem, bbp, bd);
    }

    injectedContextRef.current = null;
    injectedActionsRef.current = null;
    injectedBoardDetailsRef.current = null;
    injectedBaseBoardPathRef.current = '';
    setIsInjected(false);
    setInjectedBoardDetails(null);
    setInjectedAngle(0);
    setInjectedBoardUuid(null);
    setActionsVersion((v) => v + 1);
    setDataVersion((v) => v + 1);
  }, []);

  const setters = useMemo<QueueBridgeSetters>(() => ({ inject, updateContext, clear }), [inject, updateContext, clear]);

  // Derive fine-grained context values from the effective context (which is
  // the combined GraphQLQueueContextType — actions + data fields).
  const effectiveCurrentClimb: CurrentClimbDataType = useMemo(
    () => ({
      currentClimbQueueItem: effectiveContext.currentClimbQueueItem,
      currentClimb: effectiveContext.currentClimb,
    }),
    [effectiveContext.currentClimbQueueItem, effectiveContext.currentClimb],
  );
  const effectiveCurrentClimbUuid = effectiveContext.currentClimbQueueItem?.uuid ?? null;

  const effectiveQueueList: QueueListDataType = useMemo(
    () => ({
      queue: effectiveContext.queue,
      suggestedClimbs: effectiveContext.suggestedClimbs,
    }),
    [effectiveContext.queue, effectiveContext.suggestedClimbs],
  );

  const effectiveSearch: SearchDataType = useMemo(
    () => ({
      climbSearchParams: effectiveContext.climbSearchParams,
      climbSearchResults: effectiveContext.climbSearchResults,
      totalSearchResultCount: effectiveContext.totalSearchResultCount,
      hasMoreResults: effectiveContext.hasMoreResults,
      isFetchingClimbs: effectiveContext.isFetchingClimbs,
      isFetchingNextPage: effectiveContext.isFetchingNextPage,
      hasDoneFirstFetch: effectiveContext.hasDoneFirstFetch,
      parsedParams: effectiveContext.parsedParams,
    }),
    [
      effectiveContext.climbSearchParams,
      effectiveContext.climbSearchResults,
      effectiveContext.totalSearchResultCount,
      effectiveContext.hasMoreResults,
      effectiveContext.isFetchingClimbs,
      effectiveContext.isFetchingNextPage,
      effectiveContext.hasDoneFirstFetch,
      effectiveContext.parsedParams,
    ],
  );

  const effectiveSession: SessionDataType = useMemo(
    () => ({
      viewOnlyMode: effectiveContext.viewOnlyMode,
      isSessionActive: effectiveContext.isSessionActive,
      isPersistentSessionActive: effectiveContext.isPersistentSessionActive,
      sessionId: effectiveContext.sessionId,
      sessionSummary: effectiveContext.sessionSummary,
      sessionGoal: effectiveContext.sessionGoal,
      connectionState: effectiveContext.connectionState,
      canMutate: effectiveContext.canMutate,
      isDisconnected: effectiveContext.isDisconnected,
      users: effectiveContext.users ?? [],
      clientId: effectiveContext.clientId ?? null,
      participantId: effectiveContext.participantId ?? null,
      isLeader: effectiveContext.isLeader ?? false,
      wallConfirmed: effectiveContext.wallConfirmed ?? false,
      lastConnectedBoardSerial: effectiveContext.lastConnectedBoardSerial ?? null,
      isBackendMode: effectiveContext.isBackendMode ?? false,
      hasConnected: effectiveContext.hasConnected ?? false,
      connectionError: effectiveContext.connectionError ?? null,
    }),
    [
      effectiveContext.viewOnlyMode,
      effectiveContext.isSessionActive,
      effectiveContext.isPersistentSessionActive,
      effectiveContext.sessionId,
      effectiveContext.sessionSummary,
      effectiveContext.sessionGoal,
      effectiveContext.connectionState,
      effectiveContext.canMutate,
      effectiveContext.isDisconnected,
      effectiveContext.users,
      effectiveContext.clientId,
      effectiveContext.participantId,
      effectiveContext.isLeader,
      effectiveContext.wallConfirmed,
      effectiveContext.lastConnectedBoardSerial,
      effectiveContext.isBackendMode,
      effectiveContext.hasConnected,
      effectiveContext.connectionError,
    ],
  );

  // Renamed locals so jsx-handler-names sees on*-prefixed identifiers being
  // passed to the on*-prefixed props on LiveActivityBridge below.
  const onSetCurrentClimb = effectiveActions.setCurrentClimbQueueItem;
  // Off-board (adapter-mode) sessions don't populate dispatchWidgetNavigation
  // in actionsValue above. The LiveActivityBridge handler degrades to
  // `onSetCurrentClimb` (the adapter's setCurrentClimbQueueItem) which still
  // sends the server mutation via `ps.setCurrentClimb` in party mode, so the
  // server broadcasts CurrentClimbChanged, the WebSocket subscription updates
  // adapter state, and BluetoothAutoSender writes to the wall. Once a board
  // route mounts and injects its own actions, this picks up the real
  // dispatcher from GraphQLQueueProvider and the optimistic update keeps the
  // local reducer ahead of the server echo.
  const onWidgetNavigate = effectiveActions.dispatchWidgetNavigation;

  return (
    <QueueBridgeSetterContext.Provider value={setters}>
      <QueueBridgeBoardInfoContext.Provider value={boardInfo}>
        <QueueActionsContext.Provider value={effectiveActions}>
          <QueueContext.Provider value={effectiveContext}>
            <CurrentClimbContext.Provider value={effectiveCurrentClimb}>
              <CurrentClimbUuidContext.Provider value={effectiveCurrentClimbUuid}>
                <QueueListContext.Provider value={effectiveQueueList}>
                  <SearchContext.Provider value={effectiveSearch}>
                    <SessionContext.Provider value={effectiveSession}>
                      {/* Sync queue state to iOS Live Activity (code-split, no-op on non-iOS).
                          Use effectiveContext so the Live Activity reflects the live party
                          queue while on a board route (injected mode), not the adapter's
                          local view (which is a no-op in party mode). */}
                      <LiveActivityBridge
                        queue={effectiveContext.queue}
                        currentClimbQueueItem={effectiveContext.currentClimbQueueItem}
                        boardDetails={effectiveBoardDetails}
                        sessionId={effectiveContext.sessionId}
                        isSessionActive={effectiveContext.isSessionActive}
                        onSetCurrentClimb={onSetCurrentClimb}
                        onWidgetNavigate={onWidgetNavigate}
                      />
                      {children}
                    </SessionContext.Provider>
                  </SearchContext.Provider>
                </QueueListContext.Provider>
              </CurrentClimbUuidContext.Provider>
            </CurrentClimbContext.Provider>
          </QueueContext.Provider>
        </QueueActionsContext.Provider>
      </QueueBridgeBoardInfoContext.Provider>
    </QueueBridgeSetterContext.Provider>
  );
}

// -------------------------------------------------------------------
// QueueBridgeInjector — placed inside board route layouts
// -------------------------------------------------------------------

type QueueBridgeInjectorProps = {
  boardDetails: BoardDetails;
  angle: Angle;
  /** Saved-board UUID on `/b/{slug}` routes so the root BluetoothProvider can
   * link a paired serial to the saved board. Omitted on standard board routes. */
  boardUuid?: string | null;
};

export function QueueBridgeInjector({ boardDetails, angle, boardUuid = null }: QueueBridgeInjectorProps) {
  const { inject, updateContext, clear } = useContext(QueueBridgeSetterContext);
  const pathname = usePathname();
  const baseBoardPath = useMemo(() => getBaseBoardPath(pathname), [pathname]);

  // Read the board route's split contexts from GraphQLQueueProvider
  const queueContext = useContext(QueueContext);
  const queueActions = useContext(QueueActionsContext);

  // Track whether we've done the initial injection
  const hasInjectedRef = useRef(false);

  // Keep latest base board path in a ref so mount/unmount cleanup can read it
  // without forcing the setup/cleanup effect to rerun on pathname changes.
  const baseBoardPathRef = useRef(baseBoardPath);
  baseBoardPathRef.current = baseBoardPath;

  // Same ref trick for boardUuid so the layout effect doesn't re-run on it.
  const boardUuidRef = useRef(boardUuid);
  boardUuidRef.current = boardUuid;

  // Initial injection: set board details + context on mount
  useLayoutEffect(() => {
    if (queueContext && queueActions) {
      inject(queueContext, queueActions, boardDetails, angle, baseBoardPathRef.current, boardUuidRef.current);
      hasInjectedRef.current = true;
    }
    // Only clean up on unmount (navigating away from board route)
    return () => {
      hasInjectedRef.current = false;
      clear();
    };
    // Only re-run when board details or angle change (navigation between boards)
    // and not when pathname changes during transition off the board route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardDetails, angle, inject, clear]);

  // Update the context ref whenever any of the queue context values change.
  // Also handles deferred injection if contexts were null during the useLayoutEffect.
  useEffect(() => {
    if (!queueContext || !queueActions) return;
    if (hasInjectedRef.current) {
      // updateContext only refreshes the queue context/actions. Board identity
      // (boardDetails/angle/boardUuid) is owned by the layout effect's inject,
      // which re-fires on route change — so a boardUuid change can't (and
      // shouldn't) propagate from here. Read it from the ref on the deferred
      // path below so it isn't a misleading no-op dependency of this effect.
      updateContext(queueContext, queueActions);
    } else {
      inject(queueContext, queueActions, boardDetails, angle, baseBoardPath, boardUuidRef.current);
      hasInjectedRef.current = true;
    }
  }, [queueContext, queueActions, updateContext, inject, boardDetails, angle, baseBoardPath]);

  return null;
}
