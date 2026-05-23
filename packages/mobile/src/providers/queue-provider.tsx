import {
  createContext,
  useContext,
  useReducer,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import { queueReducer, initialState } from '@boardsesh/queue';
import type { QueueState, QueueAction, QueueSearchParams, ClimbQueueItem } from '@boardsesh/queue';
import { getWsClient } from '../lib/graphql/ws-client';
import { QUEUE_UPDATES_SUBSCRIPTION } from '../lib/graphql/operations';
import { findNextQueueItem, findPreviousQueueItem } from '../lib/queue-navigation';
import { toClimbQueueItem, type SubscriptionQueueItem } from '../lib/queue-conversion';

type QueueContextValue = {
  state: QueueState;
  dispatch: React.Dispatch<QueueAction>;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  addToQueue: (item: ClimbQueueItem) => void;
  removeFromQueue: (uuid: string) => void;
  setCurrentClimb: (item: ClimbQueueItem) => void;
  nextClimb: () => void;
  previousClimb: () => void;
};

const QueueContext = createContext<QueueContextValue | null>(null);

export function useQueue(): QueueContextValue {
  const context = useContext(QueueContext);
  if (!context) throw new Error('useQueue must be used within QueueProvider');
  return context;
}

const defaultSearchParams: QueueSearchParams = {};

// -- Subscription event types (used only for the event discriminated union) --

type FullSyncEvent = {
  __typename: 'FullSync';
  sequence: number;
  state: {
    sequence: number;
    stateHash: string;
    queue: SubscriptionQueueItem[];
    currentClimbQueueItem: SubscriptionQueueItem | null;
  };
};

type QueueItemAddedEvent = {
  __typename: 'QueueItemAdded';
  sequence: number;
  stateHash: string;
  item: SubscriptionQueueItem;
  position: number | null;
};

type QueueItemRemovedEvent = {
  __typename: 'QueueItemRemoved';
  sequence: number;
  stateHash: string;
  uuid: string;
};

type CurrentClimbChangedEvent = {
  __typename: 'CurrentClimbChanged';
  sequence: number;
  stateHash: string;
  item: SubscriptionQueueItem | null;
};

type QueueUpdateEvent = FullSyncEvent | QueueItemAddedEvent | QueueItemRemovedEvent | CurrentClimbChangedEvent;

export function QueueProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(queueReducer, defaultSearchParams, initialState);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Subscribe to queue updates when a session is active
  useEffect(() => {
    if (!sessionId) {
      // Tear down any existing subscription
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      return;
    }

    const wsClient = getWsClient();

    // Use the graphql-ws subscribe API
    const cleanup = wsClient.subscribe<{ queueUpdates: QueueUpdateEvent }>(
      {
        query: QUEUE_UPDATES_SUBSCRIPTION,
        variables: { sessionId },
      },
      {
        next: ({ data }) => {
          if (!data?.queueUpdates) return;
          const event = data.queueUpdates;

          switch (event.__typename) {
            case 'FullSync': {
              const queueItems = event.state.queue.map(toClimbQueueItem);
              const currentItem = event.state.currentClimbQueueItem
                ? toClimbQueueItem(event.state.currentClimbQueueItem)
                : null;

              dispatch({
                type: 'INITIAL_QUEUE_DATA',
                payload: {
                  queue: queueItems,
                  currentClimbQueueItem: currentItem,
                },
              });
              break;
            }

            case 'QueueItemAdded': {
              const addedItem = toClimbQueueItem(event.item);
              dispatch({
                type: 'DELTA_ADD_QUEUE_ITEM',
                payload: {
                  item: addedItem,
                  position: event.position ?? undefined,
                },
              });
              break;
            }

            case 'QueueItemRemoved': {
              dispatch({
                type: 'DELTA_REMOVE_QUEUE_ITEM',
                payload: { uuid: event.uuid },
              });
              break;
            }

            case 'CurrentClimbChanged': {
              const changedItem = event.item ? toClimbQueueItem(event.item) : null;
              dispatch({
                type: 'DELTA_UPDATE_CURRENT_CLIMB',
                payload: {
                  item: changedItem,
                  isServerEvent: true,
                  shouldAddToQueue: true,
                },
              });
              break;
            }
          }
        },
        error: (error) => {
          console.error('[QueueProvider] Subscription error:', error);
        },
        complete: () => {
          // Subscription ended (server closed it, session ended, etc.)
        },
      },
    );

    unsubscribeRef.current = cleanup;

    return () => {
      cleanup();
      unsubscribeRef.current = null;
    };
  }, [sessionId]);

  const addToQueue = useCallback(
    (item: ClimbQueueItem) => {
      // Optimistic local dispatch — use DELTA_ADD_QUEUE_ITEM for idempotency
      // so a WS echo of the same item won't create a duplicate
      dispatch({ type: 'DELTA_ADD_QUEUE_ITEM', payload: { item } });

      // Phase 2 gap: server mutation not yet wired. Local-only until
      // GraphQL mutations for queue operations are implemented. Changes
      // are visible locally but not synced to other session participants.
    },
    [],
  );

  const removeFromQueue = useCallback(
    (uuid: string) => {
      dispatch({ type: 'DELTA_REMOVE_QUEUE_ITEM', payload: { uuid } });

      // Phase 2 gap: server mutation not yet wired. Local-only until
      // GraphQL mutations for queue operations are implemented. Changes
      // are visible locally but not synced to other session participants.
    },
    [],
  );

  const setCurrentClimb = useCallback(
    (item: ClimbQueueItem) => {
      dispatch({
        type: 'DELTA_UPDATE_CURRENT_CLIMB',
        payload: {
          item,
          shouldAddToQueue: true,
          isServerEvent: false,
        },
      });

      // Phase 2 gap: server mutation not yet wired. Local-only until
      // GraphQL mutations for queue operations are implemented. Changes
      // are visible locally but not synced to other session participants.
    },
    [],
  );

  const nextClimb = useCallback(() => {
    const { queue, currentClimbQueueItem } = stateRef.current;
    const nextItem = findNextQueueItem(queue, currentClimbQueueItem);
    if (nextItem) {
      dispatch({
        type: 'DELTA_UPDATE_CURRENT_CLIMB',
        payload: { item: nextItem, isServerEvent: false },
      });
    }
  }, []);

  const previousClimb = useCallback(() => {
    const { queue, currentClimbQueueItem } = stateRef.current;
    const prevItem = findPreviousQueueItem(queue, currentClimbQueueItem);
    if (prevItem) {
      dispatch({
        type: 'DELTA_UPDATE_CURRENT_CLIMB',
        payload: { item: prevItem, isServerEvent: false },
      });
    }
  }, []);

  const contextValue = useMemo<QueueContextValue>(
    () => ({
      state,
      dispatch,
      sessionId,
      setSessionId,
      addToQueue,
      removeFromQueue,
      setCurrentClimb,
      nextClimb,
      previousClimb,
    }),
    [state, sessionId, addToQueue, removeFromQueue, setCurrentClimb, nextClimb, previousClimb],
  );

  return <QueueContext.Provider value={contextValue}>{children}</QueueContext.Provider>;
}
