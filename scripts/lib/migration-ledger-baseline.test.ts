import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { EMPTY_LEDGER_BASELINE, PRODUCTION_LEDGER_BASELINE } from './migration-ledger-baseline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOURNAL_PATH = path.resolve(__dirname, '../../packages/db/drizzle/meta/_journal.json');

function journalTags(): string[] {
  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf-8')) as { entries: { tag: string }[] };
  return journal.entries.map((entry) => entry.tag);
}

describe('production ledger baseline', () => {
  it('names only tags that are still in the journal', () => {
    // The deploy gate throws on an unknown tag rather than tolerating it, so
    // without this test the first symptom of a typo or a renamed migration is a
    // blocked production deploy.
    const tags = new Set(journalTags());
    const unknown = PRODUCTION_LEDGER_BASELINE.tags.filter((tag) => !tags.has(tag));
    expect(unknown).toEqual([]);
  });

  it('lists each tag once', () => {
    const seen = new Set(PRODUCTION_LEDGER_BASELINE.tags);
    expect(seen.size).toBe(PRODUCTION_LEDGER_BASELINE.tags.length);
  });

  it('lists tags in journal order', () => {
    // Journal order is how `db:verify-journal` prints a gap, so keeping the file
    // in the same order makes "repair a tag, delete its line" a one-line diff.
    const positionOf = new Map(journalTags().map((tag, index) => [tag, index]));
    const positions = PRODUCTION_LEDGER_BASELINE.tags.map((tag) => positionOf.get(tag) ?? -1);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('covers only migrations old enough to predate the gate', () => {
    // A new migration must never be baselined: a gap there means DDL that never
    // reached production, which is the outage #2933 was closed to prevent. The
    // 20 recorded tags all sit in the first 103 of 188 journal entries; anything
    // appended from here on is well past that.
    const tags = journalTags();
    const newestBaselinedIndex = Math.max(...PRODUCTION_LEDGER_BASELINE.tags.map((tag) => tags.indexOf(tag)));
    expect(newestBaselinedIndex).toBeLessThan(120);
  });

  it('tolerates nothing when empty', () => {
    expect(EMPTY_LEDGER_BASELINE.tags).toEqual([]);
  });
});
