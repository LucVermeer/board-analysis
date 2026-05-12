import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { eq, and, desc, isNotNull, like, or, sql } from 'drizzle-orm';
import { fetchInstagramMeta, getInstagramMediaId, isInstagramUrl } from '../../../lib/instagram-meta';
import { fetchTikTokMeta, getTikTokCacheId, isTikTokUrl } from '../../../lib/tiktok-meta';
import {
  cacheInstagramThumbnail,
  cacheTikTokThumbnail,
  getDevProxyThumbnailUrl,
  isOurS3Url,
  isS3Configured,
  STATIC_THUMBNAIL_PREFIX,
} from '../../../lib/beta-link-thumbnails';

type BetaLinkResult = {
  climbUuid: string;
  link: string;
  foreignUsername: string | null;
  angle: number | null;
  thumbnail: string | null;
  isListed: boolean | null;
  createdAt: string | null;
};

type RecentBetaLinkResult = {
  betaLink: BetaLinkResult;
  climbName: string | null;
  boardType: string;
};

const RECENT_BETA_LINKS_MAX_LIMIT = 50;
const RECENT_BETA_LINKS_DEFAULT_LIMIT = 20;
const USER_BETA_LINKS_MAX_LIMIT = 100;
const USER_BETA_LINKS_DEFAULT_LIMIT = 50;
// Cap rows per foreign_username on the home slider so a single climber's
// bulk upload doesn't push the rest of the community off the strip. NULL
// usernames are uncapped per product direction (per-user issue is the
// known-handle case).
const HOME_PER_USER_CAP = 3;

// Extract an Instagram handle from `userProfiles.instagramUrl`. The field
// holds a profile URL — we only want the handle so we can match against
// `board_beta_links.foreign_username`. Returns null for anything that
// doesn't look like a recognisable instagram.com profile URL.
function extractInstagramHandle(profileUrl: string | null): string | null {
  if (!profileUrl) return null;
  const trimmed = profileUrl.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?/i);
  return match ? match[1] : null;
}

// We never surface KayaClimb beta links — we don't want to drive traffic to a
// competing climbing app from our slider. Filter them out at the resolver.
const KAYACLIMB_HOST = /^https?:\/\/(?:[a-z0-9-]+\.)*kayaclimb\.com\//i;

function isKayaClimbUrl(url: string): boolean {
  return KAYACLIMB_HOST.test(url);
}

type Row = typeof dbSchema.boardBetaLinks.$inferSelect;

type MetaResult =
  | { status: 'ok'; thumbnail: string; username: string | null }
  | { status: 'gone' }
  | { status: 'transient_error' };

type EnrichConfig = {
  fetchMeta: (url: string) => Promise<MetaResult>;
  cacheThumbnail: (cacheId: string, sourceUrl: string) => Promise<string | null>;
  getCacheId: (url: string) => string | null;
};

const INSTAGRAM_ENRICH: EnrichConfig = {
  fetchMeta: fetchInstagramMeta,
  cacheThumbnail: cacheInstagramThumbnail,
  getCacheId: getInstagramMediaId,
};

const TIKTOK_ENRICH: EnrichConfig = {
  fetchMeta: fetchTikTokMeta,
  cacheThumbnail: cacheTikTokThumbnail,
  getCacheId: getTikTokCacheId,
};

const ENRICH_CONCURRENCY = 5;

function passthroughResult(row: Row): BetaLinkResult {
  return {
    climbUuid: row.climbUuid,
    link: row.link,
    foreignUsername: row.foreignUsername,
    angle: row.angle,
    thumbnail: isOurS3Url(row.thumbnail) ? row.thumbnail : null,
    isListed: row.isListed,
    createdAt: row.createdAt,
  };
}

async function persistEnriched(row: Row, persistedThumbnail: string | null, newUsername: string | null): Promise<void> {
  const needsDbUpdate =
    (persistedThumbnail && persistedThumbnail !== row.thumbnail) ||
    (newUsername && newUsername !== row.foreignUsername);
  if (!needsDbUpdate) return;
  try {
    await db
      .update(dbSchema.boardBetaLinks)
      .set({
        thumbnail: persistedThumbnail ?? row.thumbnail,
        foreignUsername: newUsername,
      })
      .where(
        and(
          eq(dbSchema.boardBetaLinks.boardType, row.boardType),
          eq(dbSchema.boardBetaLinks.climbUuid, row.climbUuid),
          eq(dbSchema.boardBetaLinks.link, row.link),
        ),
      );
  } catch (err) {
    console.error('[BetaLinks] Failed to persist enriched metadata:', err);
  }
}

/**
 * Fetch live metadata + (re)cache the thumbnail to S3 if available, falling
 * back to the dev proxy. The same control flow applies to Instagram and
 * TikTok — only the platform-specific helpers passed in `cfg` differ.
 *
 * Resilience contract: once we have our own cached thumbnail for a row, the
 * UI must keep rendering it regardless of what Instagram/TikTok does. We
 * never null out a cached thumbnail because of a transient error or a
 * `gone` heuristic miss — those signals can flap when IG rate-limits us or
 * serves a login wall.
 */
async function enrichRow(row: Row, cfg: EnrichConfig): Promise<BetaLinkResult | null> {
  const haveCachedThumbnail = isOurS3Url(row.thumbnail);

  // Short-circuit: once we've cached the thumbnail we have everything we
  // need to render the slider — the live fetch would only refresh the
  // username, which is presentational. Skipping the fetch avoids an
  // open-ended refetch loop for rows that get stuck on `gone` (false
  // positives during IG login-wall responses) and rows whose meta lookup
  // never returns a username, since `gone` and `transient_error` carry no
  // username and `persistEnriched` would have nothing to write either.
  if (haveCachedThumbnail) {
    return {
      climbUuid: row.climbUuid,
      link: row.link,
      foreignUsername: row.foreignUsername,
      angle: row.angle,
      thumbnail: row.thumbnail,
      isListed: row.isListed,
      createdAt: row.createdAt,
    };
  }

  const meta = await cfg.fetchMeta(row.link);

  if (meta.status === 'gone') {
    // No cached thumbnail to fall back on — drop the row.
    return null;
  }

  if (meta.status === 'transient_error') {
    // No cached thumbnail; passthroughResult will return thumbnail: null but
    // keeps the row visible in the slider with whatever metadata we have.
    return passthroughResult(row);
  }

  // haveCachedThumbnail is necessarily false past the short-circuit above —
  // we only reach this branch on a fresh row whose meta lookup returned ok.
  const cacheId = cfg.getCacheId(row.link);
  let thumbnail: string | null = null;
  let persistedThumbnail: string | null = null;

  if (isS3Configured() && cacheId) {
    thumbnail = await cfg.cacheThumbnail(cacheId, meta.thumbnail);
    persistedThumbnail = thumbnail;
  } else if (!isS3Configured()) {
    thumbnail = getDevProxyThumbnailUrl(meta.thumbnail);
  }

  const newUsername = row.foreignUsername ?? meta.username;
  await persistEnriched(row, persistedThumbnail, newUsername);

  return {
    climbUuid: row.climbUuid,
    link: row.link,
    foreignUsername: newUsername,
    angle: row.angle,
    thumbnail,
    isListed: row.isListed,
    createdAt: row.createdAt,
  };
}

/**
 * Tiny semaphore so a climb with 50+ beta links doesn't fan out 50+
 * concurrent outbound HTTP fetches. The TTL caches in instagram-meta /
 * tiktok-meta absorb most of the pressure once the cache is warm; this
 * just keeps cold-cache batches from saturating the socket pool.
 */
function makeLimiter(concurrency: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = (): void => {
    if (active >= concurrency) return;
    const release = queue.shift();
    if (release) {
      active++;
      release();
    }
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      next();
    });
    try {
      return await task();
    } finally {
      active--;
      next();
    }
  };
}

async function enrichRowSafe(row: Row): Promise<BetaLinkResult | null> {
  if (isKayaClimbUrl(row.link)) return null;
  if (isInstagramUrl(row.link)) return enrichRow(row, INSTAGRAM_ENRICH);
  if (isTikTokUrl(row.link)) return enrichRow(row, TIKTOK_ENRICH);
  // Unknown platform: serve only an already-cached thumbnail (don't hot-link
  // an arbitrary URL).
  return passthroughResult(row);
}

export const betaLinkQueries = {
  betaLinks: async (
    _: unknown,
    { boardType, climbUuid }: { boardType: string; climbUuid: string },
  ): Promise<BetaLinkResult[]> => {
    const rows = await db
      .select()
      .from(dbSchema.boardBetaLinks)
      .where(and(eq(dbSchema.boardBetaLinks.boardType, boardType), eq(dbSchema.boardBetaLinks.climbUuid, climbUuid)));

    const limit = makeLimiter(ENRICH_CONCURRENCY);
    const enriched = await Promise.all(rows.map((row) => limit(() => enrichRowSafe(row))));

    return enriched.filter((r): r is BetaLinkResult => r !== null);
  },

  // Powers the home-screen "Fresh beta" slider. We deliberately read only
  // pre-cached rows here — fanning out the live IG/TikTok enrichment in
  // `betaLinks` across the whole table is the failure mode this resolver
  // exists to avoid.
  //
  // Window function caps rows per `foreign_username` at HOME_PER_USER_CAP so
  // a single climber's burst upload can't dominate the strip. Rows with a
  // NULL foreign_username are uncapped (per product direction — the dedup
  // problem is the known-handle case).
  recentBetaLinks: async (
    _: unknown,
    { limit, boardType }: { limit?: number | null; boardType?: string | null },
  ): Promise<RecentBetaLinkResult[]> => {
    const cappedLimit = Math.min(Math.max(limit ?? RECENT_BETA_LINKS_DEFAULT_LIMIT, 1), RECENT_BETA_LINKS_MAX_LIMIT);
    const boardFilter = boardType ?? null;

    const result = await db.execute<{
      board_type: string;
      climb_uuid: string;
      link: string;
      foreign_username: string | null;
      angle: number | null;
      thumbnail: string | null;
      is_listed: boolean | null;
      created_at: string | null;
      climb_name: string | null;
    }>(sql`
      WITH ranked AS (
        SELECT
          bl.board_type,
          bl.climb_uuid,
          bl.link,
          bl.foreign_username,
          bl.angle,
          bl.thumbnail,
          bl.is_listed,
          bl.created_at,
          bc.name AS climb_name,
          ROW_NUMBER() OVER (
            PARTITION BY bl.foreign_username
            ORDER BY bl.created_at DESC
          ) AS user_rank
        FROM ${dbSchema.boardBetaLinks} bl
        LEFT JOIN ${dbSchema.boardClimbs} bc
          ON bc.board_type = bl.board_type AND bc.uuid = bl.climb_uuid
        WHERE bl.is_listed = true
          AND bl.thumbnail IS NOT NULL
          AND bl.thumbnail LIKE ${`${STATIC_THUMBNAIL_PREFIX}%`}
          AND (${boardFilter}::text IS NULL OR bl.board_type = ${boardFilter})
      )
      SELECT board_type, climb_uuid, link, foreign_username, angle, thumbnail, is_listed, created_at, climb_name
      FROM ranked
      WHERE foreign_username IS NULL OR user_rank <= ${HOME_PER_USER_CAP}
      ORDER BY created_at DESC
      LIMIT ${cappedLimit}
    `);

    // Different postgres drivers shape db.execute output differently —
    // normalise to a plain array. Matches the pattern in
    // resolvers/playlists/queries/smart-playlists.ts.
    const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) ?? [];

    return (
      rows as Array<{
        board_type: string;
        climb_uuid: string;
        link: string;
        foreign_username: string | null;
        angle: number | null;
        thumbnail: string | null;
        is_listed: boolean | null;
        created_at: string | null;
        climb_name: string | null;
      }>
    )
      .filter((r) => !isKayaClimbUrl(r.link))
      .map((r) => ({
        betaLink: {
          climbUuid: r.climb_uuid,
          link: r.link,
          foreignUsername: r.foreign_username,
          angle: r.angle,
          thumbnail: isOurS3Url(r.thumbnail) ? r.thumbnail : null,
          isListed: r.is_listed,
          createdAt: r.created_at,
        },
        climbName: r.climb_name,
        boardType: r.board_type,
      }));
  },

  // Powers the profile-page "Their beta" slider. Returns videos this user
  // either added (created_by_user_id match) OR posted under the IG handle
  // parsed from their userProfiles.instagramUrl. The OR semantics also
  // surface videos someone else uploaded that point at this user's IG —
  // intentional. Pre-cached thumbnails only; no live enrichment.
  userBetaLinks: async (
    _: unknown,
    { userId, limit }: { userId: string; limit?: number | null },
  ): Promise<RecentBetaLinkResult[]> => {
    const cappedLimit = Math.min(Math.max(limit ?? USER_BETA_LINKS_DEFAULT_LIMIT, 1), USER_BETA_LINKS_MAX_LIMIT);

    // Look up the user's IG handle from their profile, if set. Independent
    // query so we don't pay the cost of a second join when no profile row
    // exists.
    const profileRows = await db
      .select({ instagramUrl: dbSchema.userProfiles.instagramUrl })
      .from(dbSchema.userProfiles)
      .where(eq(dbSchema.userProfiles.userId, userId))
      .limit(1);
    const igHandle = extractInstagramHandle(profileRows[0]?.instagramUrl ?? null);

    const rows = await db
      .select({ betaLink: dbSchema.boardBetaLinks, climbName: dbSchema.boardClimbs.name })
      .from(dbSchema.boardBetaLinks)
      .leftJoin(
        dbSchema.boardClimbs,
        and(
          eq(dbSchema.boardBetaLinks.boardType, dbSchema.boardClimbs.boardType),
          eq(dbSchema.boardBetaLinks.climbUuid, dbSchema.boardClimbs.uuid),
        ),
      )
      .where(
        and(
          eq(dbSchema.boardBetaLinks.isListed, true),
          isNotNull(dbSchema.boardBetaLinks.thumbnail),
          like(dbSchema.boardBetaLinks.thumbnail, `${STATIC_THUMBNAIL_PREFIX}%`),
          igHandle
            ? or(
                eq(dbSchema.boardBetaLinks.createdByUserId, userId),
                eq(dbSchema.boardBetaLinks.foreignUsername, igHandle),
              )
            : eq(dbSchema.boardBetaLinks.createdByUserId, userId),
        ),
      )
      .orderBy(desc(dbSchema.boardBetaLinks.createdAt))
      .limit(cappedLimit);

    return rows
      .filter((r) => !isKayaClimbUrl(r.betaLink.link))
      .map((r) => ({
        betaLink: passthroughResult(r.betaLink),
        climbName: r.climbName,
        boardType: r.betaLink.boardType,
      }));
  },
};
