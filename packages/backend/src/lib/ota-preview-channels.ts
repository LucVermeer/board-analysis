// Lists the live per-PR OTA preview channels (`pr-<number>`) so the mobile app
// can show them by PR title in the in-app channel switcher. See
// docs/mobile-ota-updates.md.
//
// Source of truth = the GitHub "pr-preview" Deployments the
// .github/workflows/mobile-ota-preview.yml workflow writes (one per publish,
// described `OTA preview pr-<n>`). Intersecting those with the still-open PRs
// gives the channels that are actually live: closing a PR tears its channel
// down, so an open PR with a published preview is the precise "live" signal.
//
// The pure builder (buildLivePreviewChannels) is unit-tested; the fetch wrapper
// caches the result so a single backend funnelling every client stays well
// under GitHub's rate limits with just two API calls per refill.

import type { OtaPreviewChannel } from '@boardsesh/shared-schema';
import { logger } from '../utils/logger';

const GITHUB_API = 'https://api.github.com';
// owner/repo to read previews from. Overridable for forks/self-hosting.
const REPO = process.env.OTA_PREVIEW_REPO ?? 'boardsesh/boardsesh';
const PREVIEW_ENVIRONMENT = 'pr-preview';
const PAGE_SIZE = 100;
const CACHE_TTL_MS = 3 * 60 * 1000;
// Brief negative cache so a GitHub error (e.g. a 403 rate-limit) can't amplify
// into a request storm — callers serve [] from cache until this elapses, then
// one refill retries.
const ERROR_CACHE_TTL_MS = 30 * 1000;

// The deployment description the workflow sets is `OTA preview pr-<n>`; match
// the channel anywhere in it so a wording tweak doesn't silently break parsing.
const CHANNEL_PATTERN = /\bpr-(\d+)\b/;

export type GitHubDeployment = { description: string | null };
export type GitHubOpenPullRequest = { number: number; title: string; html_url: string };

/** Extract the PR number from a `pr-preview` deployment description, or null. */
export function parsePreviewPrNumber(description: string | null | undefined): number | null {
  const match = description ? CHANNEL_PATTERN.exec(description) : null;
  return match ? Number(match[1]) : null;
}

/**
 * A channel is live when its PR is still open (closing tears the channel down)
 * AND a `pr-preview` deployment was published for it. Newest PR first.
 */
export function buildLivePreviewChannels(
  deployments: GitHubDeployment[],
  openPullRequests: GitHubOpenPullRequest[],
): OtaPreviewChannel[] {
  const deployedPrNumbers = new Set<number>();
  for (const deployment of deployments) {
    const prNumber = parsePreviewPrNumber(deployment.description);
    if (prNumber != null) deployedPrNumbers.add(prNumber);
  }

  return openPullRequests
    .filter((pullRequest) => deployedPrNumbers.has(pullRequest.number))
    .sort((first, second) => second.number - first.number)
    .map((pullRequest) => ({
      channel: `pr-${pullRequest.number}`,
      prNumber: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.html_url,
    }));
}

async function githubGet<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'boardsesh-backend',
  };
  // Optional — unauthenticated works on the public repo (the two-call shape +
  // cache keeps us under the 60/hr anon ceiling); a token raises it to 5000/hr.
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${GITHUB_API}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub ${path} responded ${response.status}`);
  }
  return (await response.json()) as T;
}

type ChannelCache = { at: number; data: OtaPreviewChannel[]; isError: boolean };
let cache: ChannelCache | null = null;
// De-dupes concurrent refills (cold start / just-expired) onto a single fetch so
// a burst can't fan out into parallel GitHub calls.
let inFlight: Promise<OtaPreviewChannel[]> | null = null;

/**
 * Live preview channels, cached for {@link CACHE_TTL_MS} (or {@link
 * ERROR_CACHE_TTL_MS} after a failure). Two GitHub calls per refill regardless
 * of how many channels exist. The caller is responsible for fail-soft behaviour
 * (the resolver returns [] on throw).
 */
export async function getLivePreviewChannels(now: number = Date.now()): Promise<OtaPreviewChannel[]> {
  const ttl = cache?.isError ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
  if (cache && now - cache.at < ttl) return cache.data;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const [deployments, openPullRequests] = await Promise.all([
        githubGet<GitHubDeployment[]>(
          `/repos/${REPO}/deployments?environment=${PREVIEW_ENVIRONMENT}&per_page=${PAGE_SIZE}`,
        ),
        githubGet<GitHubOpenPullRequest[]>(`/repos/${REPO}/pulls?state=open&per_page=${PAGE_SIZE}`),
      ]);
      // Deployments accumulate over time (closed PRs are marked inactive, not
      // deleted), so a single page can eventually overflow — surface it rather
      // than silently dropping older-but-still-open previews.
      if (deployments.length === PAGE_SIZE || openPullRequests.length === PAGE_SIZE) {
        logger.warn(
          `[ota] preview channel source hit the ${PAGE_SIZE}-item page cap; some live channels may be missing`,
        );
      }
      const data = buildLivePreviewChannels(deployments, openPullRequests);
      cache = { at: now, data, isError: false };
      return data;
    } catch (error) {
      // Negative-cache [] briefly so repeated calls don't re-hit a rate-limited
      // GitHub; recovers after ERROR_CACHE_TTL_MS. Rethrow so the resolver logs.
      cache = { at: now, data: [], isError: true };
      throw error;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Test-only: reset the module cache between cases. */
export function resetLivePreviewChannelsCache(): void {
  cache = null;
  inFlight = null;
}
