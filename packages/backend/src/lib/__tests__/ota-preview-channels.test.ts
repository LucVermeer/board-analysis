import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildLivePreviewChannels,
  parsePreviewPrNumber,
  getLivePreviewChannels,
  resetLivePreviewChannelsCache,
  type GitHubDeployment,
  type GitHubOpenPullRequest,
} from '../ota-preview-channels';

describe('parsePreviewPrNumber', () => {
  it('extracts the PR number from the workflow deployment description', () => {
    expect(parsePreviewPrNumber('OTA preview pr-3253')).toBe(3253);
  });

  it('returns null for a description without a pr-<n> channel', () => {
    expect(parsePreviewPrNumber('OTA preview production')).toBeNull();
    expect(parsePreviewPrNumber(null)).toBeNull();
    expect(parsePreviewPrNumber(undefined)).toBeNull();
  });
});

describe('buildLivePreviewChannels', () => {
  const openPr = (number: number, title: string): GitHubOpenPullRequest => ({
    number,
    title,
    html_url: `https://github.com/boardsesh/boardsesh/pull/${number}`,
  });
  const deployment = (prNumber: number): GitHubDeployment => ({ description: `OTA preview pr-${prNumber}` });

  it('returns only open PRs that have a published preview deployment, newest first', () => {
    const deployments = [deployment(10), deployment(20), deployment(5)];
    const openPullRequests = [openPr(20, 'Twenty'), openPr(10, 'Ten'), openPr(99, 'No preview yet')];

    expect(buildLivePreviewChannels(deployments, openPullRequests)).toEqual([
      { channel: 'pr-20', prNumber: 20, title: 'Twenty', url: 'https://github.com/boardsesh/boardsesh/pull/20' },
      { channel: 'pr-10', prNumber: 10, title: 'Ten', url: 'https://github.com/boardsesh/boardsesh/pull/10' },
    ]);
  });

  it('excludes channels whose PR is no longer open (channel torn down on close)', () => {
    // PR 5 had a preview but is closed → not in the open list → excluded.
    const result = buildLivePreviewChannels([deployment(5)], [openPr(10, 'Ten')]);
    expect(result).toEqual([]);
  });

  it('ignores non-preview deployments and dedups repeated publishes', () => {
    const deployments = [{ description: 'OTA preview production' }, deployment(10), deployment(10)];
    const result = buildLivePreviewChannels(deployments, [openPr(10, 'Ten')]);
    expect(result).toHaveLength(1);
    expect(result[0].channel).toBe('pr-10');
  });

  it('returns an empty list when nothing has been deployed', () => {
    expect(buildLivePreviewChannels([], [openPr(10, 'Ten')])).toEqual([]);
  });
});

describe('getLivePreviewChannels (cache + network)', () => {
  beforeEach(() => resetLivePreviewChannelsCache());
  afterEach(() => vi.restoreAllMocks());

  // Returns deployments for the deployments URL, open PRs for the pulls URL.
  const mockGitHubOk = (deployments: unknown, pulls: unknown) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
      const body = url.includes('/deployments') ? deployments : pulls;
      return new Response(JSON.stringify(body), { status: 200 });
    });

  const sample = {
    deployments: [{ description: 'OTA preview pr-7' }],
    pulls: [{ number: 7, title: 'Seven', html_url: 'https://github.com/boardsesh/boardsesh/pull/7' }],
  };

  it('fetches, builds, and serves from cache within the TTL (one refill)', async () => {
    const fetchSpy = mockGitHubOk(sample.deployments, sample.pulls);

    const first = await getLivePreviewChannels(0);
    expect(first).toEqual([
      { channel: 'pr-7', prNumber: 7, title: 'Seven', url: 'https://github.com/boardsesh/boardsesh/pull/7' },
    ]);

    // Within the TTL → served from cache, no new fetch.
    const second = await getLivePreviewChannels(1_000);
    expect(second).toBe(first);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // one refill = deployments + pulls
  });

  it('refetches once the cache TTL elapses', async () => {
    const fetchSpy = mockGitHubOk(sample.deployments, sample.pulls);
    await getLivePreviewChannels(0);
    await getLivePreviewChannels(3 * 60 * 1000 + 1); // past CACHE_TTL_MS
    expect(fetchSpy).toHaveBeenCalledTimes(4); // two refills
  });

  it('negative-caches [] on error so a burst does not re-hit GitHub', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rate limited', { status: 403 }));

    await expect(getLivePreviewChannels(0)).rejects.toThrow();
    // Within the (shorter) error TTL → cached [], no further fetches.
    await expect(getLivePreviewChannels(1_000)).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // only the first refill attempt
  });

  it('de-dupes concurrent refills onto a single fetch', async () => {
    const fetchSpy = mockGitHubOk(sample.deployments, sample.pulls);
    const [a, b] = await Promise.all([getLivePreviewChannels(0), getLivePreviewChannels(0)]);
    expect(a).toEqual(b);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // one shared refill, not two
  });
});
