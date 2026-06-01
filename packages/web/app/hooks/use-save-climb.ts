'use client';

// Re-export module: the save-climb / update-climb hooks + pure helpers
// live in `@boardsesh/board-react`. Web call sites keep importing from
// this path for backward compatibility.

export { useSaveClimb, useUpdateClimb, toSaveClimbInput, isDuplicateClimbError } from '@boardsesh/board-react';
export type { SaveClimbOptions, SaveClimbResponse, UpdateClimbResponse } from '@boardsesh/board-react';
