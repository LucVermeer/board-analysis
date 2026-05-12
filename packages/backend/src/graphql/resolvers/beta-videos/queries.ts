import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { eq, and, desc, isNotNull, like } from 'drizzle-orm';
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
  recentBetaLinks: async (
    _: unknown,
    { limit, boardType }: { limit?: number | null; boardType?: string | null },
  ): Promise<RecentBetaLinkResult[]> => {
    const cappedLimit = Math.min(Math.max(limit ?? RECENT_BETA_LINKS_DEFAULT_LIMIT, 1), RECENT_BETA_LINKS_MAX_LIMIT);

    // LEFT JOIN: beta links can land before their climb during sync, and we
    // still want them in the slider — UI tolerates a null climbName.
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
          boardType ? eq(dbSchema.boardBetaLinks.boardType, boardType) : undefined,
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
