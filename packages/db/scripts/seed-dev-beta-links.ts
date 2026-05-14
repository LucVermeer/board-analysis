/**
 * Dev-only seed script: insert a handful of beta-link rows so the home
 * "Fresh beta" strip and profile-page "Their beta" slider have something
 * to render in a local environment without S3.
 *
 * Why this script exists:
 *   - The home-strip resolver filters on `thumbnail LIKE '/static/beta-link-thumbnails/%'`
 *     so only rows whose thumbnails are cached in our S3 bucket surface.
 *   - Local dev doesn't have S3, so real Instagram/TikTok submissions never
 *     get their thumbnails cached, and the strip stays empty.
 *   - For QA we insert a small fixture set: enough rows to exercise the
 *     per-user cap, the climb-name chip, and the profile-side `userBetaLinks`
 *     resolver (both `createdByUserId` and `foreignUsername` paths).
 *
 * The thumbnail URLs point at `/static/beta-link-thumbnails/instagram/test-N.jpg`
 * which 404 in dev (no S3), so cards render with the platform-icon placeholder.
 * That's enough to QA layout, ordering, caps, click-through, and analytics.
 *
 * Idempotent: uses `ON CONFLICT DO NOTHING` on the (board_type, climb_uuid, link)
 * PK so re-running adds nothing the second time.
 *
 * Usage:
 *   vp run seed:beta-links
 *
 * To reset: `psql ... -c "DELETE FROM board_beta_links WHERE link LIKE 'https://dev-seed.example/%'"`.
 */

import { sql } from 'drizzle-orm';
import { createScriptDb } from './db-connection.js';
import { executeRows } from '../src/client/index.js';

const TEST_USER_EMAIL = 'test@boardsesh.com';
const STATIC_PREFIX = '/static/beta-link-thumbnails/instagram';

// Fixture rows. Note the deliberate burst of 5 entries for `@dev_climber_a`
// — that's what exercises the per-user cap of 3 on the home strip.
const FIXTURES = [
  { handle: 'dev_climber_a', label: 'A1' },
  { handle: 'dev_climber_a', label: 'A2' },
  { handle: 'dev_climber_a', label: 'A3' },
  { handle: 'dev_climber_a', label: 'A4' },
  { handle: 'dev_climber_a', label: 'A5' },
  { handle: 'dev_climber_b', label: 'B1' },
  { handle: 'dev_climber_b', label: 'B2' },
  { handle: 'dev_climber_c', label: 'C1' },
  { handle: null, label: 'anon1' }, // NULL handle — uncapped per product direction
  { handle: null, label: 'anon2' },
] as const;

async function main(): Promise<void> {
  const { db, close } = createScriptDb();

  try {
    // Find a Boardsesh user for created_by_user_id attribution. Prefer the
    // canonical dev test user so the profile-page slider populates on
    // /profile/<that-user-id>.
    const userRows = await executeRows<{ id: string }>(
      db,
      sql`SELECT id FROM users WHERE email = ${TEST_USER_EMAIL} LIMIT 1`,
    );
    const testUserId = userRows[0]?.id ?? null;
    if (!testUserId) {
      console.warn(`[seed-dev-beta-links] No user with email ${TEST_USER_EMAIL} — created_by_user_id will be NULL.`);
    }

    // Pick the first non-draft, listed Kilter climb we can find for the
    // join target. The actual climb doesn't matter for QA — we just need a
    // real climbUuid so the LEFT JOIN in `recentBetaLinks` returns a name.
    const climbRows = await executeRows<{ uuid: string; board_type: string }>(
      db,
      sql`
        SELECT uuid, board_type FROM board_climbs
        WHERE is_listed = true AND is_draft = false
        ORDER BY board_type, uuid
        LIMIT 5
      `,
    );
    if (climbRows.length === 0) {
      console.error('[seed-dev-beta-links] No listed climbs found. Run `vp run db:up` first.');
      process.exit(1);
    }

    const now = new Date();
    let inserted = 0;

    for (let i = 0; i < FIXTURES.length; i++) {
      const fixture = FIXTURES[i];
      const climb = climbRows[i % climbRows.length];
      // Newer rows get more recent timestamps so the strip's
      // `ORDER BY created_at DESC` puts the burst near the top.
      const createdAt = new Date(now.getTime() - i * 60 * 1000).toISOString();
      const link = `https://dev-seed.example/${fixture.label}`;
      const thumbnail = `${STATIC_PREFIX}/test-${fixture.label}.jpg`;

      const result = await executeRows<{ inserted: number }>(
        db,
        sql`
          INSERT INTO board_beta_links (
            board_type, climb_uuid, link, foreign_username,
            angle, thumbnail, is_listed, created_at, shortcode, created_by_user_id
          ) VALUES (
            ${climb.board_type}, ${climb.uuid}, ${link}, ${fixture.handle},
            NULL, ${thumbnail}, true, ${createdAt}, NULL, ${testUserId}
          )
          ON CONFLICT DO NOTHING
          RETURNING 1 AS inserted
        `,
      );
      if (result.length > 0) inserted += 1;
    }

    const userIdLabel = testUserId ?? `(none — login as ${TEST_USER_EMAIL} first)`;
    console.info(
      `[seed-dev-beta-links] Inserted ${inserted} of ${FIXTURES.length} rows (others already present). ` +
        `Test user ID: ${userIdLabel}`,
    );
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error('[seed-dev-beta-links] failed:', err);
  process.exit(1);
});
