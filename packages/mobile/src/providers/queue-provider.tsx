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
import { useTranslation } from 'react-i18next';
import { queueReducer, initialState } from '@boardsesh/queue';
import type { QueueState, QueueAction, QueueSearchParams, ClimbQueueItem } from '@boardsesh/queue';
import type { SessionSummary } from '@boardsesh/shared-schema';
import { getWsClient } from '../lib/graphql/ws-client';
import { getHttpClient } from '../lib/graphql/client';
import {
  QUEUE_UPDATES_SUBSCRIPTION,
  ADD_QUEUE_ITEM,
  REMOVE_QUEUE_ITEM,
  SET_CURRENT_CLIMB,
  CREATE_SESSION,
  END_SESSION,
  type AddQueueItemMutationResponse,
  type RemoveQueueItemMutationResponse,
  type SetCurrentClimbMutationResponse,
  type CreateSessionMutationResponse,
  type EndSessionMutationResponse,
} from '../lib/graphql/operations';
import { getStoredBoardConfig } from '../lib/board-store';
import { getStoredSessionId, setStoredSessionId, clearStoredSessionId } from '../lib/session-store';
import { findNextQueueItem, findPreviousQueueItem } from '@boardsesh/play-view';
import { toClimbQueueItem, type SubscriptionQueueItem } from '../lib/queue-conversion';
import { useToast } from './toast-provider';

type QueueContextValue = {
  state: QueueState;
  dispatch: React.Dispatch<QueueAction>;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  addToQueue: (item: ClimbQueueItem) => void;
  removeFromQueue: (uuid: string) => void;
  clearQueue: () => void;
  setCurrentClimb: (item: ClimbQueueItem) => void;
  nextClimb: () => void;
  previousClimb: () => void;
  clearSession: () => Promise<void>;
  endSession: () => Promise<SessionSummary | null>;
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
  const sessionIdRef = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sessionCreationRef = useRef<Promise<string | null> | null>(null);
  const { showToast } = useToast();
  const { t } = useTranslation('session');

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    getStoredSessionId().then((storedId) => {
      if (storedId) setSessionId(storedId);
    });
  }, []);

  useEffect(() => {
    if (!sessionId) {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      return;
    }

    const wsClient = getWsClient();

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
        error: () => {
          showToast(t('mobile.queue.syncError'), 'error');
        },
        complete: () => {},
      },
    );

    unsubscribeRef.current = cleanup;

    return () => {
      cleanup();
      unsubscribeRef.current = null;
    };
  }, [sessionId]);

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (sessionCreationRef.current) return sessionCreationRef.current;

    const createPromise = (async () => {
      const boardConfig = await getStoredBoardConfig();
      if (!boardConfig) return null;

      const boardPath = `${boardConfig.boardName}/${boardConfig.layoutId}/${boardConfig.sizeId}/${boardConfig.setIds}/${boardConfig.angle}`;

      try {
        // Location is a future feature — using 0,0 for sessions created from the queue.
        // When expo-location is integrated, these will come from the device.
        const response = await getHttpClient().request<CreateSessionMutationResponse>(CREATE_SESSION, {
          input: { boardPath, latitude: 0, longitude: 0, discoverable: false },
        });
        const newId = response.createSession.id;
        sessionIdRef.current = newId;
        setSessionId(newId);
        await setStoredSessionId(newId);
        return newId;
      } catch {
        showToast(t('mobile.queue.sessionCreateError'), 'error');
        return null;
      } finally {
        sessionCreationRef.current = null;
      }
    })();

    sessionCreationRef.current = createPromise;
    return createPromise;
  }, []);

  const addToQueue = useCallback(
    (item: ClimbQueueItem) => {
      // Optimistic local dispatch. The server will echo this item via the WS subscription,
      // but the reducer's DELTA_ADD_QUEUE_ITEM handler uses insertQueueItemIdempotent which
      // deduplicates by item.uuid, so the echo is a no-op.
      dispatch({ type: 'DELTA_ADD_QUEUE_ITEM', payload: { item } });

      ensureSession().then((activeSessionId) => {
        if (activeSessionId) {
          getHttpClient()
            .request<AddQueueItemMutationResponse>(ADD_QUEUE_ITEM, {
              item: { uuid: item.uuid, climb: item.climb },
            })
            .catch(() => showToast(t('mobile.queue.actionFailed'), 'error'));
        }
      });
    },
    [ensureSession],
  );

  const removeFromQueue = useCallback((uuid: string) => {
    dispatch({ type: 'DELTA_REMOVE_QUEUE_ITEM', payload: { uuid } });

    if (sessionIdRef.current) {
      getHttpClient()
        .request<RemoveQueueItemMutationResponse>(REMOVE_QUEUE_ITEM, { uuid })
        .catch(() => showToast(t('mobile.queue.actionFailed'), 'error'));
    }
  }, []);

  const clearQueue = useCallback(() => {
    const itemsToRemove = stateRef.current.queue;
    dispatch({ type: 'CLEAR_QUEUE' });

    if (sessionIdRef.current) {
      for (const item of itemsToRemove) {
        getHttpClient()
          .request<RemoveQueueItemMutationResponse>(REMOVE_QUEUE_ITEM, { uuid: item.uuid })
          .catch(() => showToast(t('mobile.queue.actionFailed'), 'error'));
      }
    }
  }, []);

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

      ensureSession().then((activeSessionId) => {
        if (activeSessionId) {
          getHttpClient()
            .request<SetCurrentClimbMutationResponse>(SET_CURRENT_CLIMB, {
              item: { uuid: item.uuid, climb: item.climb },
              shouldAddToQueue: true,
            })
            .catch(() => showToast(t('mobile.queue.actionFailed'), 'error'));
        }
      });
    },
    [ensureSession],
  );

  const nextClimb = useCallback(() => {
    const { queue, currentClimbQueueItem } = stateRef.current;
    const nextItem = findNextQueueItem(queue, currentClimbQueueItem);
    if (nextItem) {
      dispatch({
        type: 'DELTA_UPDATE_CURRENT_CLIMB',
        payload: { item: nextItem, isServerEvent: false },
      });
      ensureSession().then((activeSessionId) => {
        if (activeSessionId) {
          getHttpClient()
            .request<SetCurrentClimbMutationResponse>(SET_CURRENT_CLIMB, {
              item: { uuid: nextItem.uuid, climb: nextItem.climb },
              shouldAddToQueue: false,
            })
            .catch(() => showToast(t('mobile.queue.actionFailed'), 'error'));
        }
      });
    }
  }, [ensureSession]);

  const previousClimb = useCallback(() => {
    const { queue, currentClimbQueueItem } = stateRef.current;
    const prevItem = findPreviousQueueItem(queue, currentClimbQueueItem);
    if (prevItem) {
      dispatch({
        type: 'DELTA_UPDATE_CURRENT_CLIMB',
        payload: { item: prevItem, isServerEvent: false },
      });
      ensureSession().then((activeSessionId) => {
        if (activeSessionId) {
          getHttpClient()
            .request<SetCurrentClimbMutationResponse>(SET_CURRENT_CLIMB, {
              item: { uuid: prevItem.uuid, climb: prevItem.climb },
              shouldAddToQueue: false,
            })
            .catch(() => showToast(t('mobile.queue.actionFailed'), 'error'));
        }
      });
    }
  }, [ensureSession]);

  const clearSession = useCallback(async () => {
    setSessionId(null);
    dispatch({
      type: 'INITIAL_QUEUE_DATA',
      payload: { queue: [], currentClimbQueueItem: null },
    });
    await clearStoredSessionId();
  }, []);

  const endSession = useCallback(async (): Promise<SessionSummary | null> => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return null;

    try {
      const response = await getHttpClient().request<EndSessionMutationResponse>(END_SESSION, {
        sessionId: currentSessionId,
      });
      await clearSession();
      showToast(t('mobile.toast.sessionEnded'), 'success');
      return response.endSession;
    } catch {
      showToast(t('mobile.queue.actionFailed'), 'error');
      return null;
    }
  }, [clearSession, showToast, t]);

  const contextValue = useMemo<QueueContextValue>(
    () => ({
      state,
      dispatch,
      sessionId,
      setSessionId,
      addToQueue,
      removeFromQueue,
      clearQueue,
      setCurrentClimb,
      nextClimb,
      previousClimb,
      clearSession,
      endSession,
    }),
    [
      state,
      sessionId,
      addToQueue,
      removeFromQueue,
      clearQueue,
      setCurrentClimb,
      nextClimb,
      previousClimb,
      clearSession,
      endSession,
    ],
  );

  return <QueueContext.Provider value={contextValue}>{children}</QueueContext.Provider>;
}
