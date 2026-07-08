import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  buildImportedClimbRow,
  buildJsonImportAscentTickRow,
  generateJsonImportAuroraId,
  importedPlaceholderConflictPolicy,
  publishedClimbKey,
  type AuroraExportAscent,
} from './json-import';

const NOW = '2026-07-03T00:00:00.000Z';
const CLIMB_UUID = 'climb-uuid-1';
const CLIMBED_AT = '2026-06-01T10:00:00.000Z';
const USER_ID = 'user-1';

function makeAscent(overrides: Partial<AuroraExportAscent> = {}): AuroraExportAscent {
  return {
    climb: 'Test Climb',
    angle: 40,
    count: 2,
    stars: 3,
    climbed_at: '2026-06-01 10:00:00',
    created_at: '2026-06-01 10:05:00',
    grade: '7a',
    ...overrides,
  };
}

describe('buildJsonImportAscentTickRow', () => {
  // Regression for #3390: the export 'stars' field is the raw Aurora 0-3
  // rating and must be converted to the Boardsesh 1-5 scale, not stored raw.
  it.each([
    { stars: 1, expected: 1 },
    { stars: 2, expected: 3 },
    { stars: 3, expected: 5 },
  ])('converts raw Aurora stars $stars to Boardsesh quality $expected', ({ stars, expected }) => {
    const row = buildJsonImportAscentTickRow(USER_ID, 'kilter', makeAscent({ stars }), CLIMB_UUID, CLIMBED_AT, NOW);
    expect(row.quality).toBe(expected);
  });

  it('stores unrated (stars 0) as null, not 0', () => {
    const row = buildJsonImportAscentTickRow(USER_ID, 'kilter', makeAscent({ stars: 0 }), CLIMB_UUID, CLIMBED_AT, NOW);
    expect(row.quality).toBeNull();
  });

  it('clamps out-of-range stars to the top of the scale', () => {
    const row = buildJsonImportAscentTickRow(USER_ID, 'kilter', makeAscent({ stars: 5 }), CLIMB_UUID, CLIMBED_AT, NOW);
    expect(row.quality).toBe(5);
  });

  it('builds the row with the deterministic json-import aurora id and matching sync timestamps', () => {
    const ascent = makeAscent();
    const row = buildJsonImportAscentTickRow(USER_ID, 'kilter', ascent, CLIMB_UUID, CLIMBED_AT, NOW);
    expect(row.auroraId).toBe(generateJsonImportAuroraId(USER_ID, CLIMB_UUID, ascent.angle, CLIMBED_AT, 'ascents'));
    expect(row.auroraType).toBe('ascents');
    // Imported from an Aurora export — already inside upstream, so origin
    // excludes it from the Boardsesh double-count guard.
    expect(row.origin).toBe('json_import');
    expect(row.status).toBe('send');
    expect(row.attemptCount).toBe(ascent.count);
    // The backfill migration's idempotency guard relies on freshly imported
    // rows having updated_at <= aurora_synced_at; both come from the same
    // timestamp here.
    expect(row.updatedAt).toBe(NOW);
    expect(row.auroraSyncedAt).toBe(NOW);
  });
});

describe('buildImportedClimbRow', () => {
  const base = {
    userId: USER_ID,
    boardType: 'kilter' as const,
    layoutId: 1,
    setterUsername: 'someone',
    name: 'Test Climb',
    description: '',
    frames: 'p1r15',
    edges: { edgeLeft: 0, edgeRight: 100, edgeBottom: 0, edgeTop: 100 },
    createdAt: '2026-06-01 10:00:00',
  };

  // Regression: a published-but-uncatalogued import must land UNLISTED so it
  // stops polluting catalog search with a per-user placeholder duplicate.
  it('imports a published placeholder as unlisted, non-draft, user-owned', () => {
    const row = buildImportedClimbRow({ ...base, isDraft: false });
    expect(row.isListed).toBe(false);
    expect(row.isDraft).toBe(false);
    expect(row.userId).toBe(USER_ID);
    expect(row.uuid.startsWith('json-import-climb-')).toBe(true);
  });

  it('imports a draft as unlisted and draft', () => {
    const row = buildImportedClimbRow({ ...base, isDraft: true });
    expect(row.isListed).toBe(false);
    expect(row.isDraft).toBe(true);
  });

  it('derives the no_match characteristic from an Aurora "No match" description', () => {
    const plain = buildImportedClimbRow({ ...base, isDraft: false });
    expect(plain.characteristics).toBeNull();
    const noMatch = buildImportedClimbRow({ ...base, description: 'No match. Feet follow hands.', isDraft: false });
    expect(noMatch.characteristics).toEqual(['no_match']);
  });
});

describe('importedPlaceholderConflictPolicy', () => {
  const dialect = new PgDialect();

  it('scopes the on-conflict update to placeholder rows owned by the importing user', () => {
    const policy = importedPlaceholderConflictPolicy(USER_ID);
    expect(policy.setWhere).toBeDefined();
    const rendered = dialect.sqlToQuery(policy.setWhere as NonNullable<typeof policy.setWhere>);
    const whereSql = rendered.sql.toLowerCase();
    // Only json-import placeholder rows are updatable — a real catalog climb can
    // never be delisted by a uuid collision.
    expect(whereSql).toContain("like 'json-import-climb-%'");
    // ...and only THIS user's placeholders (the importing user binds as a param).
    expect(whereSql).toContain('"user_id"');
    expect(rendered.params).toContain(USER_ID);
  });

  it('updates only is_listed, taking the incoming (unlisted) value', () => {
    const policy = importedPlaceholderConflictPolicy(USER_ID);
    expect(Object.keys(policy.set)).toEqual(['isListed']);
    const setSql = dialect.sqlToQuery(policy.set.isListed).sql.toLowerCase();
    expect(setSql).toBe('excluded.is_listed');
  });
});

describe('publishedClimbKey (layout-aware skip list)', () => {
  // Regression: the skip list used to match on name alone, so a same-name
  // catalog climb on ANOTHER layout suppressed this layout's placeholder and
  // left the import's ascents unresolvable. Keys are (layoutId, name).
  it('a same-name catalog climb on another layout does not suppress the placeholder', () => {
    const existingCatalogKeys = new Set([publishedClimbKey(8, 'Route A')]);
    // Different layout → no key match → the placeholder is still created.
    expect(existingCatalogKeys.has(publishedClimbKey(1, 'Route A'))).toBe(false);
    // Same layout → key match → skipped as before.
    expect(existingCatalogKeys.has(publishedClimbKey(8, 'Route A'))).toBe(true);
  });

  it('never collides across layouts or names', () => {
    expect(publishedClimbKey(1, 'Route A')).not.toBe(publishedClimbKey(11, 'Route A'));
    expect(publishedClimbKey(1, 'Route A')).not.toBe(publishedClimbKey(1, 'Route B'));
    // The delimiter keeps numeric prefixes unambiguous (1 + ':1x' vs 11 + 'x').
    expect(publishedClimbKey(1, ':1x')).not.toBe(publishedClimbKey(11, 'x'));
  });
});
