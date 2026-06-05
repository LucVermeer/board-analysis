import type { ClimbQueueItem, SessionEvent } from '@boardsesh/shared-schema';
import { roomManager } from './room-manager';
import { pubsub } from '../pubsub/index';
import { setCurrentClimbAndPublish } from './queue-navigation';

export type TakeSessionDriverControlOptions = {
  sessionId: string;
  participantId: string;
  climb?: ClimbQueueItem | null;
  originConnectionId?: string | null;
  correlationId?: string | null;
};

/**
 * Claim wall-control authority for a session participant.
 *
 * When a climb is supplied, it is published before the driver swap so a queue
 * failure cannot leave subscribers seeing "new driver, old wall climb".
 */
export async function takeSessionDriverControl({
  sessionId,
  participantId,
  climb,
  originConnectionId = null,
  correlationId = null,
}: TakeSessionDriverControlOptions): Promise<{ previousDriverParticipantId: string | null }> {
  if (climb) {
    await setCurrentClimbAndPublish(sessionId, climb, true, roomManager, pubsub, originConnectionId, correlationId);
  }

  const previousDriverParticipantId = await roomManager.setSessionDriverAndReturnPrevious(sessionId, participantId);

  if (previousDriverParticipantId !== participantId) {
    const event: SessionEvent = {
      __typename: 'DriverChanged',
      driverParticipantId: participantId,
      previousDriverParticipantId,
    };
    pubsub.publishSessionEvent(sessionId, event);
  }

  return { previousDriverParticipantId };
}
