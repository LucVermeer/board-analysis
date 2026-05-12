import {
  BETA_VIDEO_URL_VALIDATION_MESSAGE,
  getInstagramMediaId,
  getTikTokVideoId,
  isBetaVideoUrl,
  isInstagramUrl,
  isTikTokUrl,
} from '@boardsesh/shared-schema';
import type { BetaLink } from '@/app/lib/api-wrappers/sync-api-types';
import { getBackendHttpUrl } from '@/app/lib/backend-url';

export { BETA_VIDEO_URL_VALIDATION_MESSAGE, isBetaVideoUrl, isInstagramUrl, isTikTokUrl };

/**
 * Beta thumbnails are served by the backend's `/static/beta-link-thumbnails/...`
 * handler, which streams the cached image from S3. The GraphQL resolver
 * persists and returns the path as a backend-relative URL so the same value
 * works in same-origin deploys; in split-domain deploys (web + backend on
 * different hosts, see `getBackendHttpUrl`) we need to prepend the backend
 * origin so the browser actually hits the backend instead of 404-ing
 * against the frontend host.
 */
function absolutizeThumbnail(thumbnail: string | null): string | null {
  if (!thumbnail || !thumbnail.startsWith('/')) return thumbnail;
  const backendBase = getBackendHttpUrl();
  if (!backendBase) return thumbnail;
  // Defensive: getBackendHttpUrl strips a trailing slash today, but normalize
  // here too so a future change to its return shape can't produce
  // `https://host//static/...` which would 404.
  return `${backendBase.replace(/\/+$/, '')}${thumbnail}`;
}

/**
 * Stable identity used to dedupe beta links that point at the same video,
 * even when their URLs differ in tracking params or host. Prefer the platform
 * media id; fall back to the raw URL for unrecognised hosts.
 */
function betaLinkIdentity(url: string): string {
  const instagramId = getInstagramMediaId(url);
  if (instagramId) return `instagram:${instagramId}`;
  const tiktokId = getTikTokVideoId(url);
  if (tiktokId) return `tiktok:${tiktokId}`;
  return `raw:${url}`;
}

export function dedupeBetaLinks(betaLinks: BetaLink[]): BetaLink[] {
  const dedupedLinks: BetaLink[] = [];
  const indexByIdentity = new Map<string, number>();

  for (const betaLink of betaLinks) {
    const identity = betaLinkIdentity(betaLink.link);
    const existingIndex = indexByIdentity.get(identity);

    if (existingIndex === undefined) {
      indexByIdentity.set(identity, dedupedLinks.length);
      dedupedLinks.push(betaLink);
      continue;
    }

    const existing = dedupedLinks[existingIndex];
    dedupedLinks[existingIndex] = {
      ...existing,
      foreign_username: existing.foreign_username ?? betaLink.foreign_username,
      angle: existing.angle ?? betaLink.angle,
      thumbnail: existing.thumbnail ?? betaLink.thumbnail,
      created_at: existing.created_at || betaLink.created_at,
    };
  }

  return dedupedLinks;
}

/**
 * Maps the GraphQL `betaLinks` response into the `BetaLink` shape used by
 * the rest of the web app. Used by both `BoardseshBetaList` and the IG
 * post dialog.
 */
export type BetaLinksGqlRow = {
  climbUuid: string;
  link: string;
  foreignUsername: string | null;
  angle: number | null;
  thumbnail: string | null;
  isListed: boolean | null;
  createdAt: string | null;
};

export function mapBetaLinkRow(row: BetaLinksGqlRow): BetaLink {
  return {
    climb_uuid: row.climbUuid,
    link: row.link,
    foreign_username: row.foreignUsername,
    angle: row.angle,
    thumbnail: absolutizeThumbnail(row.thumbnail),
    is_listed: row.isListed ?? false,
    created_at: row.createdAt ?? '',
  };
}

export function mapBetaLinksResponse(rows: BetaLinksGqlRow[]): BetaLink[] {
  return rows.map(mapBetaLinkRow);
}
