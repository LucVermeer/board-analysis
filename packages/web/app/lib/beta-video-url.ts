import {
  BETA_VIDEO_URL_VALIDATION_MESSAGE,
  betaLinkIdentity as betaLinkIdentityShared,
  dedupeBetaLinks as dedupeBetaLinksShared,
  isBetaVideoUrl,
  isInstagramUrl,
  isTikTokUrl,
  mapBetaLinkRow as mapBetaLinkRowShared,
  mapBetaLinksResponse as mapBetaLinksResponseShared,
  type BetaLink,
  type BetaLinksGqlRow,
} from '@boardsesh/shared-schema';
import { getBackendHttpUrl } from '@/app/lib/backend-url';

export {
  BETA_VIDEO_URL_VALIDATION_MESSAGE,
  isBetaVideoUrl,
  isInstagramUrl,
  isTikTokUrl,
  betaLinkIdentityShared as betaLinkIdentity,
  dedupeBetaLinksShared as dedupeBetaLinks,
};
export type { BetaLink, BetaLinksGqlRow };

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

export function mapBetaLinkRow(row: BetaLinksGqlRow): BetaLink {
  return mapBetaLinkRowShared(row, absolutizeThumbnail);
}

export function mapBetaLinksResponse(rows: BetaLinksGqlRow[]): BetaLink[] {
  return mapBetaLinksResponseShared(rows, absolutizeThumbnail);
}
