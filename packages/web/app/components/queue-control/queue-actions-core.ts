/**
 * Single implementation of the queue-action surface (add/remove/set-current/
 * navigate/mirror/replace/etc.), shared by the board-route provider
 * (`graphql-queue/QueueContext.tsx`) and the off-board bridge
 * (`queue-control/queue-bridge-context.tsx`). Those two files independently
 * reimplemented this surface and drifted apart; this factory is now the one
 * place the semantics live. Both wiring sites inject their own state access,
 * party-mutation plumbing, and analytics hooks — see `QueueActionsCoreDeps`.
 *
 * Every dependency here exists because the two call sites genuinely differ,
 * not for abstraction's own sake:
 *   - `applyLocal` differs in mechanism, not in whether it applies: both
 *     surfaces dispatch straight to the single root queue reducer now (W6);
 *     QueueContext dispatches unconditionally, the bridge additionally
 *     layers two solo-only UX quirks on top (see the doc on `applyLocal` in
 *     `queue-bridge-context.tsx`). Party mode used to no-op `applyLocal`
 *     entirely and wait for the server echo instead of an optimistic
 *     update — that's gone; off-board party mutations are optimistic now
 *     too, matching board-route behavior (see docs/websocket-implementation.md).
 *   - `party.attemptMutation` differs in *when* a party mutation fires:
 *     QueueContext gates on `hasConnected && !isDisconnected` (buffering adds
 *     while offline); the bridge has no such gate and always attempts the
 *     mutation whenever a party session is active.
 *   - `discoverNext`/`discoverPrev` differ in strategy: QueueContext walks
 *     `climbSearchResults` as a discovery fallback; the bridge delegates to
 *     the shared `findNextQueueItemWithSuggestions` (mobile parity).
 *   - `errorMessages` and `resolveSetActiveClimbSource` preserve each
 *     surface's exact (test-pinned) console/analytics text.
 */

import type { Climb } from '@/app/lib/types';
import type {
  AddToQueueSource,
  ClimbQueueItem,
  PlaylistSuggestionSource,
  QueueAction,
  QueueActionsType,
  SetCurrentClimbOptions,
} from './types';
import {
  insertQueueItemAfterCurrent,
  isPlaylistPeekQueueItemUuid,
  pruneSuggestedQueueItemsAfterCurrent,
} from './playlist-suggestions';
import { resolveQueueOperationMode, type QueueOperation, type QueueOperationMode } from '@/app/lib/queue-metrics';
import type { SetActiveClimbSource } from '../graphql-queue/set-active-climb-event';
import { dispatchOpenPlayDrawer } from './play-drawer-event';

export type QueueActionsCoreSnapshot = {
  queue: ClimbQueueItem[];
  currentClimbQueueItem: ClimbQueueItem | null;
  playlistSuggestionSource: PlaylistSuggestionSource | null;
};

export type PartyMutations = {
  addQueueItem: (item: ClimbQueueItem, position?: number) => Promise<void>;
  removeQueueItem: (uuid: string) => Promise<void>;
  setCurrentClimb: (item: ClimbQueueItem, shouldAddToQueue?: boolean, correlationId?: string) => Promise<void>;
  mirrorCurrentClimb: (mirrored: boolean) => Promise<void>;
  setQueue: (queue: ClimbQueueItem[], currentClimbQueueItem?: ClimbQueueItem | null) => Promise<void>;
  replaceQueueItem: (uuid: string, item: ClimbQueueItem) => Promise<void>;
  reportWallDisconnect: () => Promise<void>;
};

export type QueueActionsCoreParty = {
  /** A party session is active right now (QueueContext: isPersistentSessionActive; bridge: !!ps.activeSession). */
  isActive: boolean;
  /** The connection has been established at least once. Real value in both
   * surfaces — used by the (identical) reportWallDisconnect gate. */
  hasConnected: boolean;
  /** Previously connected but currently offline. Only meaningful for
   * QueueContext's offline-buffering path — the bridge always passes `false`
   * (it has no offline-buffering behavior to preserve). */
  isDisconnected: boolean;
  /** Whether a party mutation should be attempted right now, recomputed by
   * the wiring on every call. QueueContext: `hasConnected && !isDisconnected`
   * (so it buffers/no-ops instead of sending while offline). Bridge: always
   * `true` (it sends whenever a party session is active, with no connection
   * gate — pre-existing behavior, not something this refactor should add). */
  attemptMutation: boolean;
  /** setCurrentClimb, party mode only: reuse an existing queue entry matched
   * by `climb.uuid` instead of adding a duplicate. Bridge-only behavior —
   * QueueContext has never done this. */
  reuseExistingQueueItemOnSetCurrentClimb: boolean;
  /** setCurrentClimb: what to return when the party mutation fails.
   * QueueContext keeps the optimistic item (the local dispatch already
   * happened and isn't rolled back); the bridge returns `null` so callers
   * like `navigateToClimb` can skip navigating to a climb the board was
   * never actually told to display. */
  returnNullOnSetCurrentClimbFailure: boolean;
  mutations: PartyMutations;
  /** Mint a correlation id for a local->party round trip, or `undefined`
   * outside a party session. */
  nextCorrelationId: () => string | undefined;
};

export type QueueActionsCoreColdStart = {
  /** addToQueue only: bridge-solo cold-start seeding when no board is active
   * yet (selecting a climb from a surface with no board context, e.g. a
   * playlist view). Returns `true` when it handled the add (seeded or
   * legitimately no-opped because the climb can't be seeded), `false` when
   * not applicable (a board is already active) so the caller falls through
   * to the normal local-update path. */
  tryAddToQueue: (item: ClimbQueueItem) => boolean;
  /** setCurrentClimb only: same cold-start seeding, distinguishing a
   * successful seed from "climb has no board to seed from" so the caller can
   * roll back the optimistic playlistSuggestionSource set on failure. */
  trySetCurrentClimb: (item: ClimbQueueItem) => 'seeded' | 'failed' | 'not-applicable';
};

export type QueueActionsCoreHooks = {
  /** Resolves the literal `source` tag for the 'Set Active Climb' analytics
   * event. Differs by surface, and — for setCurrentClimbQueueItem only — by
   * whether a party session is active. */
  resolveSetActiveClimbSource: (
    kind: 'setCurrentClimb' | 'setCurrentClimbQueueItem',
    variant: 'party' | 'solo' | null,
  ) => SetActiveClimbSource;
  /** Fires the 'Set Active Climb' analytics event. Both surfaces fire this,
   * unconditionally, on every climb activation. */
  onSetActiveClimb: (payload: {
    climbUuid: string;
    boardType: string | null;
    layoutId: number | null;
    source: SetActiveClimbSource;
  }) => void;
  /** QueueContext only: increments the session's climbs-attempted counter.
   * Omit (bridge) to skip — the bridge has never tracked this. */
  onClimbActivated?: () => void;
  /** QueueContext only: fires 'Climb Added to Queue'. Omit (bridge) to skip —
   * the bridge has never fired this event. */
  onQueueItemAdded?: (payload: { item: ClimbQueueItem; source: AddToQueueSource; queueLengthAfter: number }) => void;
  /** QueueContext only: fires 'Climb Removed from Queue'. Omit (bridge) to
   * skip — the bridge has never fired this event. */
  onQueueItemRemoved?: (payload: { item: ClimbQueueItem }) => void;
  /** QueueContext only: per-operation timing/error metrics ('Queue Operation'
   * / 'Queue Operation Error'). Omit (bridge) to skip — the bridge has never
   * tracked these. */
  onOperationMetric?: {
    success: (operation: QueueOperation, durationMs: number, mode: QueueOperationMode) => void;
    error: (operation: QueueOperation, mode: QueueOperationMode) => void;
  };
};

export type SetCurrentClimbErrorMessages = {
  /** party mode, reuse-existing-item branch (bridge only; unreachable when
   * `party.reuseExistingQueueItemOnSetCurrentClimb` is false). */
  reuse: string;
  /** party mode, playlist-source branch (insert-after-current + prune, then
   * a single `setQueue` call). */
  playlist: string;
  /** party mode, plain branch, the `addQueueItem` step. */
  add: string;
  /** party mode, plain branch, the `setCurrentClimb` step (after addQueueItem
   * already succeeded — the item is queued but not yet activated). */
  activate: string;
};

export type QueueActionsCoreErrorMessages = {
  addToQueue: string;
  removeFromQueue: string;
  setQueue: string;
  mirrorClimb: string;
  replaceQueueItem: string;
  setCurrentClimb: SetCurrentClimbErrorMessages;
  setCurrentClimbQueueItem: string;
  reportWallDisconnect: string;
};

export type QueueActionsCoreDeps = {
  /** Fresh-every-call read of the state the actions operate on. Backed by a
   * `latestRef`-style ref on both surfaces so this function can be called
   * from a `[]`-deps stable callback without staleness. */
  getSnapshot: () => QueueActionsCoreSnapshot;
  /** Applies a queue-reducer action to whatever store backs *local* state.
   * QueueContext: `dispatch` (the `@boardsesh/queue` reducer via
   * `useReducer`, always applied). Bridge solo: reduce against the
   * useState-backed local store via the same shared reducer, then persist via
   * `ps.setLocalQueueState`. Bridge party: a no-op — party mode waits for the
   * server echo instead of applying an optimistic update (this is the one
   * documented pre-existing behavior difference this refactor preserves). */
  applyLocal: (action: QueueAction) => void;
  /** Sets `playlistSuggestionSource` outside of `applyLocal` because both
   * surfaces update it unconditionally, even when a party mutation is in
   * flight and `applyLocal` is a no-op — it's pure client-local navigation
   * bookkeeping the server never echoes back. QueueContext: dispatches
   * `SET_PLAYLIST_SUGGESTION_SOURCE`. Bridge: a raw `useState` setter. */
  setPlaylistSuggestionSourceLocal: (source: PlaylistSuggestionSource | null) => void;
  /** Conditionally refreshes `playlistSuggestionSource` when its activation
   * identity still matches. Delegated (not implemented over `getSnapshot`)
   * because both surfaces resolve the match against their live store —
   * QueueContext via the reducer's `REFRESH_PLAYLIST_SUGGESTION_SOURCE`
   * action, the bridge via a functional `setState` updater — which sees
   * same-tick updates a `latestRef` snapshot would miss. */
  refreshPlaylistSuggestionSourceLocal: (source: PlaylistSuggestionSource) => void;
  /** Builds a fresh queue item from a climb, attributing it to the current
   * user. Mirrors `createClimbQueueItem` (QueueContext) / `buildQueueItem`
   * (bridge) — identical shape, differing only in how each surface sources
   * `clientId`/`currentUserInfo`. */
  buildItem: (climb: Climb, suggested?: boolean) => ClimbQueueItem;
  /** Returns `true` to block the mutation (and show its own "blocked" UI).
   * QueueContext: `useMutationGuard`'s `guardMutation`. Bridge: `() => false`
   * — the bridge has never gated mutations this way. */
  guardMutation: () => boolean;
  /** Validates + (on rejection) surfaces its own error UI, returning `false`
   * to short-circuit the caller. QueueContext: `useQueueAddValidator`.
   * Bridge: board-compatibility validation via a Snackbar. */
  validateClimbForQueue: (climb: Climb) => boolean;
  /** Buffer for additions made while offline in party mode. Only QueueContext
   * has this; the bridge passes `null` (no offline-buffering behavior to
   * preserve there). */
  offlineBuffer: { bufferAddition: (item: ClimbQueueItem) => void } | null;
  /** setCurrentClimbQueueItem: whether the activated item should be added to
   * the queue when it isn't already present. QueueContext: `item.suggested`
   * (only suggestion-derived items get auto-queued). Bridge: always `true`
   * (it queues any not-yet-queued item regardless of `suggested`). */
  resolveShouldAddToQueueOnActivate: (item: ClimbQueueItem) => boolean;
  /** setQueue: resolves the next `currentClimbQueueItem` for the new queue.
   * QueueContext: always keeps the existing current climb, even if it fell
   * out of the new queue (callers are expected to keep it consistent
   * themselves). Bridge: keeps the existing current climb only if it
   * survived in the new queue, otherwise falls back to the new queue's first
   * item (or `null` if empty). */
  resolveNextCurrentForSetQueue: (
    newQueue: ClimbQueueItem[],
    currentClimbQueueItem: ClimbQueueItem | null,
  ) => ClimbQueueItem | null;
  /** replaceQueueItem: builds the replacement item from the existing queue
   * entry (if any) and the new climb. Returning `null` aborts the action
   * (bridge requires an existing entry; QueueContext always proceeds,
   * falling back to its own freshly-attributed base item when there's no
   * existing entry to borrow `addedBy`/`addedByUser`/`tickedBy`/`suggested`
   * from). */
  buildReplacementItem: (
    existing: ClimbQueueItem | undefined,
    climb: Climb,
    queueItemUuid: string,
  ) => ClimbQueueItem | null;
  /** getNextClimbQueueItem/getPreviousClimbQueueItem strategy, given the
   * resolved anchor (`options.from` or the current climb). QueueContext:
   * queue walk, then the playlist-suggestion-or-climbSearchResults discovery
   * fallback. Bridge: delegates the whole walk to
   * `findNextQueueItemWithSuggestions`/a queue-only walk (@boardsesh/play-view
   * parity with mobile). */
  discoverNext: (anchor: ClimbQueueItem | null) => ClimbQueueItem | null;
  discoverPrev: (anchor: ClimbQueueItem | null) => ClimbQueueItem | null;
  /** Cold-start seeding (bridge-solo only, board not yet active). Omitted by
   * QueueContext, which is always board-route-bound. */
  coldStart?: QueueActionsCoreColdStart;
  party: QueueActionsCoreParty;
  hooks: QueueActionsCoreHooks;
  errorMessages: QueueActionsCoreErrorMessages;
};

export type QueueActionsCore = Pick<
  QueueActionsType,
  | 'addToQueue'
  | 'removeFromQueue'
  | 'setCurrentClimb'
  | 'setCurrentClimbQueueItem'
  | 'previewClimbFromBrowse'
  | 'setPlaylistSuggestionSource'
  | 'refreshPlaylistSuggestionSource'
  | 'replaceQueueItem'
  | 'mirrorClimb'
  | 'getNextClimbQueueItem'
  | 'getPreviousClimbQueueItem'
  | 'setQueue'
  | 'reportWallDisconnect'
>;

export function createQueueActionsCore(deps: QueueActionsCoreDeps): QueueActionsCore {
  const {
    getSnapshot,
    applyLocal,
    setPlaylistSuggestionSourceLocal,
    refreshPlaylistSuggestionSourceLocal,
    buildItem,
    guardMutation,
    validateClimbForQueue,
    offlineBuffer,
    resolveShouldAddToQueueOnActivate,
    resolveNextCurrentForSetQueue,
    buildReplacementItem,
    discoverNext,
    discoverPrev,
    coldStart,
    party,
    hooks,
    errorMessages,
  } = deps;

  const attemptPartyMutation = () => party.isActive && party.attemptMutation;

  function addToQueue(climb: Climb, source: AddToQueueSource = 'unknown'): void {
    const startTime = performance.now();
    if (guardMutation()) return;
    if (!validateClimbForQueue(climb)) return;
    const mode = resolveQueueOperationMode(party.isActive, party.isDisconnected);
    const newItem = buildItem(climb, false);
    const queueLengthAfter = getSnapshot().queue.length + 1;

    applyLocal({ type: 'DELTA_ADD_QUEUE_ITEM', payload: { item: newItem } });
    hooks.onQueueItemAdded?.({ item: newItem, source, queueLengthAfter });

    if (party.isActive && party.isDisconnected && offlineBuffer) {
      offlineBuffer.bufferAddition(newItem);
      hooks.onOperationMetric?.success('addToQueue', performance.now() - startTime, mode);
      return;
    }
    if (attemptPartyMutation()) {
      party.mutations
        .addQueueItem(newItem)
        .then(() => hooks.onOperationMetric?.success('addToQueue', performance.now() - startTime, mode))
        .catch((error: unknown) => {
          console.error(errorMessages.addToQueue, error);
          hooks.onOperationMetric?.error('addToQueue', mode);
        });
      return;
    }
    if (!party.isActive && coldStart) {
      const handled = coldStart.tryAddToQueue(newItem);
      if (handled) return;
    }
    hooks.onOperationMetric?.success('addToQueue', performance.now() - startTime, mode);
  }

  function removeFromQueue(item: ClimbQueueItem): void {
    const startTime = performance.now();
    if (guardMutation()) return;
    const mode = resolveQueueOperationMode(party.isActive, party.isDisconnected);

    applyLocal({ type: 'DELTA_REMOVE_QUEUE_ITEM', payload: { uuid: item.uuid } });
    hooks.onQueueItemRemoved?.({ item });

    if (attemptPartyMutation()) {
      party.mutations
        .removeQueueItem(item.uuid)
        .then(() => hooks.onOperationMetric?.success('removeFromQueue', performance.now() - startTime, mode))
        .catch((error: unknown) => {
          console.error(errorMessages.removeFromQueue, error);
          hooks.onOperationMetric?.error('removeFromQueue', mode);
        });
      return;
    }
    hooks.onOperationMetric?.success('removeFromQueue', performance.now() - startTime, mode);
  }

  async function setCurrentClimb(climb: Climb, options: SetCurrentClimbOptions): Promise<ClimbQueueItem | null> {
    const startTime = performance.now();
    if (guardMutation()) return null;
    if (!validateClimbForQueue(climb)) return null;

    const nextPlaylistSuggestionSource = options.playlistSuggestionSource;
    const preDispatchSnapshot = getSnapshot();
    const previousPlaylistSuggestionSource = preDispatchSnapshot.playlistSuggestionSource;
    const mode = resolveQueueOperationMode(party.isActive, party.isDisconnected);
    const newItem = buildItem(climb, false);
    const correlationId = party.nextCorrelationId();

    // Resolve the reuse target BEFORE the optimistic dispatch so the optimistic
    // state matches what the mutation actually does. Otherwise the optimistic
    // dispatch inserts a fresh-uuid item while the reuse mutation activates the
    // existing one; the server echo (carrying the existing item + our
    // correlationId) is then suppressed as our own echo, stranding the phantom
    // fresh item locally until the hash watchdog forces a visible resync.
    const reuseTarget =
      party.isActive && party.reuseExistingQueueItemOnSetCurrentClimb
        ? (preDispatchSnapshot.queue.find((queueItem) => queueItem.climb?.uuid === climb.uuid) ?? null)
        : null;
    const optimisticItem = reuseTarget ?? newItem;

    setPlaylistSuggestionSourceLocal(nextPlaylistSuggestionSource);
    hooks.onSetActiveClimb({
      climbUuid: climb.uuid,
      boardType: climb.boardType ?? null,
      layoutId: climb.layoutId ?? null,
      source: hooks.resolveSetActiveClimbSource('setCurrentClimb', null),
    });
    hooks.onClimbActivated?.();

    const rollbackPlaylistSuggestionSource = () => setPlaylistSuggestionSourceLocal(previousPlaylistSuggestionSource);
    const finishSuccess = () =>
      hooks.onOperationMetric?.success('setCurrentClimb', performance.now() - startTime, mode);
    const finishError = (message: string, error: unknown) => {
      console.error(message, error);
      if (correlationId) applyLocal({ type: 'CLEANUP_PENDING_UPDATE', payload: { correlationId } });
      rollbackPlaylistSuggestionSource();
      hooks.onOperationMetric?.error('setCurrentClimb', mode);
    };

    // A setQueue-based mutation broadcasts a full-state echo that carries no
    // correlationId, so the reducer never clears the pending id we registered
    // here (stale pending → spurious forced resync ~5-7s later) and its
    // UPDATE_QUEUE clears the reducer-owned playlistSuggestionSource. Reconcile
    // both locally after a successful setQueue: drop the pending id and re-set
    // the source we just activated so "Next" keeps drawing from the playlist.
    const reconcileAfterSetQueue = () => {
      if (correlationId) applyLocal({ type: 'CLEANUP_PENDING_UPDATE', payload: { correlationId } });
      if (nextPlaylistSuggestionSource) setPlaylistSuggestionSourceLocal(nextPlaylistSuggestionSource);
    };

    applyLocal({
      type: 'DELTA_UPDATE_CURRENT_CLIMB',
      payload: {
        item: optimisticItem,
        shouldAddToQueue: reuseTarget === null,
        insertAfterCurrent: true,
        correlationId,
        playlistSuggestionSource: nextPlaylistSuggestionSource,
      },
    });

    if (party.isActive && party.isDisconnected && offlineBuffer) {
      // A reuse target is already in the queue — the optimistic dispatch
      // activated it, so there is nothing to buffer for reconciliation.
      if (!reuseTarget) offlineBuffer.bufferAddition(newItem);
      finishSuccess();
      return optimisticItem;
    }

    if (attemptPartyMutation()) {
      const { queue, currentClimbQueueItem } = getSnapshot();

      if (reuseTarget) {
        try {
          if (nextPlaylistSuggestionSource) {
            await party.mutations.setQueue(
              pruneSuggestedQueueItemsAfterCurrent(preDispatchSnapshot.queue, reuseTarget),
              reuseTarget,
            );
            reconcileAfterSetQueue();
          } else {
            await party.mutations.setCurrentClimb(reuseTarget, false, correlationId);
          }
          finishSuccess();
          return reuseTarget;
        } catch (error: unknown) {
          finishError(errorMessages.setCurrentClimb.reuse, error);
          return party.returnNullOnSetCurrentClimbFailure ? null : reuseTarget;
        }
      }

      const currentIndex = currentClimbQueueItem
        ? queue.findIndex((queueItem) => queueItem.uuid === currentClimbQueueItem.uuid)
        : -1;
      const position = currentIndex === -1 ? undefined : currentIndex + 1;

      if (nextPlaylistSuggestionSource) {
        try {
          const queueWithNewItem = insertQueueItemAfterCurrent(queue, currentClimbQueueItem, newItem);
          const prunedQueue = pruneSuggestedQueueItemsAfterCurrent(queueWithNewItem, newItem);
          await party.mutations.setQueue(prunedQueue, newItem);
          reconcileAfterSetQueue();
          finishSuccess();
          return newItem;
        } catch (error: unknown) {
          finishError(errorMessages.setCurrentClimb.playlist, error);
          return party.returnNullOnSetCurrentClimbFailure ? null : newItem;
        }
      }

      try {
        await party.mutations.addQueueItem(newItem, position);
      } catch (error: unknown) {
        finishError(errorMessages.setCurrentClimb.add, error);
        return party.returnNullOnSetCurrentClimbFailure ? null : newItem;
      }
      try {
        // Sequential awaits over a single graphql-ws connection preserve FIFO
        // ordering, so the server processes the add before the setCurrentClimb
        // that references it.
        await party.mutations.setCurrentClimb(newItem, false, correlationId);
      } catch (error: unknown) {
        finishError(errorMessages.setCurrentClimb.activate, error);
        return party.returnNullOnSetCurrentClimbFailure ? null : newItem;
      }
      finishSuccess();
      return newItem;
    }

    if (!party.isActive && coldStart) {
      const outcome = coldStart.trySetCurrentClimb(newItem);
      if (outcome === 'seeded') {
        finishSuccess();
        return newItem;
      }
      if (outcome === 'failed') {
        rollbackPlaylistSuggestionSource();
        hooks.onOperationMetric?.error('setCurrentClimb', mode);
        return null;
      }
      // 'not-applicable' — a board is already active, fall through.
    }

    finishSuccess();
    return newItem;
  }

  function setCurrentClimbQueueItem(item: ClimbQueueItem): void {
    const startTime = performance.now();
    if (guardMutation()) return;
    // Playlist "peek" items use a deterministic synthetic uuid so repeated
    // peeks of the same suggestion produce a stable queue uuid. Once a peek
    // is promoted to the actual current climb, mint a fresh queue-item uuid
    // so it lives as a regular queue entry rather than a transient peek.
    const queueItem = isPlaylistPeekQueueItemUuid(item.uuid) ? buildItem(item.climb, item.suggested) : item;
    const mode = resolveQueueOperationMode(party.isActive, party.isDisconnected);
    const correlationId = party.nextCorrelationId();

    applyLocal({
      type: 'DELTA_UPDATE_CURRENT_CLIMB',
      payload: { item: queueItem, shouldAddToQueue: resolveShouldAddToQueueOnActivate(queueItem), correlationId },
    });
    if (queueItem.climb) {
      hooks.onSetActiveClimb({
        climbUuid: queueItem.climb.uuid,
        boardType: queueItem.climb.boardType ?? null,
        layoutId: queueItem.climb.layoutId ?? null,
        source: hooks.resolveSetActiveClimbSource('setCurrentClimbQueueItem', party.isActive ? 'party' : 'solo'),
      });
    }
    hooks.onClimbActivated?.();

    if (attemptPartyMutation()) {
      party.mutations
        .setCurrentClimb(queueItem, queueItem.suggested, correlationId)
        .then(() => hooks.onOperationMetric?.success('setCurrentClimbQueueItem', performance.now() - startTime, mode))
        .catch((error: unknown) => {
          console.error(errorMessages.setCurrentClimbQueueItem, error);
          if (correlationId) applyLocal({ type: 'CLEANUP_PENDING_UPDATE', payload: { correlationId } });
          hooks.onOperationMetric?.error('setCurrentClimbQueueItem', mode);
        });
      return;
    }
    hooks.onOperationMetric?.success('setCurrentClimbQueueItem', performance.now() - startTime, mode);
  }

  function setQueue(newQueue: ClimbQueueItem[]): void {
    const startTime = performance.now();
    if (guardMutation()) return;
    const mode = resolveQueueOperationMode(party.isActive, party.isDisconnected);
    const nextCurrent = resolveNextCurrentForSetQueue(newQueue, getSnapshot().currentClimbQueueItem);

    applyLocal({ type: 'UPDATE_QUEUE', payload: { queue: newQueue, currentClimbQueueItem: nextCurrent } });

    if (attemptPartyMutation()) {
      party.mutations
        .setQueue(newQueue, nextCurrent)
        .then(() => hooks.onOperationMetric?.success('setQueue', performance.now() - startTime, mode))
        .catch((error: unknown) => {
          console.error(errorMessages.setQueue, error);
          hooks.onOperationMetric?.error('setQueue', mode);
        });
      return;
    }
    hooks.onOperationMetric?.success('setQueue', performance.now() - startTime, mode);
  }

  function mirrorClimb(): void {
    const startTime = performance.now();
    if (guardMutation()) return;
    const { currentClimbQueueItem } = getSnapshot();
    if (!currentClimbQueueItem?.climb) return;
    const mode = resolveQueueOperationMode(party.isActive, party.isDisconnected);
    const newMirroredState = !currentClimbQueueItem.climb.mirrored;

    // Local-origin dispatch: pass the current climb's uuid so the reducer's
    // server-event uuid guard is a no-op here (it only suppresses when uuid
    // diverges).
    applyLocal({
      type: 'DELTA_MIRROR_CURRENT_CLIMB',
      payload: { mirrored: newMirroredState, mirroredUuid: currentClimbQueueItem.uuid },
    });

    if (attemptPartyMutation()) {
      party.mutations
        .mirrorCurrentClimb(newMirroredState)
        .then(() => hooks.onOperationMetric?.success('mirrorClimb', performance.now() - startTime, mode))
        .catch((error: unknown) => {
          console.error(errorMessages.mirrorClimb, error);
          hooks.onOperationMetric?.error('mirrorClimb', mode);
        });
      return;
    }
    hooks.onOperationMetric?.success('mirrorClimb', performance.now() - startTime, mode);
  }

  function replaceQueueItem(queueItemUuid: string, climb: Climb): void {
    const startTime = performance.now();
    if (guardMutation()) return;
    if (!validateClimbForQueue(climb)) return;
    const { queue } = getSnapshot();
    const existing = queue.find((queueItem) => queueItem.uuid === queueItemUuid);
    const newItem = buildReplacementItem(existing, climb, queueItemUuid);
    if (!newItem) return;
    const mode = resolveQueueOperationMode(party.isActive, party.isDisconnected);

    applyLocal({ type: 'DELTA_REPLACE_QUEUE_ITEM', payload: { uuid: queueItemUuid, item: newItem } });

    if (attemptPartyMutation()) {
      party.mutations
        .replaceQueueItem(queueItemUuid, newItem)
        .then(() => hooks.onOperationMetric?.success('replaceQueueItem', performance.now() - startTime, mode))
        .catch((error: unknown) => {
          console.error(errorMessages.replaceQueueItem, error);
          hooks.onOperationMetric?.error('replaceQueueItem', mode);
        });
      return;
    }
    hooks.onOperationMetric?.success('replaceQueueItem', performance.now() - startTime, mode);
  }

  // Browse-initiated drawer open. Always-live model: every participant
  // broadcasts on browse exactly like solo — pre-mutate state (which the
  // persistent session broadcasts when a party session is active) then open
  // the drawer. `playlistSuggestionSource: null` so activating a non-playlist
  // climb clears any stale playlist source carried over from a prior
  // activation.
  function previewClimbFromBrowse(climb: Climb): void {
    void setCurrentClimb(climb, { playlistSuggestionSource: null });
    dispatchOpenPlayDrawer();
  }

  function setPlaylistSuggestionSource(source: PlaylistSuggestionSource | null): void {
    setPlaylistSuggestionSourceLocal(source ?? null);
  }

  function refreshPlaylistSuggestionSource(source: PlaylistSuggestionSource): void {
    refreshPlaylistSuggestionSourceLocal(source);
  }

  function getNextClimbQueueItem(options?: { from?: ClimbQueueItem | null }): ClimbQueueItem | null {
    // `??` (not a truthy check) so an explicit `from: null` falls back to the
    // current climb exactly like an omitted `from` — matches both surfaces'
    // pre-refactor behavior (QueueContext's `options?.from ? ... : ...` and
    // the bridge's `options?.from ?? current` are equivalent for object-or-
    // null values).
    const anchor = options?.from ?? getSnapshot().currentClimbQueueItem;
    return discoverNext(anchor);
  }

  function getPreviousClimbQueueItem(options?: { from?: ClimbQueueItem | null }): ClimbQueueItem | null {
    const anchor = options?.from ?? getSnapshot().currentClimbQueueItem;
    return discoverPrev(anchor);
  }

  // Report this client's own BLE link drop to the session so every member's
  // wall-confirmed lightbulb clears. Best-effort and a no-op in solo (the
  // persistent-session helper short-circuits with no active session).
  async function reportWallDisconnect(): Promise<void> {
    if (!party.isActive) return;
    if (!party.hasConnected) return;
    try {
      await party.mutations.reportWallDisconnect();
    } catch (error: unknown) {
      console.error(errorMessages.reportWallDisconnect, error);
    }
  }

  return {
    addToQueue,
    removeFromQueue,
    setCurrentClimb,
    setCurrentClimbQueueItem,
    previewClimbFromBrowse,
    setPlaylistSuggestionSource,
    refreshPlaylistSuggestionSource,
    replaceQueueItem,
    mirrorClimb,
    getNextClimbQueueItem,
    getPreviousClimbQueueItem,
    setQueue,
    reportWallDisconnect,
  };
}
