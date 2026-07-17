import { eq, asc, and } from 'drizzle-orm';
import type { QueryResolvers } from '@boardsesh/shared-schema/generated';
import { ANGLES } from '@boardsesh/board-config';
import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { validateInput } from '../shared/helpers';
import { BoardNameSchema } from '../../../validation/schemas';

export const boardQueries: Pick<QueryResolvers, 'grades' | 'angles'> = {
  grades: async (_, { boardName }) => {
    validateInput(BoardNameSchema, boardName, 'boardName');

    const grades = await db
      .select({
        difficultyId: dbSchema.boardDifficultyGrades.difficulty,
        name: dbSchema.boardDifficultyGrades.boulderName,
      })
      .from(dbSchema.boardDifficultyGrades)
      .where(
        and(eq(dbSchema.boardDifficultyGrades.boardType, boardName), eq(dbSchema.boardDifficultyGrades.isListed, true)),
      )
      .orderBy(asc(dbSchema.boardDifficultyGrades.difficulty));

    return grades.map((g) => ({
      difficultyId: g.difficultyId,
      name: g.name || '',
    }));
  },

  angles: async (_, { boardName }) => {
    const validatedBoardName = validateInput(BoardNameSchema, boardName, 'boardName');

    // Aurora doesn't sync a per-layout angle table (deliberately excluded —
    // see packages/aurora-sync/src/sync/shared-sync.ts). Every layout for a
    // given board type supports the same fixed angle range, hardcoded in
    // ANGLES (packages/shared/board-config/src/board-data.ts). The `layoutId`
    // argument is kept for API compatibility but doesn't affect the result.
    return ANGLES[validatedBoardName].map((angle) => ({ angle }));
  },
};
