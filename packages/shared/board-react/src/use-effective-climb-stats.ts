import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { BoardName } from '@boardsesh/shared-schema';
import type { BoardAdapter } from './adapter';
import { useBoardAdapter } from './adapter';
import {
  applyCanonicalClimbStats,
  getClimbStatsSnapshot,
  getRetainedClimbStatsKeys,
  isClimbStatsReadRetained,
  setClimbStatsAuthEpoch,
  settleOfflineTickAscent,
  subscribeClimbStats,
  type ClimbStatsKey,
} from './climb-stats-store';

const inFlightReads = new Map<string, Promise<void>>();
type QueuedRead = {
  adapter: BoardAdapter;
  key: ClimbStatsKey;
  force: boolean;
  promise: Promise<void>;
  resolve: () => void;
};
const queuedReads = new Map<string, QueuedRead>();
const lastReadAt = new Map<string, number>();
const READ_COOLDOWN_MS = 30_000;
const LAST_READ_TTL_MS = 10 * 60_000;
/** @internal Hard bound for the climb-stats read coordinator's LRU timestamps. */
export const MAX_LAST_READ_ENTRIES = 500;
const MAX_RECONNECT_READS = 50;
const MAX_READ_CONCURRENCY = 4;
const RECONCILIATION_INTERVAL_MS = 120_000;
let activeReadCount = 0;
let coordinatorGeneration = 0;

function readKey(boardType: string, climbUuid: string): string {
  return `${boardType}\u0000${climbUuid}`;
}

function pruneLastReadAt(now: number): void {
  for (const [serialized, readAt] of lastReadAt) {
    if (now - readAt > LAST_READ_TTL_MS) lastReadAt.delete(serialized);
  }
  while (lastReadAt.size > MAX_LAST_READ_ENTRIES) {
    const oldest = lastReadAt.keys().next().value;
    if (typeof oldest !== 'string') break;
    lastReadAt.delete(oldest);
  }
}

function recentReadAt(serialized: string, now: number): number | undefined {
  pruneLastReadAt(now);
  const readAt = lastReadAt.get(serialized);
  if (readAt != null) {
    // Map insertion order is the LRU order. A cooldown hit is still a use.
    lastReadAt.delete(serialized);
    lastReadAt.set(serialized, readAt);
  }
  return readAt;
}

function recordReadAt(serialized: string, now: number): void {
  lastReadAt.delete(serialized);
  lastReadAt.set(serialized, now);
  pruneLastReadAt(now);
}

function discardQueuedRead(serialized: string, queued: QueuedRead): void {
  if (queuedReads.get(serialized) !== queued) return;
  queuedReads.delete(serialized);
  queued.resolve();
}

function drainReadQueue(): void {
  while (activeReadCount < MAX_READ_CONCURRENCY && queuedReads.size > 0) {
    let next: [string, QueuedRead] | undefined;
    for (const candidate of queuedReads) {
      // A forced request that arrives during an active read must wait for that
      // read to settle. Keep scanning so it does not head-of-line block other
      // keys when the global scheduler still has capacity.
      if (!inFlightReads.has(candidate[0])) {
        next = candidate;
        break;
      }
    }
    if (!next) return;
    const [serialized, queued] = next;
    queuedReads.delete(serialized);

    // Rows can unmount while waiting behind the four active reads. Do not spend
    // transport work on a key no selector or optimistic mutation still owns.
    if (!isClimbStatsReadRetained(queued.key.boardType, queued.key.climbUuid)) {
      queued.resolve();
      continue;
    }
    const now = Date.now();
    const readAt = recentReadAt(serialized, now);
    if (!queued.force && readAt != null && now - readAt < READ_COOLDOWN_MS) {
      queued.resolve();
      continue;
    }

    const fetchClimbStats = queued.adapter.fetchClimbStats;
    if (!fetchClimbStats || !queued.adapter.isAuthenticated) {
      queued.resolve();
      continue;
    }

    activeReadCount += 1;
    const generation = coordinatorGeneration;
    const request = fetchClimbStats(queued.key.boardType, queued.key.climbUuid)
      .then((rows) => {
        if (generation !== coordinatorGeneration) return;
        recordReadAt(serialized, Date.now());
        for (const row of rows) {
          applyCanonicalClimbStats({
            boardType: queued.key.boardType,
            layoutId: queued.key.layoutId,
            climbUuid: queued.key.climbUuid,
            ...row,
            ascensionistCount: row.ascensionistCount ?? 0,
          });
        }
      })
      // These are background repair reads. The transport already reports HTTP
      // failures; keep a transient outage from becoming an unhandled rejection.
      .catch(() => {})
      .finally(() => {
        if (generation === coordinatorGeneration) {
          if (inFlightReads.get(serialized) === request) inFlightReads.delete(serialized);
          activeReadCount = Math.max(0, activeReadCount - 1);
          drainReadQueue();
        }
        queued.resolve();
      });
    inFlightReads.set(serialized, request);
  }
}

function readCanonicalClimbStats(adapter: BoardAdapter, key: ClimbStatsKey, force = false): Promise<void> {
  if (!adapter.fetchClimbStats || !adapter.isAuthenticated) return Promise.resolve();
  const serialized = readKey(key.boardType, key.climbUuid);
  const active = inFlightReads.get(serialized);
  if (active && !force) return active;
  const alreadyQueued = queuedReads.get(serialized);
  if (alreadyQueued) {
    // Reconnect/post-ack callers share one queued follow-up and can upgrade an
    // ordinary queued mount read without adding duplicate keyed work.
    alreadyQueued.force ||= force;
    return alreadyQueued.promise;
  }

  let resolveQueued = () => {};
  const promise = new Promise<void>((resolve) => {
    resolveQueued = resolve;
  });
  const queued: QueuedRead = { adapter, key, force, promise, resolve: resolveQueued };
  queuedReads.set(serialized, queued);
  drainReadQueue();
  return promise;
}

function discardReadIfUnretained(key: ClimbStatsKey): void {
  if (isClimbStatsReadRetained(key.boardType, key.climbUuid)) return;
  const serialized = readKey(key.boardType, key.climbUuid);
  const queued = queuedReads.get(serialized);
  if (queued) discardQueuedRead(serialized, queued);
}

async function refreshRetainedClimbStats(adapter: BoardAdapter, boardType: string, layoutId: number): Promise<void> {
  const unique = new Map<string, ClimbStatsKey>();
  for (const key of getRetainedClimbStatsKeys(boardType, layoutId)) {
    unique.set(key.climbUuid, key);
    if (unique.size >= MAX_RECONNECT_READS) break;
  }
  await Promise.all([...unique.values()].map((key) => readCanonicalClimbStats(adapter, key, true)));
}

export type EffectiveClimbStats = {
  ascensionistCount: number;
  qualityAverage: string | null;
  difficulty: string | null;
};

export type EffectiveClimbStatsBase = {
  ascensionistCount?: number | null;
  qualityAverage?: string | null;
  difficulty?: string | null;
};

/**
 * Exact-key selector over the renderer-neutral live-stats store. Only the
 * component calling this hook re-renders; row thumbnails/gesture shells do not
 * subscribe. The snapshot object is stable until this exact key changes.
 */
export function useEffectiveClimbStats(
  boardType: BoardName,
  layoutId: number,
  climbUuid: string,
  angle: number,
  base: EffectiveClimbStatsBase,
): EffectiveClimbStats {
  const adapter = useBoardAdapter();
  const key = useMemo<ClimbStatsKey>(
    () => ({ boardType, layoutId, climbUuid, angle }),
    [boardType, layoutId, climbUuid, angle],
  );
  const subscribe = useCallback((listener: () => void) => subscribeClimbStats(key, listener), [key]);
  const getSnapshot = useCallback(() => getClimbStatsSnapshot(key), [key]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void readCanonicalClimbStats(adapter, key);
    return () => {
      // React releases the external-store subscription in a separate cleanup.
      // Check retention in the next microtask so a row that was queued and then
      // unmounted is removed before an active read frees a scheduler slot.
      void Promise.resolve().then(() => discardReadIfUnretained(key));
    };
  }, [adapter, key]);

  const canonical = snapshot.canonical;
  const canonicalCount = canonical?.ascensionistCount ?? 0;
  const baseCount = base.ascensionistCount ?? 0;
  return {
    ascensionistCount: Math.max(baseCount, canonicalCount, snapshot.optimisticFloor ?? 0),
    // Once a canonical object exists, its nulls are authoritative removals.
    // Falling back field-by-field would resurrect a stale list/search value.
    qualityAverage: canonical
      ? canonical.qualityAverage == null
        ? null
        : String(canonical.qualityAverage)
      : (base.qualityAverage ?? null),
    difficulty: canonical ? canonical.difficulty : (base.difficulty ?? null),
  };
}

/** Mount once in BoardProvider: one layout stream over the mobile singleton WS. */
export function useClimbStatsLayoutSync(boardType: BoardName | null, layoutId: number | undefined): void {
  const adapter = useBoardAdapter();
  const authEpoch = adapter.captureAuthEpoch?.() ?? 0;

  useEffect(() => {
    setClimbStatsAuthEpoch(authEpoch);
  }, [authEpoch]);

  useEffect(() => {
    if (!adapter.subscribeOfflineMutationDelivery) return undefined;
    return adapter.subscribeOfflineMutationDelivery((event) => {
      if (event.tableName !== 'boardsesh_ticks' || event.operation !== 'create') return;
      const settledKey = settleOfflineTickAscent(event.idempotencyKey, event.status, authEpoch);
      if (event.status === 'acknowledged' && settledKey) {
        scheduleAcknowledgedClimbStatsRead(adapter, settledKey);
      }
    });
  }, [adapter, authEpoch]);

  useEffect(() => {
    if (!boardType || !layoutId || !adapter.isAuthenticated || !adapter.subscribeClimbStats) return undefined;
    const refresh = () => {
      void refreshRetainedClimbStats(adapter, boardType, layoutId);
    };
    const unsubscribe = adapter.subscribeClimbStats(boardType, layoutId, {
      next: (event) => {
        if (event.boardType !== boardType || event.layoutId !== layoutId) return;
        applyCanonicalClimbStats(event);
      },
      connected: refresh,
      // Redis-required subscription setup failures surface as operation errors.
      // A bounded primary refresh repairs retained keys while graphql-ws retries.
      error: refresh,
    });
    refresh();
    // Redis PUBLISH is intentionally fail-open and operation-level errors can
    // occur without closing the singleton socket. A low-frequency bounded
    // primary pass repairs that otherwise-undetectable missed-event case.
    let cancelReconciliation: (() => void) | undefined;
    const scheduleReconciliation = () => {
      cancelReconciliation = adapter.scheduleTask?.(() => {
        refresh();
        scheduleReconciliation();
      }, RECONCILIATION_INTERVAL_MS);
    };
    scheduleReconciliation();
    return () => {
      cancelReconciliation?.();
      unsubscribe();
    };
  }, [adapter, boardType, layoutId]);
}

/** Schedule the post-ack safety read that covers a lost Redis publish. */
export function scheduleAcknowledgedClimbStatsRead(adapter: BoardAdapter, key: ClimbStatsKey): void {
  if (!adapter.scheduleTask) {
    void readCanonicalClimbStats(adapter, key, true);
    return;
  }
  adapter.scheduleTask(() => {
    void readCanonicalClimbStats(adapter, key, true);
  }, 3_000);
}

export function resetClimbStatsReadCoordinatorForTests(): void {
  coordinatorGeneration += 1;
  for (const queued of queuedReads.values()) queued.resolve();
  queuedReads.clear();
  inFlightReads.clear();
  lastReadAt.clear();
  activeReadCount = 0;
}

/** Test-only coordinator bounds/debug state. */
export function getClimbStatsReadCoordinatorStateForTests(): {
  active: number;
  queued: number;
  timestamps: number;
} {
  return { active: activeReadCount, queued: queuedReads.size, timestamps: lastReadAt.size };
}

/** Test-only seam for the TTL/LRU timestamp bound without mounting 500 rows. */
export function recordClimbStatsReadForTests(serialized: string, readAt: number): void {
  recordReadAt(serialized, readAt);
}
