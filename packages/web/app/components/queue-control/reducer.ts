import { useReducer } from 'react';
import type { QueueState, QueueAction } from './types';
import type { SearchRequestPagination } from '@/app/lib/types';
import { queueReducer as sharedQueueReducer, initialState as sharedInitialState } from '@boardsesh/queue';

// The shared reducer uses QueueSearchParams (Record<string, unknown>) for
// climbSearchParams while the web uses the concrete SearchRequestPagination.
// All other fields are structurally identical. We type the wrapper so the
// web's QueueState flows through without casts — the shared reducer treats
// climbSearchParams as an opaque pass-through.
export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  return sharedQueueReducer(state, action) as QueueState;
}

export const useQueueReducer = (initialSearchParams: SearchRequestPagination) => {
  return useReducer(queueReducer, sharedInitialState(initialSearchParams) as QueueState);
};
