/// <reference types="node" />

/**
 * Pure selection logic for the stale-branch cleanup. Given the branches on `origin`
 * (with their current tip commit) plus the merged and open PRs, decides which
 * branches are safe to delete.
 *
 * A branch is eligible only when ALL hold:
 *   - it is the head of a merged same-repo PR,
 *   - no open PR still uses that name,
 *   - its name (or prefix) is not protected,
 *   - its current tip still equals the commit that PR merged — so a branch that was
 *     reused for new work after its PR merged is kept, not silently dropped.
 *
 * Kept free of I/O so it's unit-testable without hitting GitHub (see
 * scripts/__tests__/branch-cleanup.test.ts). The shell that runs `gh`/`git` and
 * performs the actual deletion lives in scripts/cleanup-merged-branches.ts.
 */

/** A merged, same-repo PR — only the fields the selection needs. */
export type MergedPr = {
  number: number;
  /** The branch the PR was opened from (no `refs/heads/` prefix). */
  headRefName: string;
  /** PR merge time, ISO 8601. */
  mergedAt: string;
  /** Head commit oid at merge; the live ref still points here unless the branch was reused. */
  headRefOid: string;
};

export type SelectInput = {
  /** Branches on `origin`: name (no `refs/heads/` prefix) -> current tip commit oid. */
  remoteBranches: Record<string, string>;
  /** Merged same-repo PRs; the newest-merged one wins when a head name repeats. */
  mergedPrs: MergedPr[];
  /** Head names of currently-open same-repo PRs — never delete these. */
  openHeads: string[];
  /** Exact branch names that must never be deleted (e.g. the default branch). */
  protectedNames: string[];
  /** Branch-name prefixes that must never be deleted (e.g. `dependabot/`). */
  protectedPrefixes: string[];
};

export type EligibleBranch = {
  branch: string;
  prNumber: number;
  /** ISO 8601 merge time of the PR that retired this branch. */
  mergedAt: string;
};

export type SelectResult = {
  /** Safe to delete: a merged PR's head, no open PR, not protected, tip unchanged. */
  eligible: EligibleBranch[];
  /** Kept because an open PR still uses the branch. */
  keptOpen: string[];
  /** Kept because no merged same-repo PR matches the branch name. */
  keptNoMergedPr: string[];
  /** Kept because the name (or its prefix) is protected. */
  keptProtected: string[];
  /** Kept because the tip moved past the merged PR's head — likely reused for new work. */
  keptDiverged: string[];
};

/** True when `branch` matches a protected exact name or one of the protected prefixes. */
export function isProtected(branch: string, protectedNames: string[], protectedPrefixes: string[]): boolean {
  if (protectedNames.includes(branch)) return true;
  return protectedPrefixes.some((prefix) => branch.startsWith(prefix));
}

/**
 * Partition the remote branches into delete-eligible vs. the reasons each survivor
 * was kept. Protection is checked first (it always wins), then open PRs, then the
 * merged-PR lookup, then the tip-still-matches check. A branch with no merged
 * same-repo PR of the same name is left untouched — the conservative default for
 * experiments and renamed branches.
 */
export function selectBranchesToDelete(input: SelectInput): SelectResult {
  const { remoteBranches, mergedPrs, openHeads, protectedNames, protectedPrefixes } = input;

  // Newest-merged PR per head name. Branch names can be reused across PRs over
  // time; the latest merge is the one that retired the current branch.
  const mergedByHead = new Map<string, MergedPr>();
  for (const pr of mergedPrs) {
    const existing = mergedByHead.get(pr.headRefName);
    if (!existing || pr.mergedAt > existing.mergedAt) {
      mergedByHead.set(pr.headRefName, pr);
    }
  }

  const openSet = new Set(openHeads);

  const eligible: EligibleBranch[] = [];
  const keptOpen: string[] = [];
  const keptNoMergedPr: string[] = [];
  const keptProtected: string[] = [];
  const keptDiverged: string[] = [];

  for (const branch of Object.keys(remoteBranches)) {
    if (isProtected(branch, protectedNames, protectedPrefixes)) {
      keptProtected.push(branch);
      continue;
    }
    if (openSet.has(branch)) {
      keptOpen.push(branch);
      continue;
    }
    const merged = mergedByHead.get(branch);
    if (!merged) {
      keptNoMergedPr.push(branch);
      continue;
    }
    // The branch carries commits the merged PR never saw (reused after merge) —
    // keep it so we never drop un-PR'd work.
    if (remoteBranches[branch] !== merged.headRefOid) {
      keptDiverged.push(branch);
      continue;
    }
    eligible.push({ branch, prNumber: merged.number, mergedAt: merged.mergedAt });
  }

  // Oldest merges first so the dry-run reads as a stale-to-fresh cleanup list.
  eligible.sort((a, b) => a.mergedAt.localeCompare(b.mergedAt) || a.branch.localeCompare(b.branch));

  return { eligible, keptOpen, keptNoMergedPr, keptProtected, keptDiverged };
}
