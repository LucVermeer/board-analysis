import { type Dispatch, type RefObject, useEffect } from 'react';
import type { SubscriptionQueueEvent } from '@boardsesh/shared-schema';
import type { ClimbQueueItem, QueueAction } from '../../queue-control/types';
import { track } from '@/app/lib/analytics';

type UseQueueEventSubscriptionParams = {
  isPersistentSessionActive: boolean;
  dispatch: Dispatch<QueueAction>;
  persistentSession: {
    clientId: string | null;
    subscribeToQueueEvents: (callback: (event: SubscriptionQueueEvent) => void) => () => void;
    triggerResync: () => void;
  };
  needsResync: boolean;
  // Used to label peer-originated queue events with the local board layout.
  boardLayoutName?: string | null;
  // Read at event time so peer-broadcast events report the live queue length.
  // Passed as a ref (not a closure) so the subscription effect doesn't tear
  // down and re-subscribe on every render — a wrapper function would change
  // identity each render and re-arm the deps array, briefly leaving the
  // socket unsubscribed and dropping in-flight peer events.
  queueLengthRef?: RefObject<number>;
};

/**
 * Subscribes to queue events from the persistent session (party mode)
 * and dispatches delta actions to the reducer. Also handles resync
 * when corrupted data is detected.
 */
export function useQueueEventSubscription({
  isPersistentSessionActive,
  dispatch,
  persistentSession,
  needsResync,
  boardLayoutName,
  queueLengthRef,
}: UseQueueEventSubscriptionParams) {
  // Subscribe to queue events from persistent session
  useEffect(() => {
    if (!isPersistentSessionActive) return;

    const unsubscribe = persistentSession.subscribeToQueueEvents((event: SubscriptionQueueEvent) => {
      switch (event.__typename) {
        case 'FullSync':
          dispatch({
            type: 'INITIAL_QUEUE_DATA',
            payload: {
              queue: event.state.queue as ClimbQueueItem[],
              currentClimbQueueItem: event.state.currentClimbQueueItem as ClimbQueueItem | null,
            },
          });
          break;
        case 'QueueItemAdded':
          dispatch({
            type: 'DELTA_ADD_QUEUE_ITEM',
            payload: {
              item: event.addedItem as ClimbQueueItem,
              position: event.position ?? undefined,
            },
          });
          track('Climb Added to Queue', {
            boardLayout: boardLayoutName ?? null,
            addedFromTab: 'peer_broadcast',
            currentQueueLength: (queueLengthRef?.current ?? 0) + 1,
            partyMode: true,
          });
          break;
        case 'QueueItemRemoved':
          dispatch({
            type: 'DELTA_REMOVE_QUEUE_ITEM',
            payload: { uuid: event.uuid },
          });
          track('Climb Removed from Queue', {
            boardLayout: boardLayoutName ?? null,
            partyMode: true,
            removedBy: 'peer',
          });
          break;
        case 'QueueReordered':
          dispatch({
            type: 'DELTA_REORDER_QUEUE_ITEM',
            payload: {
              uuid: event.uuid,
              oldIndex: event.oldIndex,
              newIndex: event.newIndex,
            },
          });
          break;
        case 'CurrentClimbChanged':
          dispatch({
            type: 'DELTA_UPDATE_CURRENT_CLIMB',
            payload: {
              item: event.currentItem as ClimbQueueItem | null,
              shouldAddToQueue: (event.currentItem as ClimbQueueItem | null)?.suggested ?? false,
              isServerEvent: true,
              eventClientId: event.clientId || undefined,
              myClientId: persistentSession.clientId || undefined,
              serverCorrelationId: event.correlationId || undefined,
            },
          });
          break;
        case 'ClimbMirrored':
          // Pass the server-issued mirroredUuid so the reducer can suppress
          // the mutation when the local current climb has drifted to a
          // different uuid (peer navigated away mid-mirror). Without this
          // guard the local view would mirror the wrong climb in that race
          // until the next FullSync corrects it.
          dispatch({
            type: 'DELTA_MIRROR_CURRENT_CLIMB',
            payload: { mirrored: event.mirrored, mirroredUuid: event.mirroredUuid ?? null },
          });
          break;
      }
    });

    return unsubscribe;
  }, [isPersistentSessionActive, persistentSession, dispatch, boardLayoutName, queueLengthRef]);

  // Trigger resync when corrupted data is detected
  useEffect(() => {
    if (!needsResync || !isPersistentSessionActive) return;

    console.info('[QueueContext] Corrupted data detected, triggering resync');
    dispatch({ type: 'CLEAR_RESYNC_FLAG' });
    persistentSession.triggerResync();
  }, [needsResync, isPersistentSessionActive, persistentSession, dispatch]);
}
