// Thin web wrappers around the shared generator algorithm. Pure slot-planning
// lives in @boardsesh/playlist-generator; the wrappers here resolve the grade
// scale from a BoardName so existing call sites don't have to change.

import { getGradesForBoard } from '@/app/lib/board-data';
import type { BoardName } from '@/app/lib/types';
import {
  generateWorkoutPlan as generateWorkoutPlanShared,
  type GeneratorOptions,
  type PlannedClimbSlot,
} from '@boardsesh/playlist-generator';

export {
  generateVolumePlan,
  generatePyramidPlan,
  generateLadderPlan,
  generateGradeFocusPlan,
  groupSlotsBySection,
} from '@boardsesh/playlist-generator';
export type { GroupedSlots } from '@boardsesh/playlist-generator';

export const generateWorkoutPlan = (options: GeneratorOptions, boardName: BoardName): PlannedClimbSlot[] =>
  generateWorkoutPlanShared(options, getGradesForBoard(boardName));

export const getGradeName = (difficultyId: number, boardName: BoardName): string => {
  const grade = getGradesForBoard(boardName).find((g) => g.difficulty_id === difficultyId);
  return grade?.difficulty_name || `Grade ${difficultyId}`;
};
