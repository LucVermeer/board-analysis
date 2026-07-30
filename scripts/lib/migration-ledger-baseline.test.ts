import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  EMPTY_LEDGER_BASELINE,
  JOURNAL_LENGTH_WHEN_BASELINE_RECORDED,
  PRODUCTION_LEDGER_BASELINE,
} from './migration-ledger-baseline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOURNAL_PATH = path.resolve(__dirname, '../../packages/db/drizzle/meta/_journal.json');

function journalTags(): string[] {
  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf-8')) as { entries: { tag: string }[] };
  return journal.entries.map((entry) => entry.tag);
}

const baselinedTags = PRODUCTION_LEDGER_BASELINE.migrations.map((migration) => migration.tag);

describe('production ledger baseline', () => {
  it('names only tags that are still in the journal', () => {
    // The deploy gate throws on an unknown tag rather than tolerating it, so
    // without this test the first symptom of a typo or a renamed migration is a
    // blocked production deploy.
    const tags = new Set(journalTags());
    expect(baselinedTags.filter((tag) => !tags.has(tag))).toEqual([]);
  });

  it('lists each tag once', () => {
    expect(new Set(baselinedTags).size).toBe(baselinedTags.length);
  });

  it('lists tags in journal order', () => {
    // Journal order is how `db:verify-journal` prints a gap, so keeping the file
    // in the same order makes "repair a tag, delete its line" a one-line diff.
    const positionOf = new Map(journalTags().map((tag, index) => [tag, index]));
    const positions = baselinedTags.map((tag) => positionOf.get(tag) ?? -1);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('covers only migrations that existed when the baseline was recorded', () => {
    // A migration appended after the baseline must never be baselined: a gap
    // there means DDL that never reached production, which is the outage #2933
    // was closed to prevent. Anchored to the journal length at record time
    // rather than a margin, so the bound cannot drift into always passing.
    const tags = journalTags();
    expect(tags.length).toBeGreaterThanOrEqual(JOURNAL_LENGTH_WHEN_BASELINE_RECORDED);
    const newestBaselinedIndex = Math.max(...baselinedTags.map((tag) => tags.indexOf(tag)));
    expect(newestBaselinedIndex).toBeLessThan(JOURNAL_LENGTH_WHEN_BASELINE_RECORDED);
  });

  it('pins every entry to a sha256-shaped hash', () => {
    // The exemption is (tag, hash), not tag — see the module header. A blank or
    // truncated hash would silently stop matching and turn a tolerated gap fatal.
    // Parity with the files on disk is asserted in packages/db, where drizzle's
    // own readMigrationFiles is available.
    for (const migration of PRODUCTION_LEDGER_BASELINE.migrations) {
      expect(migration.hash, migration.tag).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('tolerates nothing when empty', () => {
    expect(EMPTY_LEDGER_BASELINE.migrations).toEqual([]);
  });
});
