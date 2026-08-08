import { gql } from 'graphql-request';
import type { AnalyzedBetaVideo } from '@boardsesh/shared-schema';

export const GET_ANALYZED_BETA_VIDEOS = gql`
  query GetAnalyzedBetaVideos($boardType: String!, $climbUuid: String!, $layoutId: Int!) {
    analyzedBetaVideos(boardType: $boardType, climbUuid: $climbUuid, layoutId: $layoutId) {
      id
      provider
      providerClimbId
      boardType
      boardLayout
      sourceAccount
      postKey
      postUrl
      mediaItemKey
      mediaItemIndex
      mediaItemCount
      segmentKey
      evidenceScope
      resolutionScope
      assignmentState
      assignmentMethod
      uncertaintyReasons
      isDefinitive
      hasMoveAnalysis
      candidateClimbs {
        normalizedClimbId
        climbId
        climbName
        boardLayout
        grades
        angles
      }
      climb {
        id
        normalizedId
        name
        grade
        angle
        boardLayout
        setterUsername
      }
      playbackPath
      movesPath
    }
  }
`;

export type GetAnalyzedBetaVideosVariables = {
  boardType: string;
  climbUuid: string;
  layoutId: number;
};

export type GetAnalyzedBetaVideosResponse = {
  analyzedBetaVideos: AnalyzedBetaVideo[];
};
