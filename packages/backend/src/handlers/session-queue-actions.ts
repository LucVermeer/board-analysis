import { roomManager } from '../services/room-manager';
import { pubsub } from '../pubsub/index';
import { navigateToQueueItem, setCurrentClimbAndPublish } from '../services/queue-navigation';

export type NavigateAction = 'next' | 'previous';

/**
 * Outcome of {@link navigateSessionQueue}. A discriminated union so each caller
 * maps it to its own HTTP status + analytics without re-deriving the queue math.
 * The extra index/length fields on `ok`/`out_of_bounds` carry exactly what the
 * iOS-widget analytics payload needs (`queueLength`, `serverCurrentIndex`,
 * `targetIndex`).
 */
export type NavigateOutcome =
  | { kind: 'ok'; currentIndex: number; queueLength: number; serverCurrentIndex: number; targetIndex: number }
  | { kind: 'queue_empty' }
  | { kind: 'out_of_bounds'; queueLength: number; serverCurrentIndex: number; targetIndex: number };

/**
 * Advance/rewind a session's current climb by one queue position, wrapping at
 * the ends, and publish the resulting `CurrentClimbChanged` to every member.
 *
 * The server resolves the authoritative current index from `roomManager`
 * (never trusting a client-supplied index — a peer may have moved the queue),
 * so both the iOS lock-screen widget (`/api/widget/navigate`) and the Garmin
 * watch (`/api/session/navigate`) share one implementation of the index math +
 * event publish. `correlationId` tags the published event so the originating
 * client can echo-suppress its own change.
 */
export async function navigateSessionQueue(
  sessionId: string,
  action: NavigateAction,
  correlationId: string,
): Promise<NavigateOutcome> {
  const queueState = await roomManager.getQueueState(sessionId);
  const queueLength = queueState.queue.length;

  if (queueLength === 0) {
    return { kind: 'queue_empty' };
  }

  // Use the server's authoritative current index, not any client-supplied one
  // which may be stale (another user changed the climb while the caller's local
  // state was out of date).
  const currentItem = queueState.currentClimbQueueItem;
  const serverCurrentIndex = currentItem ? queueState.queue.findIndex((q) => q.uuid === currentItem.uuid) : 0;
  const baseIndex = serverCurrentIndex >= 0 ? serverCurrentIndex : 0;

  let targetIndex: number;
  if (action === 'next') {
    targetIndex = baseIndex + 1;
    if (targetIndex >= queueLength) {
      targetIndex = 0;
    }
  } else {
    targetIndex = baseIndex - 1;
    if (targetIndex < 0) {
      targetIndex = queueLength - 1;
    }
  }

  const result = await navigateToQueueItem(sessionId, targetIndex, roomManager, pubsub, undefined, correlationId);

  if (!result) {
    return { kind: 'out_of_bounds', queueLength, serverCurrentIndex, targetIndex };
  }

  return { kind: 'ok', currentIndex: targetIndex, queueLength, serverCurrentIndex, targetIndex };
}

/**
 * Re-assert the session's current climb: re-publish it as the current climb so
 * any BLE-capable phone in the session re-sends it to the wall. With no current
 * climb it's a successful no-op. Shared by `/api/widget/take-control` and
 * `/api/session/take-control`.
 */
export async function reassertSessionCurrentClimb(sessionId: string, correlationId: string): Promise<void> {
  const queueState = await roomManager.getQueueState(sessionId);
  const currentItem = queueState.currentClimbQueueItem;
  if (!currentItem) {
    return;
  }
  // shouldAddToQueue=false — the climb is already in the queue, so this only
  // re-publishes CurrentClimbChanged to every member.
  await setCurrentClimbAndPublish(sessionId, currentItem, false, roomManager, pubsub, undefined, correlationId);
}
