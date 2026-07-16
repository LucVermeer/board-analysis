import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'drizzle-orm';
import type { ConnectionContext } from '@boardsesh/shared-schema';
import { db } from '../db/client';
import { socialGymQueries, resolveCanonicalGym, resolveCanonicalGymByUuid } from '../graphql/resolvers/social/gyms';
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
// is soft-deleted (deletedAt set) and carries a merged_into_gym_id pointer.
const insertGym = async (opts: {
  name: string;
  slug: string;
  deleted?: boolean;
  mergedIntoGymId?: number | null;
}): Promise<{ id: number; uuid: string; slug: string }> => {
  const { name, slug, deleted = false, mergedIntoGymId = null } = opts;
  const uuid = uuidv4();
  const result = await db.execute(sql`
    INSERT INTO gyms (uuid, name, slug, owner_id, is_public, merged_into_gym_id, deleted_at, created_at, updated_at)
    VALUES (
      ${uuid}, ${name}, ${slug}, ${OWNER}, ${!deleted},
      ${mergedIntoGymId}, ${deleted ? sql`now()` : sql`NULL`}, now(), now()
    )
    RETURNING id
  `);
  return { id: Number(Array.from(result as Iterable<{ id: number }>)[0].id), uuid, slug };
};

beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE TABLE
      "gym_members", "gym_follows", "gym_claims", "user_boards", "gyms"
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

  it('still 404s a plain soft-deleted gym with no merge pointer', async () => {
    const gone = await insertGym({ name: 'Gone Gym', slug: 'gone-gym', deleted: true, mergedIntoGymId: null });

    const bySlug = await socialGymQueries.gymBySlug(null, { slug: 'gone-gym' }, anonCtx());
    expect(bySlug).toBeNull();

    const byUuid = await socialGymQueries.gym(null, { gymUuid: gone.uuid }, anonCtx());
    expect(byUuid).toBeNull();
  });
});

// Read the full gym row back so resolveCanonicalGym can be exercised directly.
async function fetchGymRow(id: number): Promise<typeof dbSchema.gyms.$inferSelect> {
  const [row] = await db
    .select()
    .from(dbSchema.gyms)
    .where(sql`${dbSchema.gyms.id} = ${id}`)
    .limit(1);
  return row;
}
