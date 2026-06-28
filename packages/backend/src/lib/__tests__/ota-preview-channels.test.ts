import { describe, expect, it } from 'vitest';
import {
  buildLivePreviewChannels,
  parsePreviewPrNumber,
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
