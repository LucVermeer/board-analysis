import { gql } from 'graphql-request';
import type { ActivityFeedInput, SessionFeedResult, SessionDetail } from '@boardsesh/shared-schema';

// ============================================
// Session-Grouped Feed Queries
// ============================================

const SESSION_FEED_ITEM_FIELDS = `
  sessionId
  sessionType
  sessionName
  ownerUserId
  participants {
    userId
    displayName
    avatarUrl
    sends
    flashes
    attempts
  }
  totalSends
  totalFlashes
  totalAttempts
  tickCount
  gradeDistribution {
    grade
    flash
    send
    attempt
  }
  boardTypes
  hardestGrade
  firstTickAt
  lastTickAt
  durationMinutes
  goal
  upvotes
  downvotes
  voteScore
  commentCount
`;

export const GET_SESSION_GROUPED_FEED = gql`
  query GetSessionGroupedFeed($input: ActivityFeedInput) {
    sessionGroupedFeed(input: $input) {
      sessions {
        ${SESSION_FEED_ITEM_FIELDS}
      }
      cursor
      hasMore
    }
  }
`;

export const GET_SESSION_DETAIL = gql`
  query GetSessionDetail($sessionId: ID!) {
    sessionDetail(sessionId: $sessionId) {
      ${SESSION_FEED_ITEM_FIELDS}
      healthKitWorkoutId
      ticks {
        uuid
        userId
        climbUuid
        climbName
        boardType
        layoutId
        angle
        status
        attemptCount
        difficulty
        difficultyName
        quality
        isMirror
        isBenchmark
        isNoMatch
        comment
        frames
        setterUsername
        climbedAt
        upvotes
        totalAttempts
      }
    }
  }
`;

// ============================================
// Session Editing Mutations
// ============================================

export const UPDATE_INFERRED_SESSION = gql`
  mutation UpdateInferredSession($input: UpdateInferredSessionInput!) {
    updateInferredSession(input: $input) {
      ${SESSION_FEED_ITEM_FIELDS}
      ticks {
        uuid
        userId
        climbUuid
        climbName
        boardType
        layoutId
        angle
        status
        attemptCount
        difficulty
        difficultyName
        quality
        isMirror
        isBenchmark
        isNoMatch
        comment
        frames
        setterUsername
        climbedAt
        upvotes
        totalAttempts
      }
    }
  }
`;

export const ADD_USER_TO_SESSION = gql`
  mutation AddUserToSession($input: AddUserToSessionInput!) {
    addUserToSession(input: $input) {
      ${SESSION_FEED_ITEM_FIELDS}
      ticks {
        uuid
        userId
        climbUuid
        climbName
        boardType
        layoutId
        angle
        status
        attemptCount
        difficulty
        difficultyName
        quality
        isMirror
        isBenchmark
        isNoMatch
        comment
        frames
        setterUsername
        climbedAt
        upvotes
        totalAttempts
      }
    }
  }
`;

export const REMOVE_USER_FROM_SESSION = gql`
  mutation RemoveUserFromSession($input: RemoveUserFromSessionInput!) {
    removeUserFromSession(input: $input) {
      ${SESSION_FEED_ITEM_FIELDS}
      ticks {
        uuid
        userId
        climbUuid
        climbName
        boardType
        layoutId
        angle
        status
        attemptCount
        difficulty
        difficultyName
        quality
        isMirror
        isBenchmark
        isNoMatch
        comment
        frames
        setterUsername
        climbedAt
        upvotes
        totalAttempts
      }
    }
  }
`;

export const SET_SESSION_HEALTHKIT_WORKOUT_ID = gql`
  mutation SetSessionHealthKitWorkoutId($sessionId: ID!, $workoutId: String!) {
    setInferredSessionHealthKitWorkoutId(sessionId: $sessionId, workoutId: $workoutId)
  }
`;

// ============================================
// Query Variable Types
// ============================================

export type GetSessionGroupedFeedQueryVariables = {
  input?: ActivityFeedInput;
};

export type GetSessionGroupedFeedQueryResponse = {
  sessionGroupedFeed: SessionFeedResult;
};

export type GetSessionDetailQueryVariables = {
  sessionId: string;
};

export type GetSessionDetailQueryResponse = {
  sessionDetail: SessionDetail | null;
};
