import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { v4 as uuidv4 } from 'uuid';
import { sql, eq } from 'drizzle-orm';
import type { ConnectionContext } from '@boardsesh/shared-schema';
import { db } from '../db/client';
import { socialGymQueries, resolveCanonicalGym, resolveCanonicalGymByUuid } from '../graphql/resolvers/social/gyms';
import { socialGymKioskQueries } from '../graphql/resolvers/social/gym-kiosks';
import * as dbSchema from '@boardsesh/db/schema';

/**
 * Real-DB coverage for merged-gym canonical resolution (the sticky-merge
 * foundation). A merge keeps one canonical row live and soft-deletes the twin
 * with merged_into_gym_id pointing at the survivor; the read paths follow that
 * pointer so a deduped gym's old uuid/slug resolves to the canonical row instead
 * of 404ing (printed kiosk QR codes must never die).
 *
 * Seeds via raw SQL and calls the resolvers/helpers directly against the
 * per-worker test DB, mirroring gym-branding-and-boards.test.ts.
 */

const OWNER = 'canon-owner';

let connectionCounter = 0;
const anonCtx = (): ConnectionContext =>
  ({ connectionId: `conn-anon-${connectionCounter++}`, isAuthenticated: false }) as ConnectionContext;

const insertUser = (id: string) =>
  db.execute(sql`
    INSERT INTO "users" (id, email, name, created_at, updated_at)
    VALUES (${id}, ${id + '@test.com'}, ${'User ' + id}, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);

// Insert a gym with full control over the merge-relevant columns. A merged twin
// is soft-deleted (deletedAt set) and carries a merged_into_gym_id pointer. An
// explicit updatedAt makes the same-slug tiebreak (desc updatedAt) deterministic.
const insertGym = async (opts: {
  name: string;
  slug: string;
  deleted?: boolean;
  mergedIntoGymId?: number | null;
  updatedAt?: Date;
}): Promise<{ id: number; uuid: string; slug: string }> => {
  const { name, slug, deleted = false, mergedIntoGymId = null, updatedAt } = opts;
  const uuid = uuidv4();
  const updatedAtSql = updatedAt ? sql`${updatedAt.toISOString()}::timestamptz` : sql`now()`;
  const result = await db.execute(sql`
    INSERT INTO gyms (uuid, name, slug, owner_id, is_public, merged_into_gym_id, deleted_at, created_at, updated_at)
    VALUES (
      ${uuid}, ${name}, ${slug}, ${OWNER}, ${!deleted},
      ${mergedIntoGymId}, ${deleted ? sql`now()` : sql`NULL`}, now(), ${updatedAtSql}
    )
    RETURNING id
  `);
  return { id: Number(Array.from(result as Iterable<{ id: number }>)[0].id), uuid, slug };
};

// Seed a kiosk under a gym so the public gymKiosk read path is exercisable.
const insertKiosk = async (gymId: number, slug: string, name: string): Promise<{ uuid: string }> => {
  const uuid = uuidv4();
  await db.execute(sql`
    INSERT INTO gym_kiosks (uuid, gym_id, slug, name, layout, created_at, updated_at)
    VALUES (${uuid}, ${gymId}, ${slug}, ${name}, ${'{"version":1,"boards":[],"leaderboard":null}'}::jsonb, now(), now())
  `);
  return { uuid };
};

beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE TABLE
      "gym_kiosks", "gym_members", "gym_follows", "gym_claims", "user_boards", "gyms"
    RESTART IDENTITY CASCADE
  `);
  await insertUser(OWNER);
});

describe('merged gym canonical resolution', () => {
  it('resolves a merged twin to the canonical gym by slug (no 404)', async () => {
    const canonical = await insertGym({ name: 'Canonical Gym', slug: 'canonical-gym' });
    await insertGym({ name: 'Duplicate Gym', slug: 'duplicate-gym', deleted: true, mergedIntoGymId: canonical.id });

    const resolved = await socialGymQueries.gymBySlug(null, { slug: 'duplicate-gym' }, anonCtx());

    expect(resolved).not.toBeNull();
    expect(resolved!.slug).toBe('canonical-gym');
    expect(resolved!.uuid).toBe(canonical.uuid);
  });

  it('resolves a merged twin to the canonical gym by uuid (no 404)', async () => {
    const canonical = await insertGym({ name: 'Canonical Gym', slug: 'canonical-gym' });
    const twin = await insertGym({
      name: 'Duplicate Gym',
      slug: 'duplicate-gym',
      deleted: true,
      mergedIntoGymId: canonical.id,
    });

    const resolved = await socialGymQueries.gym(null, { gymUuid: twin.uuid }, anonCtx());

    expect(resolved).not.toBeNull();
    expect(resolved!.uuid).toBe(canonical.uuid);
    expect(resolved!.slug).toBe('canonical-gym');
  });

  it('follows a 2-hop merge chain to the canonical gym', async () => {
    // grandchild -> child -> canonical (both intermediate rows soft-deleted).
    const canonical = await insertGym({ name: 'Canonical Gym', slug: 'canonical-gym' });
    const child = await insertGym({
      name: 'Child Gym',
      slug: 'child-gym',
      deleted: true,
      mergedIntoGymId: canonical.id,
    });
    const grandchild = await insertGym({
      name: 'Grandchild Gym',
      slug: 'grandchild-gym',
      deleted: true,
      mergedIntoGymId: child.id,
    });

    const byUuid = await resolveCanonicalGymByUuid(grandchild.uuid);
    expect(byUuid).not.toBeNull();
    expect(byUuid!.id).toBe(canonical.id);

    const bySlug = await socialGymQueries.gymBySlug(null, { slug: 'grandchild-gym' }, anonCtx());
    expect(bySlug).not.toBeNull();
    expect(bySlug!.uuid).toBe(canonical.uuid);
  });

  it('does not hang on a merge cycle (returns null instead)', async () => {
    // Two soft-deleted rows pointing at each other. Insert with a null pointer
    // first, then close the loop with UPDATEs.
    const first = await insertGym({ name: 'Loop A', slug: 'loop-a', deleted: true, mergedIntoGymId: null });
    const second = await insertGym({ name: 'Loop B', slug: 'loop-b', deleted: true, mergedIntoGymId: first.id });
    await db.execute(sql`UPDATE gyms SET merged_into_gym_id = ${second.id} WHERE id = ${first.id}`);

    const resolved = await resolveCanonicalGymByUuid(first.uuid);
    expect(resolved).toBeNull();

    const viaQuery = await socialGymQueries.gym(null, { gymUuid: first.uuid }, anonCtx());
    expect(viaQuery).toBeNull();
  });

  it('leaves a live, un-merged gym unaffected', async () => {
    const live = await insertGym({ name: 'Live Gym', slug: 'live-gym' });

    const bySlug = await socialGymQueries.gymBySlug(null, { slug: 'live-gym' }, anonCtx());
    expect(bySlug).not.toBeNull();
    expect(bySlug!.slug).toBe('live-gym');
    expect(bySlug!.uuid).toBe(live.uuid);

    const canonicalRow = await resolveCanonicalGym(await fetchGymRow(live.id));
    expect(canonicalRow).not.toBeNull();
    expect(canonicalRow!.id).toBe(live.id);
  });

  it('resolves a LIVE gym carrying a stale non-null pointer to itself (never redirects away)', async () => {
    // Defensive: a live row must never follow its own merged_into_gym_id. The
    // resolver checks deletedAt BEFORE reading the pointer, so a live gym that
    // somehow carries a stale pointer resolves to itself — this pins that order
    // so a future refactor can't reintroduce a self-redirect.
    const other = await insertGym({ name: 'Other Gym', slug: 'other-gym' });
    const live = await insertGym({ name: 'Live Gym', slug: 'live-with-stale-pointer', mergedIntoGymId: other.id });

    const byUuid = await resolveCanonicalGymByUuid(live.uuid);
    expect(byUuid).not.toBeNull();
    expect(byUuid!.id).toBe(live.id);

    // The public read returns the live gym under its own slug — no redirect.
    const bySlug = await socialGymQueries.gymBySlug(null, { slug: 'live-with-stale-pointer' }, anonCtx());
    expect(bySlug).not.toBeNull();
    expect(bySlug!.uuid).toBe(live.uuid);
    expect(bySlug!.slug).toBe('live-with-stale-pointer');
  });

  it('still 404s a plain soft-deleted gym with no merge pointer', async () => {
    const gone = await insertGym({ name: 'Gone Gym', slug: 'gone-gym', deleted: true, mergedIntoGymId: null });

    const bySlug = await socialGymQueries.gymBySlug(null, { slug: 'gone-gym' }, anonCtx());
    expect(bySlug).toBeNull();

    const byUuid = await socialGymQueries.gym(null, { gymUuid: gone.uuid }, anonCtx());
    expect(byUuid).toBeNull();
  });

  it('serves a merged twin slug through the public kiosk read (QR still lands)', async () => {
    const canonical = await insertGym({ name: 'Canonical Gym', slug: 'canonical-gym' });
    await insertKiosk(canonical.id, 'main', 'Main Wall');
    await insertGym({ name: 'Duplicate Gym', slug: 'duplicate-gym', deleted: true, mergedIntoGymId: canonical.id });

    // Default kiosk lookup (kioskSlug null) via the merged twin's slug resolves to
    // the canonical gym's kiosk, and the payload carries the canonical slug so the
    // kiosk page can redirect the printed QR's URL onto it.
    const kiosk = await socialGymKioskQueries.gymKiosk(null, { gymSlug: 'duplicate-gym', kioskSlug: null }, anonCtx());
    expect(kiosk).not.toBeNull();
    expect(kiosk!.slug).toBe('main');
    expect(kiosk!.gym.slug).toBe('canonical-gym');
    expect(kiosk!.gym.uuid).toBe(canonical.uuid);
  });

  it('returns null when a chain dead-ends in a canonical that was later removed', async () => {
    // ON DELETE SET NULL: if a chain's survivor is hard-deleted, the row that
    // pointed at it is left soft-deleted with merged_into_gym_id = NULL. Walking a
    // multi-hop chain into such a dead end must yield null, never loop or throw.
    const deadEnd = await insertGym({ name: 'Dead End', slug: 'dead-end', deleted: true, mergedIntoGymId: null });
    const twin = await insertGym({
      name: 'Orphan Twin',
      slug: 'orphan-twin',
      deleted: true,
      mergedIntoGymId: deadEnd.id,
    });

    const byUuid = await resolveCanonicalGymByUuid(twin.uuid);
    expect(byUuid).toBeNull();

    const bySlug = await socialGymQueries.gymBySlug(null, { slug: 'orphan-twin' }, anonCtx());
    expect(bySlug).toBeNull();
  });

  it('picks the most-recently-merged twin when several soft-deleted rows share a slug', async () => {
    // A rename+merge sequence can leave two soft-deleted rows with the same slug,
    // pointing at different survivors. The newer one (desc updatedAt) wins.
    const older = await insertGym({ name: 'Older Survivor', slug: 'older-survivor' });
    const newer = await insertGym({ name: 'Newer Survivor', slug: 'newer-survivor' });
    await insertGym({
      name: 'Shared A',
      slug: 'shared-slug',
      deleted: true,
      mergedIntoGymId: older.id,
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    });
    await insertGym({
      name: 'Shared B',
      slug: 'shared-slug',
      deleted: true,
      mergedIntoGymId: newer.id,
      updatedAt: new Date('2024-06-01T00:00:00Z'),
    });

    const resolved = await socialGymQueries.gymBySlug(null, { slug: 'shared-slug' }, anonCtx());
    expect(resolved).not.toBeNull();
    expect(resolved!.uuid).toBe(newer.uuid);
  });
});

// Read the full gym row back so resolveCanonicalGym can be exercised directly.
async function fetchGymRow(id: number): Promise<typeof dbSchema.gyms.$inferSelect> {
  const [row] = await db.select().from(dbSchema.gyms).where(eq(dbSchema.gyms.id, id)).limit(1);
  return row;
}
