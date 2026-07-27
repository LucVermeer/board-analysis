import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CUSTOM_SENTINEL,
  addedMigrations,
  collides,
  duplicateIndexes,
  findOrphans,
  isCustomMigration,
  journalEntryFor,
  maxWhen,
  migrationFiles,
  migrationIndex,
  nextFreeIndex,
  nextWhen,
  padIndex,
  parseJournal,
  parseMigrationFilename,
  planRenumber,
  rewriteTagReferences,
  serializeJournal,
  type Journal,
  type JournalEntry,
} from './drizzle-migrations';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function entry(idx: number, tag: string, when: number): JournalEntry {
  return { idx, version: '7', when, tag, breakpoints: true };
}

function journalOf(...entries: JournalEntry[]): Journal {
  return { version: '7', dialect: 'postgresql', entries };
}

describe('parseMigrationFilename', () => {
  it('parses a migration filename into its parts', () => {
    expect(parseMigrationFilename('0187_greedy_thing.sql')).toEqual({
      index: 187,
      suffix: 'greedy_thing',
      tag: '0187_greedy_thing',
      filename: '0187_greedy_thing.sql',
    });
  });

  it('rejects anything that is not a numbered migration', () => {
    expect(parseMigrationFilename('_journal.json')).toBeNull();
    expect(parseMigrationFilename('0187_snapshot.json')).toBeNull();
    expect(parseMigrationFilename('187_short_prefix.sql')).toBeNull();
    expect(parseMigrationFilename('README.md')).toBeNull();
  });
});

describe('migrationIndex', () => {
  it('reads the numeric prefix off a tag', () => {
    expect(migrationIndex('0186_backfill_sync_frozen_at')).toBe(186);
    expect(migrationIndex('not-a-tag')).toBeNull();
  });
});

describe('serializeJournal', () => {
  it('round-trips the real journal byte-for-byte', () => {
    // Pins two things nothing else guards: the two-space indent, and the absent
    // trailing newline. The folder is in .prettierignore, so a drift here would
    // show up as noise in every future migration diff.
    const path = resolve(repoRoot, 'packages/db/drizzle/meta/_journal.json');
    const original = readFileSync(path, 'utf8');
    expect(serializeJournal(parseJournal(original))).toBe(original);
  });

  it('does not append a trailing newline', () => {
    expect(serializeJournal(journalOf(entry(0, '0000_a', 1)))).not.toMatch(/\n$/);
  });
});

describe('parseJournal', () => {
  it('rejects a malformed entry rather than passing it through', () => {
    // drizzle-kit answers a malformed journal with a bare process.exit(0), so this
    // is the only place the problem can surface.
    expect(() => parseJournal('{"entries":[{"idx":1}]}')).toThrow(/malformed/);
    expect(() => parseJournal('{}')).toThrow(/no entries array/);
  });
});

describe('nextFreeIndex', () => {
  it('takes the journal tail when the folder agrees', () => {
    expect(nextFreeIndex(journalOf(entry(185, '0185_a', 1), entry(186, '0186_b', 2)), ['0186_b.sql'])).toBe(187);
  });

  it('respects an orphaned file above the journal tail', () => {
    // The 0177_illegal_omega_red shape: tracked on disk, absent from the journal.
    // drizzle-kit numbers from the journal tail alone and would re-collide here.
    const journal = journalOf(entry(176, '0176_a', 1));
    expect(nextFreeIndex(journal, ['0176_a.sql', '0177_illegal_omega_red.sql'])).toBe(178);
  });

  it('uses the tag prefix when it has drifted from idx', () => {
    // Real shape from main: idx 51 carries tag 0052_add_postgis_location.
    expect(nextFreeIndex(journalOf(entry(51, '0052_add_postgis_location', 1)), [])).toBe(53);
  });

  it('handles an empty folder', () => {
    expect(nextFreeIndex(journalOf(), [])).toBe(0);
  });
});

describe('addedMigrations', () => {
  it('is a set difference, so a prior renumber still registers', () => {
    // A branch renumbered once shows up as a rename, which `--diff-filter=A` misses.
    const added = addedMigrations(['0186_b.sql'], ['0186_b.sql', '0187_mine.sql']);
    expect(added.map((file) => file.filename)).toEqual(['0187_mine.sql']);
  });

  it('ignores non-migration entries in the listing', () => {
    expect(addedMigrations([], ['meta', 'README.md', '0001_x.sql'])).toHaveLength(1);
  });
});

describe('collides', () => {
  const at = (index: number) => migrationFiles([`${padIndex(index)}_x.sql`]);

  it('is false while the branch still holds main’s next free number', () => {
    // Observed on the real repo: with main at 0186, four open PRs all held 0187
    // and every one of them reported MERGEABLE. 0187 is genuinely free until
    // somebody takes it, so renumbering then would be pure churn.
    expect(collides(at(187), 187)).toBe(false);
    expect(collides([], 187)).toBe(false);
  });

  it('is true once main has taken the number', () => {
    // The instant one of those four merges, main's next free becomes 0188 and the
    // other three are stranded — this is the moment the fan-out fires.
    expect(collides(at(187), 188)).toBe(true);
    expect(collides(at(185), 188)).toBe(true);
  });
});

describe('planRenumber', () => {
  it('assigns contiguous numbers and keeps suffixes and order', () => {
    const added = migrationFiles(['0185_first.sql', '0186_second.sql']);
    expect(planRenumber(added, 190).map((move) => move.toFilename)).toEqual(['0190_first.sql', '0191_second.sql']);
  });

  it('refuses a branch that already has two migrations at one number', () => {
    const added = migrationFiles(['0187_a.sql', '0187_b.sql']);
    expect(() => planRenumber(added, 190)).toThrow(/ambiguous/);
  });
});

describe('nextWhen', () => {
  it('uses the clock when it is already ahead', () => {
    expect(nextWhen(1_000, 2_000)).toBe(2_000);
  });

  it('clamps past a future-stamped journal so the migration is never skipped', () => {
    // Both appliers order by `when`; a value at or below the newest applied
    // migration is skipped permanently and silently.
    expect(nextWhen(5_000, 2_000)).toBe(5_001);
    expect(nextWhen(5_000, 5_000)).toBe(5_001);
  });
});

describe('maxWhen', () => {
  it('is the maximum, not the last entry — the journal is not monotonic', () => {
    expect(maxWhen(journalOf(entry(0, '0000_a', 900), entry(1, '0001_b', 100)))).toBe(900);
  });
});

describe('journalEntryFor', () => {
  it('builds a v7 entry whose tag prefix matches its idx', () => {
    expect(journalEntryFor(188, 'greedy_thing', 42)).toEqual({
      idx: 188,
      version: '7',
      when: 42,
      tag: '0188_greedy_thing',
      breakpoints: true,
    });
  });
});

describe('findOrphans', () => {
  it('flags a file with no journal entry', () => {
    const report = findOrphans(journalOf(entry(179, '0179_bent_kid_colt', 1)), [
      '0177_illegal_omega_red.sql',
      '0179_bent_kid_colt.sql',
    ]);
    expect(report.sqlWithoutEntry).toEqual(['0177_illegal_omega_red.sql']);
    expect(report.entryWithoutSql).toEqual([]);
  });

  it('flags a journal entry with no file', () => {
    const report = findOrphans(journalOf(entry(1, '0001_gone', 1)), []);
    expect(report.entryWithoutSql).toEqual(['0001_gone']);
  });

  it('is clean for a consistent folder', () => {
    const report = findOrphans(journalOf(entry(1, '0001_a', 1)), ['0001_a.sql', 'meta']);
    expect(report.sqlWithoutEntry).toEqual([]);
    expect(report.entryWithoutSql).toEqual([]);
  });
});

describe('duplicateIndexes', () => {
  it('finds numbers claimed more than once', () => {
    expect(duplicateIndexes(['0048_add_feed_items.sql', '0048_add_proposals.sql', '0049_x.sql'])).toEqual([48]);
  });
});

describe('isCustomMigration', () => {
  it('detects the drizzle-kit --custom sentinel', () => {
    expect(isCustomMigration(`${CUSTOM_SENTINEL}\nUPDATE foo SET bar = 1;`)).toBe(true);
    expect(isCustomMigration('ALTER TABLE "foo" ADD COLUMN "bar" text;')).toBe(false);
  });
});

describe('rewriteTagReferences', () => {
  it('rewrites a whole-tag reference', () => {
    expect(
      rewriteTagReferences(
        "dedupReplaySql('0165_kilter_dedup_backfill')",
        '0165_kilter_dedup_backfill',
        '0167_kilter_dedup_backfill',
      ),
    ).toBe("dedupReplaySql('0167_kilter_dedup_backfill')");
  });

  it('leaves a longer tag that merely starts the same alone', () => {
    expect(rewriteTagReferences('0187_foo_bar', '0187_foo', '0188_foo')).toBe('0187_foo_bar');
  });

  it('leaves a hyphenated extension alone', () => {
    expect(rewriteTagReferences('0187_foo-bar', '0187_foo', '0188_foo')).toBe('0187_foo-bar');
  });

  it('rewrites every occurrence', () => {
    expect(rewriteTagReferences('a 0187_x b 0187_x', '0187_x', '0188_x')).toBe('a 0188_x b 0188_x');
  });
});
