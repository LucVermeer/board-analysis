/**
 * Queue state hashing — the single source of truth for both web and backend.
 *
 * Both sides compute this hash independently and compare them to detect drift
 * (the 60s client watchdog, reconnect reconciliation, server no-op detection).
 * They MUST produce identical output for identical queues, so there is exactly
 * one implementation and both import it from here. A previous duplicate-copy
 * setup drifted: the web copy filtered malformed items, the backend copy did
 * not, so a queue item with a missing/null `uuid` hashed differently on each
 * side and the watchdog looped forever (issue #2359).
 *
 * This is NOT a cryptographic hash — use only for integrity checking and
 * detecting state drift, not for security.
 */

/**
 * FNV-1a 32-bit hash.
 * https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function
 */
export function fnv1aHash(str: string): string {
  const FNV_PRIME = 0x01000193;
  const FNV_OFFSET_BASIS = 0x811c9dc5;

  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }

  // Convert to unsigned 32-bit integer and return as zero-padded hex.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Sanitize a queue into the list of UUIDs that contribute to a hash.
 *
 * Malformed entries (null/undefined items, or items without a string `uuid`)
 * are filtered out. This keeps hashing crash-safe and, more importantly,
 * invariant to the shape corruption that the reducer's `climb != null` filter
 * lets through — so client and server agree even when a queue item is missing
 * its uuid. Shared by the order-insensitive (v1) and order-sensitive (v2)
 * hashes so both filter identically.
 */
function sanitizeQueueUuids(queue: Array<{ uuid: string } | null | undefined>): string[] {
  return queue
    .filter((item): item is { uuid: string } => item != null && typeof item === 'object' && item.uuid != null)
    .map((item) => item.uuid);
}

/**
 * Compute a deterministic hash of queue state: SORTED queue UUIDs + current
 * item UUID. Only UUIDs contribute — climb metadata is intentionally ignored.
 *
 * Because the UUIDs are sorted before hashing, this hash is ORDER-INSENSITIVE:
 * a reorder that keeps the same membership produces the same hash. That blind
 * spot is exactly why the order-sensitive `computeQueueStateHashOrdered` (v2)
 * exists — see its doc.
 *
 * TODO(x1-cleanup): once telemetry confirms every live client is v2-aware
 * (computes/compares `computeQueueStateHashOrdered`), this v1 hash can be
 * retired in favour of the ordered one. Kept until then so the dual-hash
 * transition stays non-breaking for clients that only understand v1 — same
 * client-adoption-gated deferral pattern as B7.
 */
export function computeQueueStateHash(
  queue: Array<{ uuid: string } | null | undefined>,
  currentItemUuid: string | null,
): string {
  const queueUuids = sanitizeQueueUuids(queue).sort().join(',');
  const currentUuid = currentItemUuid || 'null';

  const canonical = `${queueUuids}|${currentUuid}`;

  return fnv1aHash(canonical);
}

/**
 * Compute a deterministic hash of queue state: queue UUIDs IN ORDER (not
 * sorted) + current item UUID. Only UUIDs contribute — climb metadata is
 * intentionally ignored. The order-sensitive (v2) companion to
 * `computeQueueStateHash`.
 *
 * Unlike v1, this hash CHANGES when the queue is reordered even though the
 * membership is unchanged — so a reorder that diverges between client and
 * server is finally visible to the hash watchdog. Add/remove changes both v1
 * and v2; a pure reorder changes only v2.
 *
 * Malformed-entry filtering is identical to v1 (via `sanitizeQueueUuids`), so
 * the two hashes stay in lock-step on corruption handling and both sides agree
 * for identical queues.
 */
export function computeQueueStateHashOrdered(
  queue: Array<{ uuid: string } | null | undefined>,
  currentItemUuid: string | null,
): string {
  const queueUuids = sanitizeQueueUuids(queue).join(',');
  const currentUuid = currentItemUuid || 'null';

  const canonical = `${queueUuids}|${currentUuid}`;

  return fnv1aHash(canonical);
}
