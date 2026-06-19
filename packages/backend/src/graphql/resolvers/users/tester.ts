import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';

// Roles that unlock the tester-only developer tooling in the mobile app.
// Admins implicitly count as testers so they always have access.
const TESTER_ROLES = ['tester', 'admin'] as const;

/**
 * Whether a user can reach the tester-only developer tooling — true when they
 * hold a global or board-scoped `tester` (or `admin`) row in `community_roles`.
 * Drives `UserProfile.isTester`.
 */
export async function userIsTester(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: dbSchema.communityRoles.id })
    .from(dbSchema.communityRoles)
    .where(and(eq(dbSchema.communityRoles.userId, userId), inArray(dbSchema.communityRoles.role, [...TESTER_ROLES])))
    .limit(1);

  return row !== undefined;
}
