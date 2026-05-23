import { useReducer } from 'react';
import type { SearchRequestPagination } from '@/app/lib/types';
import { queueReducer, initialState } from '@boardsesh/queue';

export { queueReducer };

export const useQueueReducer = (initialSearchParams: SearchRequestPagination) => {
  return useReducer(queueReducer, initialState(initialSearchParams));
};
