import { useReducer } from 'react';
import type { QueueState, QueueAction } from './types';
import type { SearchRequestPagination } from '@/app/lib/types';
import { queueReducer as sharedQueueReducer, initialState as sharedInitialState } from '@boardsesh/queue';

// The shared reducer operates on the shared-schema Climb type (nullable fields),
// while the web app uses its own narrower Climb type. The two are structurally
// compatible at runtime — the shared reducer never widens a non-null field to
// null — so we cast at the boundary to keep downstream web types exact.
export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  return sharedQueueReducer(
    state as Parameters<typeof sharedQueueReducer>[0],
    action as Parameters<typeof sharedQueueReducer>[1],
  ) as unknown as QueueState;
}

export const useQueueReducer = (initialSearchParams: SearchRequestPagination) => {
  return useReducer(queueReducer, sharedInitialState(initialSearchParams) as unknown as QueueState);
};
