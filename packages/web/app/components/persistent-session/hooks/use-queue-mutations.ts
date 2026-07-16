import { useRef } from 'react';
import {
  useQueueMutations as useSharedQueueMutations,
  type QueueMutationsActions as SharedQueueMutationsActions,
} from '@boardsesh/queue-react';
import type { RateLimitRetryEvent } from '@boardsesh/graphql-client';
import type { Client } from '../../graphql-queue/graphql-client';
import type { ClimbQueueItem as LocalClimbQueueItem } from '../../queue-control/types';
import { type Session, toClimbQueueItemInput } from '../types';

type UseQueueMutationsArgs = {
  client: Client | null;
  session: Session | null;
  /** Fired while a throttled mutation backs off to retry — see the caller's
   *  "catching up" snackbar wiring (#2655). */
  onRateLimited?: (event: RateLimitRetryEvent) => void;
};

// The queue-session mutations, typed with the web's own ClimbQueueItem. The
// implementation lives in `@boardsesh/queue-react` (shared with mobile); this
// hook is the web binding — it supplies the connection-manager client, the
// active Session id, and web's rich item->input mapper. See that package for
// the coalescer + cross-session-leak semantics.
export type QueueMutationsActions = SharedQueueMutationsActions<LocalClimbQueueItem>;

export function useQueueMutations({ client, session, onRateLimited }: UseQueueMutationsArgs): QueueMutationsActions {
  // Refs keep the injected getters reading live values without recreating the
  // shared hook's callbacks on every render.
  const clientRef = useRef(client);
  const sessionRef = useRef(session);
  const onRateLimitedRef = useRef(onRateLimited);
  clientRef.current = client;
  sessionRef.current = session;
  onRateLimitedRef.current = onRateLimited;

  // No `ensureReady`: web sessions are already joined (see use-session-lifecycle),
  // so the core actions throw 'Not connected to session' when disconnected —
  // exactly as before.
  return useSharedQueueMutations<LocalClimbQueueItem>({
    getClient: () => clientRef.current,
    getSessionId: () => sessionRef.current?.id ?? null,
    toQueueItemInput: toClimbQueueItemInput,
    onBestEffortError: (action, error) => {
      console.error(`Failed to ${action}:`, error);
    },
    onRateLimited: (event) => onRateLimitedRef.current?.(event),
  });
}
