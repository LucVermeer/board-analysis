import { useEffect, useRef, type MutableRefObject } from 'react';
import type { SubscriptionQueueEvent, SessionUser } from '@boardsesh/shared-schema';
import { isRateLimitedError } from '@boardsesh/graphql-client';
import type { ClimbQueueItem } from '../../queue-control/types';

const RECONCILIATION_TIMEOUT_MS = 15000;

// Space out replayed additions so a big buffered batch (built up while offline)
// can't fire faster than the per-user rate limit allows on reconnect (#2655).
// `execute` also retries an individual throttled add, but pacing keeps us from
// tripping the limit in the first place.
const DEFAULT_REPLAY_PACING_MS = 80;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type UseOfflineReconciliationParams = {
  offlineBuffer: {
    getBufferedAdditions: () => ClimbQueueItem[];
    clearBuffer: () => void;
    hasPendingAdditions: boolean;
    bufferAddition: (item: ClimbQueueItem) => void;
  };
  isDisconnected: boolean;
  isPersistentSessionActive: boolean;
  hasConnected: boolean;
  users: SessionUser[];
  lastReceivedSequenceRef: MutableRefObject<number | null>;
  persistentSession: {
    addQueueItem: (item: ClimbQueueItem) => Promise<void>;
    setQueue: (queue: ClimbQueueItem[], currentClimb?: ClimbQueueItem | null) => Promise<void>;
    setCurrentClimb: (item: ClimbQueueItem | null, shouldAddToQueue?: boolean, correlationId?: string) => Promise<void>;
    subscribeToQueueEvents: (callback: (event: SubscriptionQueueEvent) => void) => () => void;
  };
  currentQueue: ClimbQueueItem[];
  currentClimbQueueItem: ClimbQueueItem | null;
  /** Delay between replayed additions (ms). Defaults to ~80ms; tests pass 0 to
   *  disable pacing so replays are synchronous. */
  replayPacingMs?: number;
  /** Injectable sleep for the pacing delay (tests). */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Watches for disconnected-to-connected transitions and reconciles local queue
 * changes with the server.
 *
 * **Client-wins conditions** (full local state pushed to server):
 * - Only 1 user in the session (solo party session), OR
 * - Remote session hasn't changed while we were disconnected (same sequence number)
 *
 * **Server-wins with additions merge** (default):
 * - Server queue state is authoritative
 * - Only locally-added items are pushed to the server
 * - Removals, reorders, current-climb changes made while disconnected are discarded
 *
 * Note on timing: the FullSync event may arrive before this effect subscribes
 * (React effects are async). The 15-second safety timeout handles this case.
 * Since addQueueItem/setQueue are idempotent, the worst outcome is a redundant
 * server round-trip.
 */
export function useOfflineReconciliation({
  offlineBuffer,
  isDisconnected,
  isPersistentSessionActive,
  hasConnected,
  users,
  lastReceivedSequenceRef,
  persistentSession,
  currentQueue,
  currentClimbQueueItem,
  replayPacingMs = DEFAULT_REPLAY_PACING_MS,
  sleep = defaultSleep,
}: UseOfflineReconciliationParams) {
  const wasDisconnectedRef = useRef(isDisconnected);
  const currentQueueRef = useRef(currentQueue);
  const currentClimbRef = useRef(currentClimbQueueItem);
  const usersRef = useRef(users);
  const sequenceAtDisconnectRef = useRef<number | null>(null);
  // Generation counter: incremented on each reconciliation attempt. Async
  // reconciliation functions check this to bail out if superseded by a newer attempt.
  const reconciliationGenerationRef = useRef(0);

  // Keep refs fresh
  currentQueueRef.current = currentQueue;
  currentClimbRef.current = currentClimbQueueItem;
  usersRef.current = users;

  // Capture the sequence number while disconnected so we can compare on reconnect.
  useEffect(() => {
    if (isDisconnected) {
      sequenceAtDisconnectRef.current = lastReceivedSequenceRef.current;
    }
  }, [isDisconnected, lastReceivedSequenceRef]);

  useEffect(() => {
    const wasDisconnected = wasDisconnectedRef.current;
    wasDisconnectedRef.current = isDisconnected;

    // Detect disconnected-to-connected transition
    if (!wasDisconnected || isDisconnected) return;
    if (!isPersistentSessionActive || !hasConnected) return;
    if (!offlineBuffer.hasPendingAdditions) return;

    const generation = ++reconciliationGenerationRef.current;

    /**
     * Determine whether the client's full local state should win.
     * Reads from refs to get the freshest values at FullSync time.
     */
    function shouldClientWin(serverSequence: number): boolean {
      const currentUsers = usersRef.current;
      // Solo session — no one else could have changed anything
      if (currentUsers.length <= 1) return true;
      // Server state unchanged since we went disconnected
      if (sequenceAtDisconnectRef.current !== null && serverSequence === sequenceAtDisconnectRef.current) return true;
      return false;
    }

    function isSuperseded() {
      return reconciliationGenerationRef.current !== generation;
    }

    async function reconcileClientWins() {
      const localQueue = currentQueueRef.current;
      const localCurrentClimb = currentClimbRef.current;
      let stillRateLimited = false;
      try {
        if (isSuperseded()) return;
        await persistentSession.setQueue(localQueue, localCurrentClimb);
        if (localCurrentClimb && !isSuperseded()) {
          await persistentSession.setCurrentClimb(localCurrentClimb, false);
        }
      } catch (error) {
        // Throttled even after `execute`'s own retries — keep the buffer so a
        // later reconnect re-pushes instead of dropping the offline additions
        // (#2655). Any other failure clears as before (nothing more we can do).
        stillRateLimited = isRateLimitedError(error);
        console.error('[OfflineReconciliation] Failed to push full local state:', error);
      }
      if (!isSuperseded() && !stillRateLimited) {
        offlineBuffer.clearBuffer();
      }
    }

    async function reconcileAdditionsOnly(serverQueue: ClimbQueueItem[]) {
      const pending = offlineBuffer.getBufferedAdditions();
      const serverUuids = new Set(serverQueue.map((item) => item.uuid));
      // Items the server is still throttling after `execute`'s retries — kept
      // buffered so the next reconnect replays them instead of losing them.
      const stillThrottled: ClimbQueueItem[] = [];

      for (let index = 0; index < pending.length; index++) {
        const item = pending[index];
        if (isSuperseded()) return;
        if (serverUuids.has(item.uuid)) continue;
        try {
          await persistentSession.addQueueItem(item);
        } catch (error) {
          if (isRateLimitedError(error)) {
            stillThrottled.push(item);
          } else {
            console.error('[OfflineReconciliation] Failed to add buffered item:', item.climb?.name, error);
          }
        }
        // Pace the batch so it can't blow the per-minute budget in one burst.
        if (replayPacingMs > 0 && index < pending.length - 1 && !isSuperseded()) {
          await sleep(replayPacingMs);
        }
      }

      if (!isSuperseded()) {
        offlineBuffer.clearBuffer();
        // Re-seed anything still throttled so it survives to the next reconnect.
        for (const item of stillThrottled) {
          offlineBuffer.bufferAddition(item);
        }
      }
    }

    // Subscribe to queue events and wait for FullSync
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = persistentSession.subscribeToQueueEvents((event: SubscriptionQueueEvent) => {
      if (event.__typename === 'FullSync') {
        if (timeoutId) clearTimeout(timeoutId);
        unsubscribe();

        if (shouldClientWin(event.sequence)) {
          reconcileClientWins().catch((err) =>
            console.error('[OfflineReconciliation] reconcileClientWins failed:', err),
          );
        } else {
          const serverQueue = (event.state?.queue ?? []) as ClimbQueueItem[];
          reconcileAdditionsOnly(serverQueue).catch((err) =>
            console.error('[OfflineReconciliation] reconcileAdditionsOnly failed:', err),
          );
        }
      }
    });

    // Safety timeout: if no FullSync arrives, push additions using the server
    // queue from the FullSync that may have already been processed by the event
    // processor (which merges offline items). The UUID dedup means already-merged
    // items are skipped. This is a best-effort fallback.
    timeoutId = setTimeout(() => {
      unsubscribe();
      reconcileAdditionsOnly(currentQueueRef.current).catch((err) =>
        console.error('[OfflineReconciliation] timeout reconcileAdditionsOnly failed:', err),
      );
    }, RECONCILIATION_TIMEOUT_MS);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [isDisconnected, isPersistentSessionActive, hasConnected, offlineBuffer, persistentSession]);
}
