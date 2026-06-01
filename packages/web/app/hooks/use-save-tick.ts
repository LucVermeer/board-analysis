'use client';

// Re-export module: the save-tick hook + pure helpers live in
// `@boardsesh/board-react`. Web call sites keep importing from this
// path for backward compatibility.

export {
  useSaveTick,
  buildOptimisticTickEntry,
  applySavedTickToLogbook,
  rollbackOptimisticTick,
} from '@boardsesh/board-react';
export type { SaveTickOptions } from '@boardsesh/board-react';
