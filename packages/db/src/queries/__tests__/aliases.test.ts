import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { resolveCanonicalClimbUuid } from '../aliases';

type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

// Build a query-chain stub that mimics the real drizzle .select().from().where().limit()
// shape closely enough that resolveCanonicalClimbUuid can drive it. We cast at
// the boundary because the real PgDatabase generics are far deeper than we want
// to mock — the test exercises behaviour, not type identity.
//
// `onLimit` lets each case choose between resolving (happy path / miss) and
// rejecting (error path) without duplicating the chain skeleton.
function makeDb(onLimit: (n: number) => Promise<Array<{ canonicalUuid: string }>>) {
  const calls: Array<{ predicate: unknown; limit: number }> = [];
  const handle = {
    select: () => ({
      from: () => ({
        where: (predicate: unknown) => ({
          limit: (n: number) => {
            calls.push({ predicate, limit: n });
            return onLimit(n);
          },
        }),
      }),
    }),
  };
  return { calls, handle: handle as unknown as DrizzleDb };
}

const resolveRows = (rows: Array<{ canonicalUuid: string }>) => () => Promise.resolve(rows);

void describe('resolveCanonicalClimbUuid', () => {
  void it('returns the canonical uuid when an alias row matches', async () => {
    const db = makeDb(resolveRows([{ canonicalUuid: 'CANON' }]));
    const result = await resolveCanonicalClimbUuid(db.handle, 'kilter', 'DUPE');
    assert.equal(result, 'CANON');
    assert.equal(db.calls.length, 1);
  });

  void it('returns the input uuid when no alias row exists', async () => {
    const db = makeDb(resolveRows([]));
    const result = await resolveCanonicalClimbUuid(db.handle, 'kilter', 'UNKNOWN');
    // Falling back to the input uuid (instead of throwing) means callers
    // never have to special-case a climb that predates the backfill.
    assert.equal(result, 'UNKNOWN');
  });

  void it('short-circuits via the optional cache', async () => {
    const db = makeDb(resolveRows([{ canonicalUuid: 'CANON' }]));
    const cache = new Map<string, string>();

    const first = await resolveCanonicalClimbUuid(db.handle, 'kilter', 'DUPE', cache);
    const second = await resolveCanonicalClimbUuid(db.handle, 'kilter', 'DUPE', cache);

    assert.equal(first, 'CANON');
    assert.equal(second, 'CANON');
    // Second call must not hit the db — cache covers it.
    assert.equal(db.calls.length, 1);
  });

  void it('keys cache by (boardType, uuid) — the same uuid on a different board misses', async () => {
    const db = makeDb(resolveRows([{ canonicalUuid: 'CANON' }]));
    const cache = new Map<string, string>();

    await resolveCanonicalClimbUuid(db.handle, 'kilter', 'DUPE', cache);
    await resolveCanonicalClimbUuid(db.handle, 'tension', 'DUPE', cache);

    assert.equal(db.calls.length, 2);
  });

  void it('propagates db errors verbatim instead of falling back to the input uuid', async () => {
    // The fallback to input-uuid only fires when the SELECT returns zero
    // rows. A DB-level rejection (network blip, connection limit, syntax
    // error) must surface — callers need to know connectivity broke so they
    // can retry or fail the sync cycle, instead of writing ticks against a
    // potentially-duplicate UUID.
    const boom = new Error('connection terminated');
    const db = makeDb(() => Promise.reject(boom));

    await assert.rejects(
      () => resolveCanonicalClimbUuid(db.handle, 'kilter', 'DUPE'),
      (err: unknown) => err === boom,
    );
    assert.equal(db.calls.length, 1);
  });

  void it('does not cache when the db call rejects', async () => {
    // Caching a rejected outcome would let the next call return undefined or
    // worse, the rejected promise stored as a string. Make sure we miss the
    // cache on every retry until a real value lands.
    const cache = new Map<string, string>();
    const db = makeDb(() => Promise.reject(new Error('boom')));

    await assert.rejects(() => resolveCanonicalClimbUuid(db.handle, 'kilter', 'DUPE', cache));
    assert.equal(cache.size, 0);
  });
});
