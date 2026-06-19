/// <reference types="node" />

/**
 * Generates packages/mobile/src/data/changelog.generated.json — the entries
 * shown on the mobile "What's New" screen. Each entry is one merged PR that
 * carries a non-empty `## Release Notes` section in its description (the copy the
 * author wrote for users). Category is derived from the PR title's
 * Conventional-Commit type.
 *
 * Crawls merged PRs against `main` via paginated `gh api graphql` (public data,
 * works with the default Actions token). Bounded by a START date so history stays
 * small — only PRs merged on/after that date can carry Release Notes anyway.
 *
 * Degrades gracefully: if a fetch fails (offline, `gh` missing, unauthenticated)
 * the existing committed JSON is kept and the script still exits 0, so it never
 * breaks an OTA publish or CI run. `generatedAt` only moves when the entries
 * actually change, keeping the committed file churn-free.
 *
 * Usage:
 *   vp run generate:changelog          # regenerate and write
 *   vp run check:changelog             # exit non-zero if the committed file is stale
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEntries, isContentEqual, type ChangelogData, type RawPullRequest } from './lib/changelog-transform';

const REPO_OWNER = 'boardsesh';
const REPO_NAME = 'boardsesh';

// Only crawl PRs merged on/after this date. This feature ships with this date,
// so no earlier PR carries a `## Release Notes` section — crawling further back
// would only burn API pages on PRs that can't produce an entry. Bump cautiously;
// never set it before the feature landed.
const CRAWL_START_DATE = '2026-06-01T00:00:00.000Z';

const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(here, '../packages/mobile/src/data/changelog.generated.json');

const isCheckMode = process.argv.includes('--check');

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function readExisting(): ChangelogData {
  try {
    return JSON.parse(readFileSync(OUTPUT_PATH, 'utf8')) as ChangelogData;
  } catch {
    return { generatedAt: '', entries: [] };
  }
}

// Merged PRs against main, newest-updated first so the crawl can stop early once
// it pages past the cutoff. labels(first:20) covers the skip-changelog opt-out.
const MERGED_PRS_QUERY = `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: MERGED, baseRefName: "main", first: 100, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        body
        mergedAt
        updatedAt
        url
        labels(first: 20) { nodes { name } }
      }
    }
  }
}`;

type RawPrNode = {
  number: number;
  title: string;
  body: string | null;
  mergedAt: string | null;
  updatedAt: string | null;
  url: string;
  labels?: { nodes?: { name?: string }[] };
};
type PrConnection = {
  pageInfo?: { hasNextPage?: boolean; endCursor?: string };
  nodes?: RawPrNode[];
};

function fetchMergedPullRequests(): RawPullRequest[] | null {
  const cutoff = new Date(CRAWL_START_DATE).getTime();
  const pullRequests: RawPullRequest[] = [];
  let cursor: string | null = null;
  try {
    // Hard page cap so a pagination bug can never loop forever (matches
    // fetch-acknowledgements.ts). 200 pages × 100 = 20k PRs, far beyond the
    // date-bounded window we ever expect to read.
    for (let page = 0; page < 200; page += 1) {
      const args = [
        'api',
        'graphql',
        '-f',
        `query=${MERGED_PRS_QUERY}`,
        '-f',
        `owner=${REPO_OWNER}`,
        '-f',
        `name=${REPO_NAME}`,
      ];
      if (cursor) args.push('-f', `cursor=${cursor}`);
      const response = JSON.parse(gh(args)) as { data?: { repository?: { pullRequests?: PrConnection } } };
      const connection = response.data?.repository?.pullRequests;
      if (!connection) break;

      for (const node of connection.nodes ?? []) {
        pullRequests.push({
          number: node.number,
          title: node.title,
          body: node.body,
          mergedAt: node.mergedAt,
          url: node.url,
          labels: (node.labels?.nodes ?? []).map((label) => label.name ?? '').filter(Boolean),
        });
      }

      // Stop paging once we've crossed the cutoff. Break on the field we ORDER BY
      // (updatedAt), not mergedAt: a PR merged after the cutoff always has
      // updatedAt >= mergedAt > cutoff, so once a page's OLDEST updatedAt is
      // before the cutoff, no later page (lower updatedAt) can hold a PR merged
      // after it. Breaking on mergedAt instead would let a page of recently
      // relabeled old PRs cut the crawl short and silently drop newer merges.
      const oldestUpdatedOnPage = (connection.nodes ?? [])
        .map((node) => (node.updatedAt ? new Date(node.updatedAt).getTime() : Number.POSITIVE_INFINITY))
        .reduce((min, current) => Math.min(min, current), Number.POSITIVE_INFINITY);
      if (Number.isFinite(oldestUpdatedOnPage) && oldestUpdatedOnPage < cutoff) break;

      if (!connection.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
      cursor = connection.pageInfo.endCursor;
    }
  } catch (error) {
    console.warn(`[changelog] PR fetch failed, keeping existing file: ${String(error)}`);
    return null;
  }

  // Drop anything merged before the cutoff (a page can straddle it).
  return pullRequests.filter(
    (pullRequest) => pullRequest.mergedAt !== null && new Date(pullRequest.mergedAt).getTime() >= cutoff,
  );
}

function main(): void {
  const existing = readExisting();
  const pullRequests = fetchMergedPullRequests();

  // Graceful degradation: a fetch failure keeps the committed snapshot untouched
  // (in --check this is a no-op pass, never a false failure on offline runs).
  if (pullRequests === null) {
    if (isCheckMode) {
      console.log('[changelog] fetch unavailable; skipping drift check.');
    } else {
      console.log('[changelog] fetch unavailable; kept existing committed file.');
    }
    return;
  }

  const entries = buildEntries(pullRequests);
  const candidate: ChangelogData = { generatedAt: existing.generatedAt, entries };
  const entriesUnchanged = isContentEqual(candidate, existing);

  if (isCheckMode) {
    // Compare entries only: the committed seed ships with an empty `generatedAt`,
    // so a matching-but-unstamped snapshot is up to date, not stale.
    if (entriesUnchanged) {
      console.log(`[changelog] up to date (${entries.length} entries).`);
      return;
    }
    console.error(
      '[changelog] committed changelog.generated.json is stale. Run `vp run generate:changelog` and commit the result.',
    );
    process.exitCode = 1;
    return;
  }

  // Keep the timestamp stable when the entries are unchanged AND already stamped;
  // stamp a real time on the first write (the seed's `generatedAt` is empty).
  const generatedAt = entriesUnchanged && existing.generatedAt ? existing.generatedAt : new Date().toISOString();
  const data: ChangelogData = { generatedAt, entries };
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`[changelog] wrote ${entries.length} entries`);
}

main();
