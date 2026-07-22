import { randomUUID } from 'node:crypto';
import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { pubsub } from '../../../pubsub/index';
import { logger } from '../../../utils/logger';

/**
 * Create the in-app "you now manage this gym" notification for a user and push it
 * live (best-effort). Shared by two flows that both hand someone the keys to a
 * gym:
 *  - a claim that transfers ownership (gym-claims.ts), and
 *  - an owner/admin granting a staff member admin/editor access (gyms.ts).
 *
 * Both mean the same thing to the recipient — "you can manage this gym now" — so
 * they reuse the `gym_claim_approved` notification type: its copy is already
 * "You now manage {{gym}}" and it deep-links to /gym/[slug]/manage. Reusing the
 * type keeps this to zero new enum values and no migration.
 *
 * System notification — no actor, so the feed shows a gym icon rather than a
 * person. The gym name rides the live payload and is re-derived from `entityId`
 * (the gym UUID) when the feed is fetched later.
 */
export async function createGymClaimApprovedNotification(
  recipientId: string,
  gymUuid: string,
  gymName: string,
): Promise<void> {
  try {
    const uuid = randomUUID();
    await db.insert(dbSchema.notifications).values({
      uuid,
      recipientId,
      actorId: null,
      type: 'gym_claim_approved',
      entityType: 'gym',
      entityId: gymUuid,
    });

    pubsub.publishNotificationEvent(recipientId, {
      notification: {
        uuid,
        type: 'gym_claim_approved',
        actorId: null,
        entityType: 'gym',
        entityId: gymUuid,
        gymName,
        isRead: false,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('[GymNotifications] Failed to create manage-access notification:', error);
  }
}
