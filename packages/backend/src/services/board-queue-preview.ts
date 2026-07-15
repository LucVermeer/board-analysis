import { and, desc, eq } from 'drizzle-orm';
import type { BoardQueuePreview, BoardQueuePreviewItem, ClimbQueueItem, QueueState } from '@boardsesh/shared-schema';
import { db } from '../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { pubsub, type QueueEventHook } from '../pubsub';
import { roomManager } from './room-manager';
import { isBoardAnonReadable } from '../graphql/resolvers/board-presence/shared';
import { logger } from '../utils/logger';

/**
 * Board queue preview — the redacted, board-keyed "Up next" bridge between
 * membership-gated party sessions (keyed by session UUID) and anonymous
 * public displays (gym kiosks, keyed by boardId).
 *
 * Privacy is enforced at BUILD time, in one place (`resolvePublicPreviewSessionForBoard`),
 * for every surface — the query resolver, the subscription seed, and the live
 * producer all route through it:
 *
 * 1. The board must be anonymously readable (public, or a system-owned shared
 *    per-config board) — `isBoardAnonReadable`.
 * 2. The bound session must be `board_sessions.is_public = true` AND still
 *    `status = 'active'`. This deliberately widens `is_public`'s meaning from
 *    "appears in discovery" to "queue observable on public displays"
 *    (user-approved product decision; documented in the SDL).
 *
 * Redaction is total: `toBoardQueuePreviewItem` constructs items field-by-field
 * from the climb catalog data carried on the queue item — addedBy /
 * addedByUser / tickedBy and any other user-identifying fields never reach the
 * preview. Never spread a ClimbQueueItem here.
 */

/** Maximum number of upcoming items exposed on a preview. */
export const BOARD_QUEUE_PREVIEW_UP_NEXT_CAP = 10;

/** Trailing debounce for the live producer, coalescing queue-mutation bursts. */
export const BOARD_QUEUE_PREVIEW_DEBOUNCE_MS = 250;

/**
 * Redact one queue item down to climb-catalog display fields. Explicit
 * field-by-field construction (never a spread) so a new field added to
 * ClimbQueueItem can never leak into the anonymous preview by default.
 */
export function toBoardQueuePreviewItem(item: ClimbQueueItem): BoardQueuePreviewItem {
  return {
    queueItemUuid: item.uuid,
    climbUuid: item.climb.uuid,
    name: item.climb.name ?? null,
    grade: item.climb.difficulty ?? null,
    // Grade palettes are still client/theme-specific, so the server leaves
    // this nullable until a shared color contract exists (mirrors
    // reportBoardClimb's BoardPresenceClimb.gradeColor).
    gradeColor: null,
    frames: item.climb.frames ?? null,
    angle: item.climb.angle ?? null,
    setter: item.climb.setter_username ?? null,
  };
}

/**
 * Build the redacted preview snapshot from a session's queue state. Pure —
 * gates must already have been applied by the caller. `upNext` is the items
 * strictly after the current one (or the head of the queue when no current
 * item is present in it), capped at BOARD_QUEUE_PREVIEW_UP_NEXT_CAP;
 * `queueLength` is the uncapped total.
 */
export function buildBoardQueuePreview(boardId: number, queueState: QueueState): BoardQueuePreview {
  const { queue, currentClimbQueueItem } = queueState;
  const currentIndex = currentClimbQueueItem ? queue.findIndex((item) => item.uuid === currentClimbQueueItem.uuid) : -1;
  const upNextStart = currentIndex === -1 ? 0 : currentIndex + 1;
  const upNext = queue.slice(upNextStart, upNextStart + BOARD_QUEUE_PREVIEW_UP_NEXT_CAP).map(toBoardQueuePreviewItem);
  return {
    boardId,
    current: currentClimbQueueItem ? toBoardQueuePreviewItem(currentClimbQueueItem) : null,
    upNext,
    queueLength: queue.length,
    updatedAt: new Date().toISOString(),
  };
}

/** Whether this session may be previewed on public displays (gate 2). */
async function isPublicActiveSession(sessionId: string): Promise<boolean> {
  const [session] = await db
    .select({ isPublic: dbSchema.boardSessions.isPublic, status: dbSchema.boardSessions.status })
    .from(dbSchema.boardSessions)
    .where(eq(dbSchema.boardSessions.id, sessionId))
    .limit(1);
  return Boolean(session && session.isPublic && session.status === 'active');
}

/**
 * Resolve the session whose queue may be publicly previewed for a board, or
 * null when there is none. Applies BOTH privacy gates (see module docs).
 *
 * Binding resolution: the live Redis reverse key (`board:{id}:session`,
 * stamped by reportBoardClimb, 12h TTL) wins; when it's absent (expired,
 * Redis-less multi-instance, pre-deploy sessions) fall back to the newest
 * active `board_sessions` row for the board. When the live binding points at
 * a session that fails the gates we return null rather than falling through
 * to the DB — surfacing some *other* session's queue while a private one
 * holds the wall would be both wrong and a privacy leak.
 */
export async function resolvePublicPreviewSessionForBoard(boardId: number): Promise<string | null> {
  if (!(await isBoardAnonReadable(boardId))) return null;

  const boundSessionId = await pubsub.getBoardSession(String(boardId));
  if (boundSessionId) {
    return (await isPublicActiveSession(boundSessionId)) ? boundSessionId : null;
  }

  // Durable fallback: newest active public session linked to this board.
  const [row] = await db
    .select({ id: dbSchema.boardSessions.id })
    .from(dbSchema.boardSessions)
    .where(
      and(
        eq(dbSchema.boardSessions.boardId, boardId),
        eq(dbSchema.boardSessions.status, 'active'),
        eq(dbSchema.boardSessions.isPublic, true),
      ),
    )
    .orderBy(desc(dbSchema.boardSessions.lastActivity))
    .limit(1);
  return row?.id ?? null;
}

/**
 * The current redacted preview snapshot for a board, or null when no publicly
 * previewable session is bound. Shared by the `boardQueuePreview` query and
 * the subscription's seed yield.
 */
export async function getBoardQueuePreviewSnapshot(boardId: number): Promise<BoardQueuePreview | null> {
  const sessionId = await resolvePublicPreviewSessionForBoard(boardId);
  if (!sessionId) return null;
  const queueState = await roomManager.getQueueState(sessionId);
  return buildBoardQueuePreview(boardId, queueState);
}

/**
 * Gate + build + publish one preview for a session (the live producer's
 * debounce target). Exported for tests.
 *
 * Concurrency note: the forward binding (session→board) alone isn't enough —
 * another session can have taken the wall since this session's binding was
 * stamped (bindings expire by TTL, they're never cleared on hand-off). So we
 * confirm the board's reverse binding still points at THIS session before
 * publishing; a superseded session's queue mutations must not clobber the
 * preview of the session actually on the wall.
 */
export async function publishBoardQueuePreviewForSession(sessionId: string): Promise<void> {
  const boardId = await pubsub.getSessionBoard(sessionId);
  if (!boardId) return;

  const boundSessionId = await pubsub.getBoardSession(boardId);
  if (boundSessionId !== sessionId) return;

  if (!(await isBoardAnonReadable(Number(boardId)))) return;
  if (!(await isPublicActiveSession(sessionId))) return;

  const queueState = await roomManager.getQueueState(sessionId);
  pubsub.publishBoardQueuePreview(boardId, buildBoardQueuePreview(Number(boardId), queueState));
}

/**
 * Register the live board-queue-preview producer on the queue-event hook.
 * Wired once at backend bootstrap (`server.ts`), next to the APNs hook.
 *
 * Publisher-side semantics are correct here: the hook fires only on the
 * instance that originated the queue mutation, and the board-queue channel
 * itself Redis-fans-out the published preview to every instance's
 * subscribers — one mutation, one publish, cluster-wide delivery.
 *
 * Debounce: trailing, per session — a burst of queue mutations (multi-add,
 * reorder drags) coalesces into a single snapshot publish `debounceMs` after
 * the last event. The pending-timer map cannot leak: every timer deletes its
 * own entry when it fires, and the returned unregister function clears any
 * timers still pending (tests / shutdown).
 *
 * `PlaybackStateChanged` is skipped: it reuses the room's sequence number and
 * can fire up to 3600/min without ever changing queue membership or order.
 *
 * @returns unregister function (removes the hook and cancels pending timers).
 */
export function registerBoardQueuePreviewHook(
  options: {
    debounceMs?: number;
  } = {},
): () => void {
  const debounceMs = options.debounceMs ?? BOARD_QUEUE_PREVIEW_DEBOUNCE_MS;
  const pendingBySession = new Map<string, ReturnType<typeof setTimeout>>();

  const hook: QueueEventHook = (sessionId, event) => {
    if (event.__typename === 'PlaybackStateChanged') return;

    const existingTimer = pendingBySession.get(sessionId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      pendingBySession.delete(sessionId);
      publishBoardQueuePreviewForSession(sessionId).catch((error: unknown) => {
        logger.error(
          `[BoardQueuePreview] publish failed for session ${sessionId}:`,
          error instanceof Error ? (error.stack ?? error.message) : error,
        );
      });
    }, debounceMs);
    // Don't hold the process open for a pending preview publish.
    if (typeof timer === 'object') timer.unref?.();
    pendingBySession.set(sessionId, timer);
  };

  const removeHook = pubsub.addQueueEventHook(hook);

  return () => {
    removeHook();
    for (const timer of pendingBySession.values()) {
      clearTimeout(timer);
    }
    pendingBySession.clear();
  };
}
