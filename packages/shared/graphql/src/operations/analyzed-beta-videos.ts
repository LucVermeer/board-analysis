import { gql } from 'graphql-request';
import type { AnalyzedBetaMoveAttempt, AnalyzedBetaNavigation, AnalyzedBetaVideo } from '@boardsesh/shared-schema';

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

export const GET_ANALYZED_BETA_NAVIGATION = gql`
  query GetAnalyzedBetaNavigation($boardType: String!, $climbUuid: String!, $layoutId: Int!) {
    analyzedBetaNavigation(boardType: $boardType, climbUuid: $climbUuid, layoutId: $layoutId) {
      confirmedVideoCount
      analyzedVideoCount
      moves {
        moveKey
        targetHolds {
          key
          col
          row
        }
        videoCount
        confirmedVideoCount
        handCounts {
          hand
          count
        }
      }
    }
  }
`;

export type GetAnalyzedBetaNavigationResponse = {
  analyzedBetaNavigation: AnalyzedBetaNavigation;
};

export const GET_ANALYZED_BETA_MOVE_ATTEMPTS = gql`
  query GetAnalyzedBetaMoveAttempts($boardType: String!, $climbUuid: String!, $layoutId: Int!, $moveKey: String!) {
    analyzedBetaMoveAttempts(boardType: $boardType, climbUuid: $climbUuid, layoutId: $layoutId, moveKey: $moveKey) {
      moveKey
      videoId
      sourceAccount
      localMoveId
      localOrdinal
      targetHolds {
        key
        col
        row
      }
      transitions {
        hand
        source {
          key
          col
          row
        }
        destination {
          key
          col
          row
        }
        sourceAssumed
      }
      playbackStartS
      playbackEndS
      confidence
      warnings
      occurrenceCount
    }
  }
`;

export type GetAnalyzedBetaMoveAttemptsResponse = {
  analyzedBetaMoveAttempts: AnalyzedBetaMoveAttempt[];
};
