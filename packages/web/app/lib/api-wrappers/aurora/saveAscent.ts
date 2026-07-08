import type { BoardName } from '../../types';
import type { SaveAscentOptions, SaveAscentResponse, Ascent } from './types';
import { convertQuality } from '@boardsesh/shared-schema';
import { dbz } from '@/app/lib/db/db';
import { boardseshTicks } from '@/app/lib/db/schema';
import { sql } from 'drizzle-orm';
import { normalizeTimestamp } from '@boardsesh/aurora-sync/normalize-timestamp';

/**
 * Saves an ascent to boardsesh_ticks.
 *
 * Note: This function writes directly to boardsesh_ticks using NextAuth userId.
 * The ascent will be synced TO Aurora via the user-sync cron job.
 *
 * @param board - Board type (kilter, tension)
 * @param token - Aurora auth token (kept for API compatibility)
 * @param options - Ascent options
 * @param nextAuthUserId - NextAuth user ID (required)
 */
export async function saveAscent(
  board: BoardName,
  token: string,
  options: SaveAscentOptions,
  nextAuthUserId: string,
): Promise<SaveAscentResponse> {
  // Store the moment in UTC via the same normalizeTimestamp every pull/import
  // path uses, so the same ascent lines up across sources for the cross-source
  // dedup. The route contract sends an ISO-8601 string with a zone, which
  // passes through untouched and is timezone-safe on any host (unlike the old
  // dayjs().format(), which rendered the server's LOCAL wall time and shifted
  // every logged ascent by the deployment offset). Defensively, an
  // Aurora-style naive "YYYY-MM-DD HH:mm:ss" gets pinned to UTC instead of
  // being parsed as server-local; a zoneless ISO ("...THH:mm:ss" with no
  // offset) is still host-dependent per the JS Date spec — don't send one.
  const climbedAtUtc = normalizeTimestamp(options.climbed_at);
  // Aurora's naive wire format is UTC "YYYY-MM-DD HH:mm:ss" — derive it from the
  // UTC ISO, never from local formatting.
  const formattedDate = climbedAtUtc.slice(0, 19).replace('T', ' ');
  const now = new Date().toISOString();

  // Determine status based on attempt_id (1 = flash, otherwise send)
  const status = options.attempt_id === 1 ? 'flash' : 'send';

  // The proxy speaks Aurora's convention (quality 0-3, 0 = unrated) but
  // boardsesh_ticks stores the 1-5 scale, so convert before storage. The
  // Aurora-shaped response below keeps the caller's raw value.
  const boardseshQuality = convertQuality(options.quality);

  // Native Boardsesh tick. `options.uuid` is a client-minted Aurora UUID for a
  // row that hasn't been created upstream yet — planting it as aurora_id made
  // the push-to-Aurora selection (aurora_id IS NULL) skip the tick, so it never
  // reached the user's Aurora logbook, and a later pull of the real ascent
  // landed a twin. Store aurora_id NULL + origin 'native': the tick counts
  // toward the Boardsesh ascensionist total and stays pending-push. The pull's
  // cross-source claim links it to the real Aurora ascent once it exists.
  //
  // Idempotency: the client-minted uuid becomes the tick's OWN uuid
  // (boardsesh_ticks.uuid is globally unique), so a client retry of the same
  // POST upserts the same row instead of inserting a duplicate — the dedup the
  // old fake-aurora_id conflict target used to provide, without polluting sync
  // provenance. The route validates the uuid's shape (RFC-hyphenated or
  // Aurora's 32-hex form), so a client can't plant arbitrary strings.
  //
  // The conflict update only touches content columns (never origin or the
  // aurora_*/kilter_* sync markers), and setWhere pins it to rows owned by this
  // user: a uuid colliding with ANOTHER user's tick is a no-op — not inserted
  // (unique index) and not updated (ownership guard) — never a cross-user
  // overwrite.
  await dbz
    .insert(boardseshTicks)
    .values({
      uuid: options.uuid,
      userId: nextAuthUserId,
      boardType: board,
      climbUuid: options.climb_uuid,
      angle: options.angle,
      isMirror: options.is_mirror,
      origin: 'native',
      status: status,
      attemptCount: options.bid_count,
      quality: boardseshQuality,
      difficulty: options.difficulty,
      isBenchmark: options.is_benchmark,
      comment: options.comment || '',
      climbedAt: climbedAtUtc,
      createdAt: now,
      updatedAt: now,
      auroraType: 'ascents',
      auroraId: null,
    })
    .onConflictDoUpdate({
      target: boardseshTicks.uuid,
      set: {
        boardType: board,
        climbUuid: options.climb_uuid,
        angle: options.angle,
        isMirror: options.is_mirror,
        status: status,
        attemptCount: options.bid_count,
        quality: boardseshQuality,
        difficulty: options.difficulty,
        isBenchmark: options.is_benchmark,
        comment: options.comment || '',
        climbedAt: climbedAtUtc,
        updatedAt: now,
      },
      setWhere: sql`${boardseshTicks.userId} = ${nextAuthUserId}`,
    });

  // Create a local ascent object for the response (for API compatibility)
  const localAscent: Ascent = {
    uuid: options.uuid,
    user_id: options.user_id, // Keep for API response compatibility
    climb_uuid: options.climb_uuid,
    angle: options.angle,
    is_mirror: options.is_mirror,
    attempt_id: options.attempt_id || options.bid_count,
    bid_count: options.bid_count,
    quality: options.quality,
    difficulty: options.difficulty,
    is_benchmark: options.is_benchmark,
    is_listed: true,
    wall_uuid: null,
    comment: options.comment,
    climbed_at: formattedDate,
    created_at: now,
    updated_at: now,
  };

  // Return response in the expected format
  return {
    events: [
      {
        _type: 'ascent_saved' as const,
        ascent: localAscent,
      },
    ],
  };
}
