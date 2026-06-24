/// <reference types="node" />

/**
 * Delete stale `origin` branches whose PR has already merged.
 *
 * GitHub's "Automatically delete head branches" setting handles new merges going
 * forward; this script drains the pre-existing backlog and acts as a weekly safety
 * net for anything that setting misses (branches merged before it was enabled, or
 * merged via the API). It is intentionally conservative — see scripts/lib/branch-cleanup.ts
 * for the eligibility rules. Closed-but-unmerged branches and branches with no PR
 * are always left alone.
 *
 * Usage:
 *   vp run cleanup:branches             # dry-run: list what would be deleted
 *   vp run cleanup:branches -- --apply  # actually delete the eligible branches
 *
 * Degrades safely: if the PR/branch data can't be gathered, it deletes nothing and
 * exits non-zero rather than acting on a partial picture.
 */

import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectBranchesToDelete, type MergedPr, type SelectResult } from './lib/branch-cleanup';

const REPO_OWNER = 'boardsesh';
const REPO_NAME = 'boardsesh';
const REPO_SLUG = `${REPO_OWNER}/${REPO_NAME}`;

// Upper bound on merged PRs fetched in one run. Comfortably above the current
// count; if a run ever hits this cap it warns, and the only effect is that some of
// the oldest branches are kept (never wrongly deleted). Bump if the repo outgrows it.
const MERGED_PR_FETCH_LIMIT = 6000;
const OPEN_PR_FETCH_LIMIT = 500;

// Never delete these, regardless of merge state. The default branch is added at
// runtime. These are defense-in-depth: a branch with no merged PR is already kept,
// but bot-/release-managed namespaces should never be touched even if one ever has.
const PROTECTED_NAMES = ['master', 'gh-pages', 'production', 'staging'];
const PROTECTED_PREFIXES = ['pr-screenshots/', 'dependabot/', 'renovate/', 'release/'];

// How many branches to hand to a single `git push --delete`. Keeps the command
// line bounded; a failed chunk is retried one branch at a time to isolate failures.
const DELETE_CHUNK_SIZE = 50;

const here = dirname(fileURLToPath(import.meta.url));

const apply = process.argv.includes('--apply');
const showHelp = process.argv.includes('-h') || process.argv.includes('--help');

const tty = process.stdout.isTTY === true;
const color = {
  green: (text: string) => (tty ? `\x1b[32m${text}\x1b[0m` : text),
  yellow: (text: string) => (tty ? `\x1b[33m${text}\x1b[0m` : text),
  red: (text: string) => (tty ? `\x1b[31m${text}\x1b[0m` : text),
  blue: (text: string) => (tty ? `\x1b[34m${text}\x1b[0m` : text),
  dim: (text: string) => (tty ? `\x1b[2m${text}\x1b[0m` : text),
};

function gh(args: string[]): string {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: here,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === 'string' && stderr.trim()) return stderr.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

type RawOpenPr = { headRefName: string; isCrossRepository: boolean };
type RawMergedPr = {
  number: number;
  headRefName: string;
  mergedAt: string;
  headRefOid: string;
  isCrossRepository: boolean;
};

function resolveDefaultBranch(): string {
  try {
    return gh(['api', `repos/${REPO_SLUG}`, '--jq', '.default_branch']).trim() || 'main';
  } catch {
    // Fall back to `main` — it's protected either way, so a wrong guess is harmless.
    return 'main';
  }
}

/** Head names of open same-repo PRs. Fork PRs (cross-repo) can't pin our branches. */
function fetchOpenHeads(): string[] {
  const raw = gh([
    'pr',
    'list',
    '--repo',
    REPO_SLUG,
    '--state',
    'open',
    '--limit',
    String(OPEN_PR_FETCH_LIMIT),
    '--json',
    'headRefName,isCrossRepository',
  ]);
  const prs = JSON.parse(raw) as RawOpenPr[];
  return prs.filter((pr) => !pr.isCrossRepository).map((pr) => pr.headRefName);
}

/** Merged same-repo PRs, with the head commit they merged. */
function fetchMergedPrs(): MergedPr[] {
  const raw = gh([
    'pr',
    'list',
    '--repo',
    REPO_SLUG,
    '--state',
    'merged',
    '--limit',
    String(MERGED_PR_FETCH_LIMIT),
    '--json',
    'number,headRefName,mergedAt,headRefOid,isCrossRepository',
  ]);
  const prs = JSON.parse(raw) as RawMergedPr[];
  if (prs.length >= MERGED_PR_FETCH_LIMIT) {
    console.warn(
      color.yellow(
        `[cleanup] hit the ${MERGED_PR_FETCH_LIMIT} merged-PR fetch cap; the oldest branches may be skipped this run. Bump MERGED_PR_FETCH_LIMIT.`,
      ),
    );
  }
  return prs
    .filter((pr) => !pr.isCrossRepository)
    .map((pr) => ({
      number: pr.number,
      headRefName: pr.headRefName,
      mergedAt: pr.mergedAt,
      headRefOid: pr.headRefOid,
    }));
}

/** Branches on origin: name (no `refs/heads/` prefix) -> current tip commit oid. */
function fetchRemoteBranches(): Record<string, string> {
  const raw = git(['ls-remote', '--heads', 'origin']);
  const branches: Record<string, string> = {};
  const prefix = 'refs/heads/';
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [sha, ref] = trimmed.split(/\s+/);
    if (!sha || !ref || !ref.startsWith(prefix)) continue;
    branches[ref.slice(prefix.length)] = sha;
  }
  return branches;
}

function printSummary(totalBranches: number, result: SelectResult): void {
  const line = '─'.repeat(60);
  console.log(line);
  console.log(`Remote branches:        ${totalBranches}`);
  console.log(`Eligible for deletion:  ${color.green(String(result.eligible.length))}`);
  console.log(`Kept — open PR:         ${result.keptOpen.length}`);
  console.log(`Kept — no merged PR:    ${result.keptNoMergedPr.length}`);
  console.log(`Kept — tip diverged:    ${color.yellow(String(result.keptDiverged.length))}`);
  console.log(`Kept — protected:       ${result.keptProtected.length}`);
  console.log(line);
}

/** Delete branches in chunks; retry a failed chunk one-by-one to isolate failures. */
function deleteBranches(branches: string[]): { removed: string[]; failed: string[] } {
  const removed: string[] = [];
  const failed: string[] = [];
  for (let offset = 0; offset < branches.length; offset += DELETE_CHUNK_SIZE) {
    const chunk = branches.slice(offset, offset + DELETE_CHUNK_SIZE);
    try {
      git(['push', 'origin', '--delete', ...chunk]);
      removed.push(...chunk);
      console.log(color.green(`  ✓ deleted ${chunk.length} (${removed.length}/${branches.length})`));
    } catch {
      for (const branch of chunk) {
        try {
          git(['push', 'origin', '--delete', branch]);
          removed.push(branch);
        } catch (error) {
          failed.push(branch);
          console.warn(color.red(`  ! failed to delete ${branch}: ${describeError(error)}`));
        }
      }
    }
  }
  return { removed, failed };
}

function printHelp(): void {
  console.log(
    [
      'Delete stale origin branches whose PR has already merged.',
      '',
      'Usage:',
      '  vp run cleanup:branches             dry-run: list what would be deleted',
      '  vp run cleanup:branches -- --apply  actually delete the eligible branches',
      '',
      'A branch is deleted only when it is the head of a merged same-repo PR, has no',
      'open PR, is not protected, and its tip still matches the merged commit.',
    ].join('\n'),
  );
}

function main(): number {
  if (showHelp) {
    printHelp();
    return 0;
  }

  let openHeads: string[];
  let mergedPrs: MergedPr[];
  let remoteBranches: Record<string, string>;
  try {
    openHeads = fetchOpenHeads();
    mergedPrs = fetchMergedPrs();
    remoteBranches = fetchRemoteBranches();
  } catch (error) {
    console.error(color.red(`[cleanup] failed to gather PR/branch data: ${describeError(error)}`));
    console.error(color.red('[cleanup] aborting without deleting anything.'));
    return 1;
  }

  // Abort guards: never act on an incomplete picture.
  if (mergedPrs.length === 0) {
    console.error(
      color.red('[cleanup] no merged PRs returned — likely an auth/API problem. Aborting without deleting anything.'),
    );
    return 1;
  }
  const totalBranches = Object.keys(remoteBranches).length;
  if (totalBranches === 0) {
    console.log('[cleanup] no remote branches found. Nothing to do.');
    return 0;
  }

  const defaultBranch = resolveDefaultBranch();
  const protectedNames = PROTECTED_NAMES.includes(defaultBranch)
    ? PROTECTED_NAMES
    : [...PROTECTED_NAMES, defaultBranch];

  const result = selectBranchesToDelete({
    remoteBranches,
    mergedPrs,
    openHeads,
    protectedNames,
    protectedPrefixes: PROTECTED_PREFIXES,
  });

  if (result.eligible.length > 0) {
    console.log(apply ? 'Deleting branches from merged PRs:' : 'Branches from merged PRs eligible for deletion:');
    for (const entry of result.eligible) {
      console.log(`  ${entry.branch} ${color.dim(`← PR #${entry.prNumber} (merged ${entry.mergedAt.slice(0, 10)})`)}`);
    }
    console.log('');
  }

  printSummary(totalBranches, result);

  if (result.eligible.length === 0) {
    console.log('Nothing to delete.');
    return 0;
  }

  if (!apply) {
    console.log('');
    console.log(
      `${color.blue('Dry run.')} Re-run with ${color.blue('-- --apply')} to delete the ${result.eligible.length} branch(es) above.`,
    );
    return 0;
  }

  console.log('');
  const { removed, failed } = deleteBranches(result.eligible.map((entry) => entry.branch));
  console.log('');
  console.log(`Done. Removed: ${color.green(String(removed.length))}   Failed: ${color.red(String(failed.length))}`);
  return failed.length > 0 ? 1 : 0;
}

process.exit(main());
