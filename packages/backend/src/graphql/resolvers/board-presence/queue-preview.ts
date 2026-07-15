import type { ConnectionContext, BoardQueuePreview } from '@boardsesh/shared-schema';
import { pubsub } from '../../../pubsub/index';
import { createEagerAsyncIterator } from '../shared/async-iterators';
import { applyRateLimit } from '../shared/helpers';
import { requireAnonReadableBoard } from './shared';
import { getBoardQueuePreviewSnapshot } from '../../../services/board-queue-preview';

export const boardQueuePreviewQueries = {
  /**
   * Redacted "Up next" snapshot of the party-session queue bound to a shared
   * board, for anonymous public displays (gym kiosks).
   *
   * Auth-optional. `requireAnonReadableBoard` hides private boards from
   * anonymous viewers behind the same NOT_FOUND as a missing board. The
   * double privacy gate (anon-readable board AND `isPublic` active session —
   * including the deliberately widened `is_public` semantics) plus the
   * binding resolution (Redis reverse key → newest-active DB fallback) and
   * the total redaction all live in
   * `services/board-queue-preview.ts` — one implementation shared with the
   * subscription seed and the live producer so the gates can never drift.
   * Returns null when no publicly previewable session is bound.
   */
  boardQueuePreview: async (
    _: unknown,
    { boardId }: { boardId: number },
    ctx: ConnectionContext,
  ): Promise<BoardQueuePreview | null> => {
    await applyRateLimit(ctx, 60, 'boardQueuePreview');
    await requireAnonReadableBoard(boardId, ctx.userId);
    return getBoardQueuePreviewSnapshot(boardId);
  },
};

export const boardQueuePreviewSubscriptions = {
  /**
   * Live redacted "Up next" previews for a shared board. Same audience and
   * anonymous existence-hiding as `boardNowPlaying`; every published event has
   * already passed the double privacy gate at the producer.
   *
   * Eager subscribe THEN seed: `createEagerAsyncIterator` awaits the Redis
   * channel subscribe before we compute the seed snapshot, so a producer
   * publish landing during setup queues in the iterator instead of being
   * dropped (pub/sub has no replay — the seed is the only initial state a
   * kiosk gets). A publish that lands between the subscribe and the seed
   * compute can deliver a snapshot slightly older than the seed right after
   * it; accepted — snapshots are self-contained and the next mutation's
   * publish converges (same accepted race as boardNowPlaying's backfill).
   */
  boardQueuePreview: {
    subscribe: async function* (_: unknown, { boardId }: { boardId: number }, ctx: ConnectionContext) {
      await applyRateLimit(ctx, 60, 'boardQueuePreview');
      await requireAnonReadableBoard(boardId, ctx.userId);

      const boardKey = String(boardId);

      const asyncIterator = await createEagerAsyncIterator<BoardQueuePreview>(
        (push) => pubsub.subscribeBoardQueuePreview(boardKey, push),
        `boardQueuePreview:${boardId}`,
      );

      const seed = await getBoardQueuePreviewSnapshot(boardId);
      if (seed) {
        yield { boardQueuePreview: seed };
      }

      for await (const preview of asyncIterator) {
        yield { boardQueuePreview: preview };
      }
    },
  },
};
