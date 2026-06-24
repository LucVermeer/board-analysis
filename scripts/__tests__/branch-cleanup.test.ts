import { describe, it, expect } from 'vitest';
import { selectBranchesToDelete, isProtected, type MergedPr } from '../lib/branch-cleanup';

// Mirror how the CLI composes the protected list: a static set, plus the resolved
// default branch appended at runtime. `main` is NOT in the static set — it is only
// protected because the default branch gets added. The tests below assert both
// halves of that contract so a refactor dropping the dynamic add fails here.
const DEFAULT_BRANCH = 'main';
const STATIC_PROTECTED_NAMES = ['master', 'gh-pages', 'production', 'staging'];
const PROTECTED_NAMES = [...STATIC_PROTECTED_NAMES, DEFAULT_BRANCH];
const PROTECTED_PREFIXES = ['pr-screenshots/', 'dependabot/', 'renovate/', 'release/'];

function merged(number: number, headRefName: string, mergedAt: string, headRefOid: string): MergedPr {
  return { number, headRefName, mergedAt, headRefOid };
}

describe('isProtected', () => {
  it('matches exact protected names', () => {
    expect(isProtected('master', PROTECTED_NAMES, PROTECTED_PREFIXES)).toBe(true);
    expect(isProtected('gh-pages', PROTECTED_NAMES, PROTECTED_PREFIXES)).toBe(true);
  });

  it('protects the default branch only once it is appended (not statically)', () => {
    expect(isProtected('main', STATIC_PROTECTED_NAMES, PROTECTED_PREFIXES)).toBe(false);
    expect(isProtected('main', PROTECTED_NAMES, PROTECTED_PREFIXES)).toBe(true);
  });

  it('matches protected prefixes', () => {
    expect(isProtected('dependabot/npm/lodash', PROTECTED_NAMES, PROTECTED_PREFIXES)).toBe(true);
    expect(isProtected('pr-screenshots/42', PROTECTED_NAMES, PROTECTED_PREFIXES)).toBe(true);
  });

  it('leaves ordinary branches unprotected', () => {
    expect(isProtected('feat/add-thing', PROTECTED_NAMES, PROTECTED_PREFIXES)).toBe(false);
    // A name that merely contains a protected word but does not match exactly.
    expect(isProtected('my-production-fix', PROTECTED_NAMES, PROTECTED_PREFIXES)).toBe(false);
  });
});

describe('selectBranchesToDelete', () => {
  const base = {
    protectedNames: PROTECTED_NAMES,
    protectedPrefixes: PROTECTED_PREFIXES,
  };

  it('marks a merged-PR branch whose tip is unchanged as eligible', () => {
    const result = selectBranchesToDelete({
      ...base,
      remoteBranches: { 'feat/done': 'abc123' },
      mergedPrs: [merged(10, 'feat/done', '2026-06-01T00:00:00Z', 'abc123')],
      openHeads: [],
    });
    expect(result.eligible).toEqual([{ branch: 'feat/done', prNumber: 10, mergedAt: '2026-06-01T00:00:00Z' }]);
    expect(result.keptOpen).toEqual([]);
    expect(result.keptNoMergedPr).toEqual([]);
    expect(result.keptDiverged).toEqual([]);
  });

  it('keeps a branch reused for new work after its PR merged (tip moved past merged head)', () => {
    const result = selectBranchesToDelete({
      ...base,
      remoteBranches: { 'feat/reused': 'newsha999' },
      mergedPrs: [merged(10, 'feat/reused', '2026-06-01T00:00:00Z', 'oldsha111')],
      openHeads: [],
    });
    expect(result.eligible).toEqual([]);
    expect(result.keptDiverged).toEqual(['feat/reused']);
  });

  it('keeps a branch that still has an open PR even if a merged PR shares the name', () => {
    const result = selectBranchesToDelete({
      ...base,
      remoteBranches: { 'feat/reused': 'abc123' },
      mergedPrs: [merged(10, 'feat/reused', '2026-06-01T00:00:00Z', 'abc123')],
      openHeads: ['feat/reused'],
    });
    expect(result.eligible).toEqual([]);
    expect(result.keptOpen).toEqual(['feat/reused']);
  });

  it('keeps a branch with no merged PR (experiments, renamed branches)', () => {
    const result = selectBranchesToDelete({
      ...base,
      remoteBranches: { add_esphome_stuff: 'abc123' },
      mergedPrs: [],
      openHeads: [],
    });
    expect(result.eligible).toEqual([]);
    expect(result.keptNoMergedPr).toEqual(['add_esphome_stuff']);
  });

  it('never deletes protected branches, even with a merged PR of the same name', () => {
    const result = selectBranchesToDelete({
      ...base,
      remoteBranches: { main: 'abc123', 'dependabot/npm/lodash': 'def456' },
      mergedPrs: [
        merged(1, 'main', '2026-06-01T00:00:00Z', 'abc123'),
        merged(2, 'dependabot/npm/lodash', '2026-06-02T00:00:00Z', 'def456'),
      ],
      openHeads: [],
    });
    expect(result.eligible).toEqual([]);
    expect(result.keptProtected.sort()).toEqual(['dependabot/npm/lodash', 'main']);
  });

  it('ignores merged PRs whose head is not an actual remote branch (deleted/cross-repo forks)', () => {
    const result = selectBranchesToDelete({
      ...base,
      // Only `feat/live` exists on origin. The fork PR's `patch-1` head and the
      // already-deleted `already-gone` head have no remote branch, so they can
      // never select anything.
      remoteBranches: { 'feat/live': 'live000' },
      mergedPrs: [
        merged(10, 'feat/live', '2026-06-01T00:00:00Z', 'live000'),
        merged(11, 'patch-1', '2026-06-02T00:00:00Z', 'fork111'),
        merged(12, 'already-gone', '2026-06-03T00:00:00Z', 'gone222'),
      ],
      openHeads: [],
    });
    expect(result.eligible).toEqual([{ branch: 'feat/live', prNumber: 10, mergedAt: '2026-06-01T00:00:00Z' }]);
  });

  it('keeps the newest merged PR per reused branch name and sorts oldest-merge first', () => {
    const result = selectBranchesToDelete({
      ...base,
      remoteBranches: { 'feat/a': 'sha-a2', 'feat/b': 'sha-b1' },
      mergedPrs: [
        merged(1, 'feat/a', '2026-06-05T00:00:00Z', 'sha-a1'),
        merged(2, 'feat/a', '2026-06-10T00:00:00Z', 'sha-a2'), // newer reuse of the same name wins
        merged(3, 'feat/b', '2026-06-01T00:00:00Z', 'sha-b1'),
      ],
      openHeads: [],
    });
    expect(result.eligible).toEqual([
      { branch: 'feat/b', prNumber: 3, mergedAt: '2026-06-01T00:00:00Z' },
      { branch: 'feat/a', prNumber: 2, mergedAt: '2026-06-10T00:00:00Z' },
    ]);
  });
});
