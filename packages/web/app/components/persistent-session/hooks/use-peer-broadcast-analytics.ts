import { useEffect, useRef, type RefObject } from 'react';
import type { SubscriptionQueueEvent } from '@boardsesh/shared-schema';
import { track } from '@/app/lib/analytics';

type UsePeerBroadcastAnalyticsParams = {
  subscribeToQueueEvents: (callback: (event: SubscriptionQueueEvent) => void) => () => void;
  /**
   * True when the current route is a board route. Read via a ref internally
   * (mirrored every render) so the subscription effect below doesn't tear
   * down and re-subscribe on every route change.
   */
  isOnBoardRoute: boolean;
  boardLayoutName: string | null;
  /**
   * The live queue array, read (via `.length`) at event time so
   * peer-broadcast events report the current queue length. Passed as a ref
   * (not a closure/number prop) so the subscription effect below doesn't
   * tear down and re-subscribe on every queue change — `persistent-session-context.tsx`
   * already mirrors `eventProcessor.queue` into a ref every render for
   * exactly this purpose (`queueRef`).
   */
  queueRef: RefObject<{ length: number }>;
};

/**
 * Peer-broadcast queue-add/-remove analytics.
 *
 * Moved from the deleted board-route hook `graphql-queue/hooks/use-queue-event-subscription.ts`
 * (W6: board routes read root queue state directly instead of mirroring
 * events through their own subscription, so that hook's job — dispatching a
 * mirrored copy of the action — no longer exists; only its analytics
 * side-effect survives, relocated here to the root).
 *
 * `isOnBoardRoute` is the one behavior difference this relocation has to
 * restate explicitly: the old hook only ever ran inside `GraphQLQueueProvider`,
 * which only mounts on board routes, so off-board surfaces never fired this
 * analytics. The root persistent-session provider is always mounted (on AND
 * off board routes) — without this gate, the same analytics would start
 * firing off-board too, a parity regression.
 *
 * Fires on every `QueueItemAdded`/`QueueItemRemoved` event this client's
 * queue subscription receives — including echoes of this client's own
 * mutations. The wire protocol never suppresses self-echoes for add/remove
 * (only `CurrentClimbChanged` carries a clientId for that); this mirrors the
 * old hook's behavior exactly — it never filtered self vs peer either.
 */
export function usePeerBroadcastAnalytics({
  subscribeToQueueEvents,
  isOnBoardRoute,
  boardLayoutName,
  queueRef,
}: UsePeerBroadcastAnalyticsParams) {
  const isOnBoardRouteRef = useRef(isOnBoardRoute);
  isOnBoardRouteRef.current = isOnBoardRoute;
  const boardLayoutNameRef = useRef(boardLayoutName);
  boardLayoutNameRef.current = boardLayoutName;

  useEffect(() => {
    const unsubscribe = subscribeToQueueEvents((event: SubscriptionQueueEvent) => {
      if (!isOnBoardRouteRef.current) return;
      if (event.__typename === 'QueueItemAdded') {
        // Malformed payload (no item): the reducer skips these (the wire
        // mapper returns kind 'ignore'), and the old hook gated analytics on
        // that dispatch actually happening. Keep the parity — no state
        // change, no analytics.
        if (!event.addedItem) return;
        track('Climb Added to Queue', {
          boardLayout: boardLayoutNameRef.current,
          addedFromTab: 'peer_broadcast',
          currentQueueLength: (queueRef.current?.length ?? 0) + 1,
          partyMode: true,
        });
      } else if (event.__typename === 'QueueItemRemoved') {
        // TODO(#3383): `removedBy: 'peer'` mislabels echoes of THIS client's
        // own removes. `QueueItemRemoved` has no `clientId` (unlike
        // `CurrentClimbChanged`), so self-echoes can't be filtered here — a
        // proper fix needs the wire field. Left hardcoded until then.
        track('Climb Removed from Queue', {
          boardLayout: boardLayoutNameRef.current,
          partyMode: true,
          removedBy: 'peer',
        });
      }
    });
    return unsubscribe;
  }, [subscribeToQueueEvents, queueRef]);
}
