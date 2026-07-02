'use client';

import React, { useState, useContext, createContext, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useQueueReducer } from '../queue-control/reducer';
import { useQueueDataFetching } from '../queue-control/hooks/use-queue-data-fetching';
import type { ClimbQueueItem, UserName, QueueItemUser, PlaylistSuggestionSource } from '../queue-control/types';
import { getPlaylistPeekQueueItemUuid, getPlaylistSuggestedClimbs } from '../queue-control/playlist-suggestions';
import { createQueueActionsCore, type QueueActionsCoreDeps } from '../queue-control/queue-actions-core';
import { urlParamsToSearchParams, searchParamsToUrlParams } from '@/app/lib/url-utils';
import type { Climb, SearchRequestPagination } from '@/app/lib/types';
import { usePartyProfile } from '../party-manager/party-profile-context';
import { useWebSocketConnection } from '../connection-manager/websocket-connection-provider';
import { FavoritesProvider } from '../climb-actions/favorites-batch-context';
import { PlaylistsProvider } from '../climb-actions/playlists-batch-context';
import { useClimbActionsData } from '@/app/hooks/use-climb-actions-data';
import { SUGGESTIONS_THRESHOLD } from '../board-page/constants';
import { useSnackbar } from '../providers/snackbar-provider';
import SessionSummaryDialog from '../session-summary/session-summary-dialog';
import { trackQueueOperation, trackQueueOperationError } from '@/app/lib/queue-metrics';

import { useSessionIdManagement } from './hooks/use-session-id-management';
import { useQueueRestoration } from './hooks/use-queue-restoration';
import { useQueueEventSubscription } from './hooks/use-queue-event-subscription';
import { usePendingUpdateCleanup } from './hooks/use-pending-update-cleanup';
import { useMutationGuard } from './hooks/use-mutation-guard';
import { useOfflineQueueBuffer } from './hooks/use-offline-queue-buffer';
import { useOfflineReconciliation } from './hooks/use-offline-reconciliation';
import { emitWallConfirm } from '@boardsesh/play-view';
import { useQueueAddValidator } from '../board-lock/use-queue-add-validator';
import { track } from '@/app/lib/analytics';
import {
  emitSessionEnded,
  incrementSessionClimbsAttempted,
  updateSessionPeerCount,
  getActiveTrackedSessionIds,
} from '@/app/lib/session-lifecycle-tracking';
import type {
  GraphQLQueueContextType,
  GraphQLQueueActionsType,
  GraphQLQueueContextProps,
  CurrentClimbDataType,
  QueueListDataType,
  SearchDataType,
  SessionDataType,
} from './types';
import type { SetActiveClimbSource } from './set-active-climb-event';

// Re-export types so direct importers still work.
export type { GraphQLQueueContextType, GraphQLQueueActionsType } from './types';
export type { CurrentClimbDataType, QueueListDataType, SearchDataType, SessionDataType } from './types';

const createClimbQueueItem = (
  climb: Climb,
  addedBy: UserName,
  addedByUser?: QueueItemUser,
  suggested?: boolean,
): ClimbQueueItem => ({
  climb,
  addedBy,
  addedByUser,
  uuid: uuidv4(),
  suggested: !!suggested,
});

const findUnqueuedNeighborInSearchResults = (
  results: readonly Climb[] | null,
  anchorClimbUuid: string | undefined,
  queue: readonly ClimbQueueItem[],
  direction: 1 | -1,
  buildSuggestedItem: (climb: Climb) => ClimbQueueItem,
): ClimbQueueItem | null => {
  if (!results || results.length === 0) return null;
  const anchorIdx = results.findIndex((climb) => climb.uuid === anchorClimbUuid);
  if (anchorIdx < 0) return null;
  for (let i = anchorIdx + direction; i >= 0 && i < results.length; i += direction) {
    const candidate = results[i];
    if (queue.some((queueItem) => queueItem.climb?.uuid === candidate.uuid)) continue;
    return buildSuggestedItem(candidate);
  }
  return null;
};

// Used by the forward fallback for cross-search-session continuity: anchor
// isn't in current climbSearchResults, surface a suggestion that isn't queued.
const pickUnqueuedSuggestion = (
  suggestedClimbs: readonly Climb[],
  queue: readonly ClimbQueueItem[],
  excludeClimbUuid: string | undefined,
): Climb | undefined =>
  suggestedClimbs.find(
    (climb) => climb.uuid !== excludeClimbUuid && !queue.some((queueItem) => queueItem.climb?.uuid === climb.uuid),
  );

// Factory that captures the per-render `latest` snapshot so the returned
// closure has the right clientId / user / playlist mode without taking those
// as positional args at every call site.
const makeBuildSuggestedQueueItem =
  (latest: {
    clientId: UserName;
    currentUserInfo: QueueItemUser | undefined;
    state: { playlistSuggestionSource: PlaylistSuggestionSource | null };
  }) =>
  (climb: Climb): ClimbQueueItem => {
    const item = createClimbQueueItem(climb, latest.clientId, latest.currentUserInfo, true);
    return latest.state.playlistSuggestionSource ? { ...item, uuid: getPlaylistPeekQueueItemUuid(climb.uuid) } : item;
  };

// Actions context (stable; identity never changes after first render).
export const QueueActionsContext = createContext<GraphQLQueueActionsType | undefined>(undefined);
// Combined context — exists for the test-only `useQueueContext` hook and for
// the queue-bridge plumbing in `queue-bridge-context.tsx` which forwards a
// single combined value into the top-level provider tree. Production consumers
// should prefer the fine-grained hooks (`useCurrentClimb`, `useSessionData`,
// `useQueueList`, `useSearchData`).
export const QueueContext = createContext<GraphQLQueueContextType | undefined>(undefined);

// Fine-grained contexts for targeted subscriptions (reduces re-render cascade)
export const CurrentClimbContext = createContext<CurrentClimbDataType | undefined>(undefined);
// Ultra-narrow context: only the UUID string of the current climb.
// Components that only need to know *which* climb is current (not the full object)
// can subscribe here and avoid re-renders when unrelated fields change.
export const CurrentClimbUuidContext = createContext<string | null>(null);
export const QueueListContext = createContext<QueueListDataType | undefined>(undefined);
export const SearchContext = createContext<SearchDataType | undefined>(undefined);
export const SessionContext = createContext<SessionDataType | undefined>(undefined);

export const GraphQLQueueProvider = ({
  parsedParams,
  boardDetails,
  children,
  baseBoardPath: propsBaseBoardPath,
}: GraphQLQueueContextProps) => {
  const searchParamsHook = useSearchParams();
  const initialSearchParams = urlParamsToSearchParams(searchParamsHook);
  const [state, dispatch] = useQueueReducer(initialSearchParams);
  const [countSearchParams, setCountSearchParams] = useState<SearchRequestPagination>(initialSearchParams);

  const isOffBoardMode = propsBaseBoardPath !== undefined;
  const correlationCounterRef = useRef(0);
  const { showMessage } = useSnackbar();
  const { t } = useTranslation('session');

  const { profile, username, avatarUrl } = usePartyProfile();
  const { state: connectionState } = useWebSocketConnection();

  // --- Session ID management ---
  const {
    sessionId,
    baseBoardPath,
    isPersistentSessionActive,
    persistentSession,
    backendUrl,
    pathname,
    startSession,
    joinSession,
    endSession,
    sessionSummary,
    dismissSessionSummary,
  } = useSessionIdManagement({
    isOffBoardMode,
    propsBaseBoardPath,
    currentQueue: state.queue,
    currentClimbQueueItem: state.currentClimbQueueItem,
  });

  // --- Queue restoration (from in-memory bridge state or party session) ---
  useQueueRestoration({
    isPersistentSessionActive,
    sessionId,
    baseBoardPath,
    dispatch,
    persistentSession,
  });

  // --- Session & connection derived state ---
  const clientId = isPersistentSessionActive ? persistentSession.clientId : null;
  const participantId = isPersistentSessionActive ? persistentSession.participantId : null;
  const isLeader = isPersistentSessionActive ? persistentSession.isLeader : false;
  // Always-live model: there is no driver role. Any participant who changes the
  // climb broadcasts to everyone (the backend has no driver gate), so the web
  // behaves like solo for every member.
  //
  // `wallConfirmed` is the session-scoped "the wall is currently lit" signal
  // that replaces the party lightbulb's old `isDriver` meaning. It turns ON
  // when any member's BLE phone relays a climb (`WallConfirmedClimb`) and OFF
  // when a member's BLE link drops (`WallDisconnected`). It never clears the
  // current climb. Solo doesn't use it — the solo lightbulb reads
  // `isBluetoothConnected` directly. The state lives in the root
  // persistent-session provider (always mounted) so it survives leaving and
  // remounting a board route; we just read it here.
  const wallConfirmed = isPersistentSessionActive ? persistentSession.isSessionWallLit : false;
  // Pull the session's currently-known BLE board serial through so consumers
  // (the drawer's lightbulb fallback) don't have to reach into the
  // persistent-session context directly.
  const lastConnectedBoardSerial = isPersistentSessionActive
    ? (persistentSession.session?.lastConnectedBoardSerial ?? null)
    : null;
  const hasConnected = isPersistentSessionActive ? persistentSession.hasConnected : false;
  const users = useMemo(
    () => (isPersistentSessionActive ? persistentSession.users : []),
    [isPersistentSessionActive, persistentSession.users],
  );
  const connectionError = isPersistentSessionActive ? persistentSession.error : null;
  const isSessionActive = !!sessionId && hasConnected;
  const isSessionReady = isSessionActive && connectionState === 'connected';

  // --- Mutation guard ---
  const { viewOnlyMode, canMutate, guardMutation, isDisconnected } = useMutationGuard({
    sessionId,
    backendUrl,
    hasConnected,
    connectionState,
    isSessionActive,
    isSessionReady,
  });

  // --- Offline queue buffer (tracks additions made while offline in party mode) ---
  const rawOfflineBuffer = useOfflineQueueBuffer();

  // Wrap the buffer to also sync to the persistent session's offlineBufferRef
  // so the event processor can merge during FullSync
  const offlineBuffer = useMemo(
    () => ({
      ...rawOfflineBuffer,
      bufferAddition: (item: ClimbQueueItem) => {
        rawOfflineBuffer.bufferAddition(item);
        if (isPersistentSessionActive) {
          persistentSession.offlineBufferRef.current = rawOfflineBuffer.getBufferedAdditions();
        }
      },
      clearBuffer: () => {
        rawOfflineBuffer.clearBuffer();
        if (isPersistentSessionActive) {
          persistentSession.offlineBufferRef.current = [];
        }
      },
    }),
    [rawOfflineBuffer, isPersistentSessionActive, persistentSession],
  );

  // Warn user when offline buffer is full
  useEffect(() => {
    if (rawOfflineBuffer.isBufferFull) {
      showMessage(t('queueProvider.offlineLimitReached'), 'warning');
    }
  }, [rawOfflineBuffer.isBufferFull, showMessage, t]);

  // --- Offline reconciliation (push buffered additions on reconnect) ---
  useOfflineReconciliation({
    offlineBuffer,
    isDisconnected,
    isPersistentSessionActive,
    hasConnected,
    users,
    lastReceivedSequenceRef: isPersistentSessionActive ? persistentSession.lastReceivedSequenceRef : { current: null },
    persistentSession,
    currentQueue: state.queue,
    currentClimbQueueItem: state.currentClimbQueueItem,
  });

  // --- Queue event subscription ---
  const queueLengthRef = useRef(state.queue.length);
  queueLengthRef.current = state.queue.length;
  useQueueEventSubscription({
    isPersistentSessionActive,
    dispatch,
    persistentSession,
    needsResync: state.needsResync,
    boardLayoutName: boardDetails.layout_name ?? null,
    queueLengthRef,
  });

  // --- Session-event relay ---
  // The BLE-paired phone broadcasts WallConfirmedClimb whenever it relays a
  // climb to the wall. Republish on the local bus so the drawer's lightbulb
  // timer (subscribed locally) dismisses the same way it does in solo,
  // regardless of whether this client did the BLE write or saw a peer do it.
  // The `wallConfirmed` indicator itself is owned by the root persistent-session
  // provider (see `isSessionWallLit`) so it survives route remounts; this relay
  // only drives the local drawer-timer bus.
  useEffect(() => {
    if (!isPersistentSessionActive) return;
    const unsubscribe = persistentSession.subscribeToSessionEvents((event) => {
      if (event.__typename === 'WallConfirmedClimb') {
        emitWallConfirm(event.climbUuid);
      }
    });
    return unsubscribe;
  }, [isPersistentSessionActive, persistentSession.subscribeToSessionEvents]);

  // --- Pending update cleanup ---
  usePendingUpdateCleanup({
    isPersistentSessionActive,
    pendingCurrentClimbUpdates: state.pendingCurrentClimbUpdates,
    dispatch,
    onStalePendingUpdates: persistentSession.triggerResync,
  });

  // --- Session lifecycle: keep peer-count high-water-mark current, emit
  // Session Ended on tab_closed (pagehide). Explicit user_left fires from
  // use-session-id-management's endSession(). ---
  useEffect(() => {
    if (!sessionId) return;
    updateSessionPeerCount(sessionId, users.length);
  }, [sessionId, users.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPageHide = () => {
      for (const activeId of getActiveTrackedSessionIds()) {
        emitSessionEnded(activeId, 'tab_closed');
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);
  // Intentionally NOT emitting Session Ended on connectionState === 'error':
  // graphql-ws errors are routinely transient (network blip, server restart
  // followed by reconnect, suspended tab). Tearing down the session record on
  // every error would mark recoverable hiccups as permanent ends and skip the
  // eventual user_left / tab_closed emission. If we later need a distinct
  // 'server_disconnect' signal we should drive it from confirmed server-side
  // session eviction, not transport state.
  // TODO: idle-timeout 'idle' endedBy reason is not wired — no inactivity
  // timer exists yet that terminates sessions. Add here when one lands.

  // --- Current user info ---
  const currentUserInfo: QueueItemUser | undefined = useMemo(() => {
    if (!profile?.id) return undefined;
    return { id: profile.id, username: username || '', avatarUrl };
  }, [profile?.id, username, avatarUrl]);

  // --- Data fetching ---
  const {
    climbSearchResults,
    suggestedClimbs: searchSuggestedClimbs,
    totalSearchResultCount,
    hasMoreResults,
    isFetchingClimbs,
    isFetchingNextPage,
    fetchMoreClimbs,
    climbUuids,
  } = useQueueDataFetching({
    searchParams: state.climbSearchParams,
    countSearchParams,
    queue: state.queue,
    parsedParams,
    hasDoneFirstFetch: state.hasDoneFirstFetch,
    setHasDoneFirstFetch: () => dispatch({ type: 'SET_FIRST_FETCH', payload: true }),
  });

  const playlistSuggestedClimbs = useMemo(
    () => getPlaylistSuggestedClimbs(state.playlistSuggestionSource, state.queue),
    [state.playlistSuggestionSource, state.queue],
  );

  const suggestedClimbs = state.playlistSuggestionSource ? playlistSuggestedClimbs : searchSuggestedClimbs;

  const { favoritesProviderProps, playlistsProviderProps } = useClimbActionsData({
    boardName: parsedParams.board_name,
    layoutId: boardDetails.layout_id,
    angle: parsedParams.angle,
    climbUuids,
  });

  // --- Proactive suggestion fetching ---
  const proactiveFetchState = useRef({
    lastSuggestedCount: suggestedClimbs.length,
    lastQueueLength: state.queue.length,
    hasFetchedForCurrentLowState: false,
  });

  useEffect(() => {
    const prev = proactiveFetchState.current;
    if (
      suggestedClimbs.length > prev.lastSuggestedCount ||
      state.queue.length < prev.lastQueueLength ||
      !hasMoreResults
    ) {
      prev.hasFetchedForCurrentLowState = false;
    }
    prev.lastSuggestedCount = suggestedClimbs.length;
    prev.lastQueueLength = state.queue.length;

    if (state.playlistSuggestionSource || isFetchingNextPage || !hasMoreResults) return;
    if (
      suggestedClimbs.length < SUGGESTIONS_THRESHOLD &&
      state.hasDoneFirstFetch &&
      !prev.hasFetchedForCurrentLowState
    ) {
      prev.hasFetchedForCurrentLowState = true;
      fetchMoreClimbs();
    }
  }, [
    suggestedClimbs.length,
    state.queue.length,
    hasMoreResults,
    isFetchingNextPage,
    fetchMoreClimbs,
    state.hasDoneFirstFetch,
    state.playlistSuggestionSource,
  ]);

  // --- Queue-add compatibility validator ---
  const validateQueueAdd = useQueueAddValidator();

  // --- Ref holding latest values so action callbacks can be stable ---
  const latestRef = useRef({
    state,
    dispatch,
    isPersistentSessionActive,
    persistentSession,
    clientId,
    currentUserInfo,
    isDisconnected,
    hasConnected,
    offlineBuffer,
    guardMutation,
    isOffBoardMode,
    pathname,
    climbSearchResults,
    suggestedClimbs,
    setCountSearchParams,
    startSession,
    joinSession,
    endSession,
    dismissSessionSummary,
    fetchMoreClimbs,
    validateQueueAdd,
    boardDetails,
    sessionId,
  });
  // Sync ref every render (synchronous — safe for refs)
  latestRef.current = {
    state,
    dispatch,
    isPersistentSessionActive,
    persistentSession,
    clientId,
    currentUserInfo,
    isDisconnected,
    hasConnected,
    offlineBuffer,
    guardMutation,
    isOffBoardMode,
    pathname,
    climbSearchResults,
    suggestedClimbs,
    setCountSearchParams,
    startSession,
    joinSession,
    endSession,
    dismissSessionSummary,
    fetchMoreClimbs,
    validateQueueAdd,
    boardDetails,
    sessionId,
  };

  // --- Stable action callbacks (read from latestRef, never recreated) ---
  const nextCorrelationId = useCallback((): string | undefined => {
    const { clientId } = latestRef.current;
    return clientId ? `${clientId}-${++correlationCounterRef.current}` : undefined;
  }, []);

  // --- Single shared queue-actions implementation (see queue-actions-core.ts) ---
  // Every field here is a closure that reads `latestRef.current` at call
  // time, so this can be constructed once (`useMemo(..., [])`) and still stay
  // fresh — the callbacks it returns are as stable as `nextCorrelationId`
  // above.
  const actionsCoreDeps = useMemo<QueueActionsCoreDeps>(
    () => ({
      getSnapshot: () => ({
        queue: latestRef.current.state.queue,
        currentClimbQueueItem: latestRef.current.state.currentClimbQueueItem,
        playlistSuggestionSource: latestRef.current.state.playlistSuggestionSource,
      }),
      applyLocal: (action) => latestRef.current.dispatch(action),
      setPlaylistSuggestionSourceLocal: (source) =>
        latestRef.current.dispatch({ type: 'SET_PLAYLIST_SUGGESTION_SOURCE', payload: source }),
      // Dispatch the reducer's REFRESH action (it does the identity-match
      // check against live reducer state, not a possibly-stale ref snapshot).
      refreshPlaylistSuggestionSourceLocal: (source) =>
        latestRef.current.dispatch({ type: 'REFRESH_PLAYLIST_SUGGESTION_SOURCE', payload: source }),
      buildItem: (climb, suggested) =>
        createClimbQueueItem(climb, latestRef.current.clientId, latestRef.current.currentUserInfo, suggested),
      guardMutation: () => latestRef.current.guardMutation(),
      validateClimbForQueue: (climb) => latestRef.current.validateQueueAdd(climb),
      offlineBuffer: {
        bufferAddition: (item) => latestRef.current.offlineBuffer.bufferAddition(item),
      },
      // Only suggestion-derived items get auto-queued (mirrors the reducer's
      // own DELTA_UPDATE_CURRENT_CLIMB `shouldAddToQueue` gate).
      resolveShouldAddToQueueOnActivate: (item) => !!item.suggested,
      // QueueContext always keeps the existing current climb on setQueue,
      // even if it fell out of the new queue — callers are expected to keep
      // it consistent themselves (e.g. drag-reorder never drops it).
      resolveNextCurrentForSetQueue: () => latestRef.current.state.currentClimbQueueItem,
      buildReplacementItem: (existing, climb, queueItemUuid) => {
        const base = createClimbQueueItem(climb, latestRef.current.clientId, latestRef.current.currentUserInfo);
        return {
          ...base,
          uuid: queueItemUuid,
          addedBy: existing?.addedBy ?? base.addedBy,
          addedByUser: existing?.addedByUser ?? base.addedByUser,
          tickedBy: existing?.tickedBy,
        };
      },
      discoverNext: (anchor) => {
        const latest = latestRef.current;
        const buildSuggestedQueueItem = makeBuildSuggestedQueueItem(latest);
        const queue = latest.state.queue;
        // With no anchor at all (no current climb, no `from`), Next surfaces
        // queue[0] so the Queue bar's Next button can start a queue the user
        // has built but not yet activated. If the queue is also empty, fall
        // through to suggestedClimbs[0] so a fresh load with populated
        // suggestions still exposes a Next.
        if (anchor == null) {
          if (queue[0]) return queue[0];
          const firstSuggestion = latest.suggestedClimbs[0];
          return firstSuggestion ? buildSuggestedQueueItem(firstSuggestion) : null;
        }
        const anchorClimbUuid = anchor.climb?.uuid;
        const queueItemIndex = queue.findIndex((queueItem) => queueItem.uuid === anchor.uuid);
        if (queueItemIndex >= 0 && queueItemIndex < queue.length - 1) {
          return queue[queueItemIndex + 1];
        }
        // Playlist-suggestion mode: suggestedClimbs is the curated next-up
        // feed (climbs after the activated one, queued items already
        // filtered out). The anchor isn't in this feed, so position-based
        // walking doesn't apply — the next-up is whatever sits at the head.
        if (latest.state.playlistSuggestionSource) {
          const nextClimb = latest.suggestedClimbs[0];
          return nextClimb ? buildSuggestedQueueItem(nextClimb) : null;
        }
        const fromSearch = findUnqueuedNeighborInSearchResults(
          latest.climbSearchResults,
          anchorClimbUuid,
          queue,
          1,
          buildSuggestedQueueItem,
        );
        if (fromSearch) return fromSearch;
        // Cross-search-session continuity: anchor isn't in current
        // climbSearchResults (e.g. queue was built from a previous search).
        // Surface the first unqueued suggestion rather than dead-ending the
        // Next button.
        const fallback = pickUnqueuedSuggestion(latest.suggestedClimbs, queue, anchorClimbUuid);
        return fallback ? buildSuggestedQueueItem(fallback) : null;
      },
      discoverPrev: (anchor) => {
        // No anchor (no current climb, no `from`): backward navigation has
        // no semantic answer — don't fabricate one from suggestions. Forward
        // surfaces queue[0] to start an unactivated queue; backward has no
        // symmetric "start" semantics.
        if (anchor == null) return null;
        const latest = latestRef.current;
        const buildSuggestedQueueItem = makeBuildSuggestedQueueItem(latest);
        const anchorClimbUuid = anchor.climb?.uuid;
        const queue = latest.state.queue;
        const queueItemIndex = queue.findIndex((queueItem) => queueItem.uuid === anchor.uuid);
        if (queueItemIndex > 0) return queue[queueItemIndex - 1];
        // In playlist-suggestion mode there's no "previous playlist climb"
        // once the activated climb is current — the playlist is consumed
        // forward only. Don't fall through to climbSearchResults, that would
        // surface unrelated results.
        if (latest.state.playlistSuggestionSource) return null;
        // Backward navigation is history-oriented: the queue walk above is
        // the history step. When neither queue nor search results yield a
        // backward neighbour, don't fall through to suggestedClimbs — that's
        // discovery (the forward direction).
        return findUnqueuedNeighborInSearchResults(
          latest.climbSearchResults,
          anchorClimbUuid,
          queue,
          -1,
          buildSuggestedQueueItem,
        );
      },
      party: {
        get isActive() {
          return latestRef.current.isPersistentSessionActive;
        },
        get hasConnected() {
          return latestRef.current.hasConnected;
        },
        get isDisconnected() {
          return latestRef.current.isDisconnected;
        },
        get attemptMutation() {
          return latestRef.current.hasConnected && !latestRef.current.isDisconnected;
        },
        reuseExistingQueueItemOnSetCurrentClimb: false,
        returnNullOnSetCurrentClimbFailure: false,
        mutations: {
          addQueueItem: (item, position) => latestRef.current.persistentSession.addQueueItem(item, position),
          removeQueueItem: (uuid) => latestRef.current.persistentSession.removeQueueItem(uuid),
          setCurrentClimb: (item, shouldAddToQueue, correlationId) =>
            latestRef.current.persistentSession.setCurrentClimb(item, shouldAddToQueue, correlationId),
          mirrorCurrentClimb: (mirrored) => latestRef.current.persistentSession.mirrorCurrentClimb(mirrored),
          setQueue: (queue, currentClimbQueueItem) =>
            latestRef.current.persistentSession.setQueue(queue, currentClimbQueueItem),
          replaceQueueItem: (uuid, item) => latestRef.current.persistentSession.replaceQueueItem(uuid, item),
          reportWallDisconnect: () => latestRef.current.persistentSession.reportWallDisconnect(),
        },
        nextCorrelationId: () => nextCorrelationId(),
      },
      hooks: {
        resolveSetActiveClimbSource: (kind) =>
          (kind === 'setCurrentClimb' ? 'setCurrentClimb' : 'setCurrentClimbQueueItem') satisfies SetActiveClimbSource,
        // Central funnel instrumentation — fires from every UI path that
        // activates a new climb (queue list tap, browse preview, playlist
        // activation, SetActiveAction button, lightbulb re-assert).
        // Previously this event only fired from the SetActiveAction button,
        // missing the ~7 other entry points and dropping the "Session
        // Started → Set Active Climb" funnel conversion to ~6%.
        onSetActiveClimb: (payload) => track('Set Active Climb', payload),
        onClimbActivated: () => {
          const { sessionId } = latestRef.current;
          if (sessionId) incrementSessionClimbsAttempted(sessionId);
        },
        onQueueItemAdded: ({ source, queueLengthAfter }) => {
          const latest = latestRef.current;
          const partyMode = latest.isPersistentSessionActive && latest.persistentSession.users.length > 1;
          // `queueLengthAfter` reflects the most recent committed render, so
          // two adds dispatched back-to-back in the same tick will both
          // report the same length. Acceptable for the queue-churn dashboard
          // tile; the dispatched reducer state will still be correct.
          track('Climb Added to Queue', {
            boardLayout: latest.boardDetails?.layout_name ?? null,
            addedFromTab: source,
            currentQueueLength: queueLengthAfter,
            partyMode,
          });
        },
        onQueueItemRemoved: () => {
          const latest = latestRef.current;
          const partyMode = latest.isPersistentSessionActive && latest.persistentSession.users.length > 1;
          track('Climb Removed from Queue', {
            boardLayout: latest.boardDetails?.layout_name ?? null,
            partyMode,
            removedBy: 'self',
          });
        },
        onOperationMetric: {
          success: (operation, durationMs, mode) => trackQueueOperation(operation, durationMs, mode),
          error: (operation, mode) => trackQueueOperationError(operation, mode),
        },
      },
      errorMessages: {
        addToQueue: 'Failed to add queue item:',
        removeFromQueue: 'Failed to remove queue item:',
        setQueue: 'Failed to set queue:',
        mirrorClimb: 'Failed to mirror climb:',
        replaceQueueItem: 'Failed to replace queue item:',
        setCurrentClimb: {
          reuse: 'Failed to set current climb:',
          playlist: 'Failed to set current climb:',
          add: 'Failed to set current climb:',
          activate: 'Failed to set current climb:',
        },
        setCurrentClimbQueueItem: 'Failed to set current climb:',
        reportWallDisconnect: 'Failed to report wall disconnect:',
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const actionsCore = useMemo(() => createQueueActionsCore(actionsCoreDeps), [actionsCoreDeps]);
  const {
    addToQueue,
    removeFromQueue,
    setCurrentClimb,
    previewClimbFromBrowse,
    reportWallDisconnect,
    replaceQueueItem,
    setQueue,
    setCurrentClimbQueueItem,
    setPlaylistSuggestionSource,
    refreshPlaylistSuggestionSource,
    mirrorClimb,
    getNextClimbQueueItem,
    getPreviousClimbQueueItem,
  } = actionsCore;

  const setClimbSearchParams = useCallback((params: SearchRequestPagination) => {
    const latest = latestRef.current;
    latest.dispatch({ type: 'SET_CLIMB_SEARCH_PARAMS', payload: params });
    if (!latest.isOffBoardMode) {
      const urlParams = searchParamsToUrlParams(params);
      const queryString = urlParams.toString();
      const newUrl = queryString ? `${latest.pathname}?${queryString}` : latest.pathname;
      window.history.replaceState(window.history.state, '', newUrl);
    }
  }, []);

  const setCountSearchParamsAction = useCallback((params: SearchRequestPagination) => {
    latestRef.current.setCountSearchParams(params);
  }, []);

  const stableFetchMoreClimbs = useCallback(() => {
    latestRef.current.fetchMoreClimbs();
  }, []);

  // Optimistic dispatch for widget navigation (Next/Previous from Live Activity).
  // The native WebSocket already sent the server mutation, so we only need to
  // update the local reducer state and register the correlationId for echo suppression.
  const dispatchWidgetNavigation = useCallback((item: ClimbQueueItem, correlationId: string) => {
    const latest = latestRef.current;
    latest.dispatch({
      type: 'DELTA_UPDATE_CURRENT_CLIMB',
      payload: { item, shouldAddToQueue: false, correlationId },
    });
  }, []);

  const stableStartSession = useCallback((options?: { discoverable?: boolean; name?: string; sessionId?: string }) => {
    return latestRef.current.startSession(options);
  }, []);

  const stableJoinSession = useCallback((sessionId: string) => {
    return latestRef.current.joinSession(sessionId);
  }, []);

  const stableEndSession = useCallback(() => {
    latestRef.current.endSession();
  }, []);

  const stableDismissSessionSummary = useCallback(() => {
    latestRef.current.dismissSessionSummary();
  }, []);

  const stableDisconnect = useCallback(() => {
    latestRef.current.persistentSession.deactivateSession();
  }, []);

  // --- Actions context value (stable — callbacks never change) ---
  // Every callback in this object is identity-stable: each `useCallback` here
  // uses `[]` (or `[setCurrentClimb]` where `setCurrentClimb` itself uses `[]`),
  // so the references in the closure never change between renders. The dep
  // array can therefore be empty — the memo computes once and the same
  // reference is reused for the lifetime of the provider.
  const actionsValue: GraphQLQueueActionsType = useMemo(
    () => ({
      addToQueue,
      removeFromQueue,
      setCurrentClimb,
      previewClimbFromBrowse,
      setQueue,
      setCurrentClimbQueueItem,
      setPlaylistSuggestionSource,
      refreshPlaylistSuggestionSource,
      replaceQueueItem,
      setClimbSearchParams,
      setCountSearchParams: setCountSearchParamsAction,
      mirrorClimb,
      fetchMoreClimbs: stableFetchMoreClimbs,
      getNextClimbQueueItem,
      getPreviousClimbQueueItem,
      disconnect: stableDisconnect,
      dispatchWidgetNavigation,
      reportWallDisconnect,
      startSession: stableStartSession,
      joinSession: stableJoinSession,
      endSession: stableEndSession,
      dismissSessionSummary: stableDismissSessionSummary,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // --- Combined context value (used by the test-only `useQueueContext` hook
  // and by the queue-bridge plumbing). Composes actionsValue with every data
  // field directly — the data fields no longer live in their own context, so
  // there's no separate `dataValue` memo to compute. Production consumers
  // should reach for the fine-grained hooks below instead. ---
  const contextValue: GraphQLQueueContextType = useMemo(
    () => ({
      ...actionsValue,
      queue: state.queue,
      currentClimbQueueItem: state.currentClimbQueueItem,
      currentClimb: state.currentClimbQueueItem?.climb || null,
      climbSearchParams: state.climbSearchParams,
      climbSearchResults,
      suggestedClimbs,
      playlistSuggestionSource: state.playlistSuggestionSource,
      totalSearchResultCount,
      hasMoreResults,
      isFetchingClimbs,
      isFetchingNextPage,
      hasDoneFirstFetch: state.hasDoneFirstFetch,
      viewOnlyMode,
      parsedParams,
      isSessionActive,
      isPersistentSessionActive,
      sessionId,
      sessionSummary,
      sessionGoal: isPersistentSessionActive ? (persistentSession.session?.goal ?? null) : null,
      connectionState,
      canMutate,
      isDisconnected,
      users,
      clientId,
      participantId,
      isLeader,
      wallConfirmed,
      lastConnectedBoardSerial,
      isBackendMode: !!backendUrl,
      hasConnected,
      connectionError,
    }),
    [
      actionsValue,
      state.queue,
      state.currentClimbQueueItem,
      state.climbSearchParams,
      state.playlistSuggestionSource,
      state.hasDoneFirstFetch,
      climbSearchResults,
      suggestedClimbs,
      totalSearchResultCount,
      hasMoreResults,
      isFetchingClimbs,
      isFetchingNextPage,
      viewOnlyMode,
      parsedParams,
      isSessionActive,
      sessionId,
      sessionSummary,
      isPersistentSessionActive,
      persistentSession.session?.goal,
      connectionState,
      canMutate,
      isDisconnected,
      users,
      clientId,
      participantId,
      isLeader,
      wallConfirmed,
      lastConnectedBoardSerial,
      backendUrl,
      hasConnected,
      connectionError,
    ],
  );

  // --- Fine-grained context values (each only changes when its specific fields change) ---
  const currentClimbUuid = state.currentClimbQueueItem?.uuid ?? null;

  const currentClimbValue: CurrentClimbDataType = useMemo(
    () => ({
      currentClimbQueueItem: state.currentClimbQueueItem,
      currentClimb: state.currentClimbQueueItem?.climb || null,
    }),
    [state.currentClimbQueueItem],
  );

  const queueListValue: QueueListDataType = useMemo(
    () => ({
      queue: state.queue,
      suggestedClimbs,
    }),
    [state.queue, suggestedClimbs],
  );

  const searchValue: SearchDataType = useMemo(
    () => ({
      climbSearchParams: state.climbSearchParams,
      climbSearchResults,
      totalSearchResultCount,
      hasMoreResults,
      isFetchingClimbs,
      isFetchingNextPage,
      hasDoneFirstFetch: state.hasDoneFirstFetch,
      parsedParams,
    }),
    [
      state.climbSearchParams,
      state.hasDoneFirstFetch,
      climbSearchResults,
      totalSearchResultCount,
      hasMoreResults,
      isFetchingClimbs,
      isFetchingNextPage,
      parsedParams,
    ],
  );

  const sessionValue: SessionDataType = useMemo(
    () => ({
      viewOnlyMode,
      isSessionActive,
      isPersistentSessionActive,
      sessionId,
      sessionSummary,
      sessionGoal: isPersistentSessionActive ? (persistentSession.session?.goal ?? null) : null,
      connectionState,
      canMutate,
      isDisconnected,
      users,
      clientId,
      participantId,
      isLeader,
      wallConfirmed,
      lastConnectedBoardSerial,
      isBackendMode: !!backendUrl,
      hasConnected,
      connectionError,
    }),
    [
      viewOnlyMode,
      isSessionActive,
      sessionId,
      sessionSummary,
      isPersistentSessionActive,
      persistentSession.session?.goal,
      connectionState,
      canMutate,
      isDisconnected,
      users,
      clientId,
      participantId,
      isLeader,
      wallConfirmed,
      lastConnectedBoardSerial,
      backendUrl,
      hasConnected,
      connectionError,
    ],
  );

  return (
    <QueueActionsContext.Provider value={actionsValue}>
      <QueueContext.Provider value={contextValue}>
        <CurrentClimbContext.Provider value={currentClimbValue}>
          <CurrentClimbUuidContext.Provider value={currentClimbUuid}>
            <QueueListContext.Provider value={queueListValue}>
              <SearchContext.Provider value={searchValue}>
                <SessionContext.Provider value={sessionValue}>
                  <FavoritesProvider {...favoritesProviderProps}>
                    <PlaylistsProvider {...playlistsProviderProps}>{children}</PlaylistsProvider>
                  </FavoritesProvider>
                  <SessionSummaryDialog summary={sessionSummary} onDismiss={stableDismissSessionSummary} />
                </SessionContext.Provider>
              </SearchContext.Provider>
            </QueueListContext.Provider>
          </CurrentClimbUuidContext.Provider>
        </CurrentClimbContext.Provider>
      </QueueContext.Provider>
    </QueueActionsContext.Provider>
  );
};

// --- Targeted hooks (prefer these for performance) ---

export const useQueueActions = (): GraphQLQueueActionsType => {
  const context = useContext(QueueActionsContext);
  if (!context) {
    throw new Error('useQueueActions must be used within a GraphQLQueueProvider');
  }
  return context;
};

export const useOptionalQueueActions = (): GraphQLQueueActionsType | null => {
  return useContext(QueueActionsContext) ?? null;
};

// --- Backward-compatible hooks (subscribe to everything) ---

export const useGraphQLQueueContext = (): GraphQLQueueContextType => {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error('useGraphQLQueueContext must be used within a GraphQLQueueProvider');
  }
  return context;
};

export const useOptionalQueueContext = (): GraphQLQueueContextType | null => {
  return useContext(QueueContext) ?? null;
};

// Re-export the hook with the standard name for easier migration
export { useGraphQLQueueContext as useQueueContext };

// --- Fine-grained hooks (subscribe to only what you need) ---

export const useCurrentClimb = (): CurrentClimbDataType => {
  const context = useContext(CurrentClimbContext);
  if (!context) {
    throw new Error('useCurrentClimb must be used within a GraphQLQueueProvider');
  }
  return context;
};

export const useOptionalCurrentClimb = (): CurrentClimbDataType | null => {
  return useContext(CurrentClimbContext) ?? null;
};

/** Ultra-narrow hook: returns only the UUID of the current climb.
 *  Use this when you only need to know *which* item is current (e.g. for index lookups)
 *  without subscribing to the full CurrentClimbContext object. */
export const useCurrentClimbUuid = (): string | null => {
  return useContext(CurrentClimbUuidContext);
};

export const useQueueList = (): QueueListDataType => {
  const context = useContext(QueueListContext);
  if (!context) {
    throw new Error('useQueueList must be used within a GraphQLQueueProvider');
  }
  return context;
};

export const useSearchData = (): SearchDataType => {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearchData must be used within a GraphQLQueueProvider');
  }
  return context;
};

export const useSessionData = (): SessionDataType => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionData must be used within a GraphQLQueueProvider');
  }
  return context;
};

export const useOptionalSessionData = (): SessionDataType | null => {
  return useContext(SessionContext) ?? null;
};
