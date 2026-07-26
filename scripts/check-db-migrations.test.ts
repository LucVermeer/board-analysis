import { describe, expect, it } from 'vitest';

import { checkAgainstBase, checkTree, parseArgs, type TreeState } from './check-db-migrations';
import type { Journal, JournalEntry } from './lib/drizzle-migrations';

function entry(idx: number, tag: string, when: number): JournalEntry {
  return { idx, version: '7', when, tag, breakpoints: true };
}

function journalOf(...entries: JournalEntry[]): Journal {
  return { version: '7', dialect: 'postgresql', entries };
}

function tree(entries: JournalEntry[], filenames: string[]): TreeState {
  return { journal: journalOf(...entries), filenames };
}

const kinds = (problems: { kind: string }[]): string[] => problems.map((problem) => problem.kind);

describe('checkTree', () => {
  it('accepts a consistent folder', () => {
    expect(checkTree(tree([entry(0, '0000_a', 1)], ['0000_a.sql', 'meta']))).toEqual([]);
  });

  it('flags a migration file with no journal entry', () => {
    // The 0177_illegal_omega_red shape that reached main: reviewed as if it would
    // run, and in fact inert.
    const problems = checkTree(tree([entry(179, '0179_b', 2)], ['0177_orphan.sql', '0179_b.sql']));
    expect(kinds(problems)).toEqual(['orphan-sql']);
    expect(problems[0]?.message).toContain('0177_orphan.sql');
  });

  it('flags a journal entry with no file', () => {
    expect(kinds(checkTree(tree([entry(1, '0001_gone', 1)], [])))).toEqual(['orphan-entry']);
  });

  it('ignores historical duplicate numbers already on main', () => {
    // 0048_add_feed_items / 0048_add_proposals are both journalled and both applied
    // in production. Nothing can fix them now, so they must not fail every PR.
    const problems = checkTree(
      tree(
        [entry(40, '0048_add_feed_items', 1), entry(42, '0048_add_proposals', 2)],
        ['0048_add_feed_items.sql', '0048_add_proposals.sql'],
      ),
    );
    expect(problems).toEqual([]);
  });

  it('flags two NEW migrations sharing a number', () => {
    const problems = checkTree(
      tree([entry(1, '0187_a', 1), entry(2, '0187_b', 2)], ['0187_a.sql', '0187_b.sql']),
      new Set(['0187_a', '0187_b']),
    );
    expect(kinds(problems)).toContain('duplicate-index');
  });

  it('flags a new entry whose tag prefix disagrees with its idx', () => {
    const problems = checkTree(tree([entry(5, '0009_x', 1)], ['0009_x.sql']), new Set(['0009_x']));
    expect(kinds(problems)).toEqual(['tag-index-mismatch']);
  });

  it('does not police tag/idx drift on entries the branch did not add', () => {
    // Real shape from main: idx 51 carries tag 0052_add_postgis_location.
    expect(checkTree(tree([entry(51, '0052_add_postgis_location', 1)], ['0052_add_postgis_location.sql']))).toEqual([]);
  });
});

describe('checkAgainstBase', () => {
  const base = tree([entry(186, '0186_tail', 1_000)], ['0186_tail.sql']);

  it('is silent when the branch adds nothing', () => {
    expect(checkAgainstBase(base, base)).toEqual([]);
  });

  it('accepts a migration that sits just above main', () => {
    const head = tree(
      [entry(186, '0186_tail', 1_000), entry(187, '0187_mine', 2_000)],
      ['0186_tail.sql', '0187_mine.sql'],
    );
    expect(checkAgainstBase(base, head)).toEqual([]);
  });

  it('flags a number main has already taken', () => {
    const takenBase = tree(
      [entry(186, '0186_tail', 1_000), entry(187, '0187_theirs', 1_500)],
      ['0186_tail.sql', '0187_theirs.sql'],
    );
    const head = tree(
      [entry(186, '0186_tail', 1_000), entry(187, '0187_mine', 2_000)],
      ['0186_tail.sql', '0187_mine.sql'],
    );
    const problems = checkAgainstBase(takenBase, head);
    expect(kinds(problems)).toContain('collision');
    expect(problems[0]?.message).toContain('vp run db:renumber');
  });

  it('flags a `when` that is not newer than main’s newest', () => {
    // The worst silent failure: both appliers order by `when`, so this migration
    // would never run, and nothing would report an error.
    const head = tree(
      [entry(186, '0186_tail', 1_000), entry(187, '0187_mine', 900)],
      ['0186_tail.sql', '0187_mine.sql'],
    );
    const problems = checkAgainstBase(base, head);
    expect(kinds(problems)).toContain('stale-when');
    expect(problems.find((problem) => problem.kind === 'stale-when')?.message).toContain('skipped permanently');
  });

  it('flags a new entry inserted before the journal tail instead of appended', () => {
    const head = tree(
      [entry(187, '0187_mine', 2_000), entry(186, '0186_tail', 1_000)],
      ['0186_tail.sql', '0187_mine.sql'],
    );
    expect(kinds(checkAgainstBase(base, head))).toContain('not-appended');
  });
});

describe('parseArgs', () => {
  it('defaults to comparing against origin/main', () => {
    expect(parseArgs([])).toEqual({ base: 'origin/main' });
  });

  it('skips the `--` that `vp run <task> -- <args>` forwards', () => {
    expect(parseArgs(['--', '--base', 'HEAD~1'])).toEqual({ base: 'HEAD~1' });
  });

  it('supports opting out of the base comparison', () => {
    expect(parseArgs(['--no-base'])).toEqual({ base: null });
  });

  it('rejects an unknown flag rather than ignoring it', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
  });
});
