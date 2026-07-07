import { gql } from 'graphql-request';

export const BOARDSESH_GRADE = gql`
  query BoardseshGrade($boardName: String!, $climbUuid: String!, $angle: Int!) {
    boardseshGrade(boardName: $boardName, climbUuid: $climbUuid, angle: $angle) {
      localGrade
      universalGrade
      gradeLow
      gradeHigh
      confidence
      ascensionistCount
      modelVersion
      computedAt
    }
  }
`;

export type BoardseshGrade = {
  localGrade: number | null;
  universalGrade: number | null;
  gradeLow: number | null;
  gradeHigh: number | null;
  confidence: string;
  ascensionistCount: number;
  modelVersion: string;
  computedAt: string;
};

export type BoardseshGradeVariables = {
  boardName: string;
  climbUuid: string;
  angle: number;
};

export type BoardseshGradeResponse = {
  boardseshGrade: BoardseshGrade | null;
};
