import { gql } from 'graphql-request';
import type {
  UserProfile,
  UserBoard,
  UserBoardConnection,
  Climb,
  ClimbSearchInput,
  Grade,
  Angle,
  MyBoardsInput,
  SearchBoardsInput,
  SessionSummary,
  PublicUserProfile,
  FollowConnection,
  TickStatus,
} from '@boardsesh/shared-schema';

// ============================================
// Field Fragments (string interpolation, not GQL fragments)
// ============================================

const BOARD_FIELDS = `
  uuid
  slug
  ownerId
  ownerDisplayName
  ownerAvatarUrl
  boardType
  layoutId
  sizeId
  setIds
  name
  description
  locationName
  latitude
  longitude
  isPublic
  isUnlisted
  hideLocation
  isOwned
  angle
  isAngleAdjustable
  createdAt
  layoutName
  sizeName
  sizeDescription
  setNames
  totalAscents
  uniqueClimbers
  followerCount
  commentCount
  isFollowedByMe
  gymId
  gymUuid
  gymName
  distanceMeters
  serialNumber
`;

const CLIMB_SEARCH_FIELDS = `
  uuid
  setter_username
  name
  frames
  angle
  ascensionist_count
  difficulty
  quality_average
  stars
  difficulty_error
  benchmark_difficulty
  is_draft
  is_no_match
  published_at
  created_at
  userAscents
  userAttempts
`;

const CLIMB_DETAIL_FIELDS = `
  uuid
  setter_username
  userId
  name
  description
  frames
  angle
  ascensionist_count
  difficulty
  quality_average
  stars
  difficulty_error
  mirrored
  benchmark_difficulty
  userAscents
  userAttempts
  is_draft
  created_at
  published_at
`;

// ============================================
// User Profile Queries
// ============================================

export const GET_PROFILE = gql`
  query GetProfile {
    profile {
      id
      email
      displayName
      avatarUrl
    }
  }
`;

export type GetProfileQueryResponse = {
  profile: UserProfile | null;
};

export const GET_PUBLIC_PROFILE = gql`
  query GetPublicProfile($userId: ID!) {
    publicProfile(userId: $userId) {
      id
      displayName
      avatarUrl
      followerCount
      followingCount
      isFollowedByMe
    }
  }
`;

export type GetPublicProfileQueryVariables = {
  userId: string;
};

export type GetPublicProfileQueryResponse = {
  publicProfile: PublicUserProfile | null;
};

// ============================================
// Board Configuration Queries
// ============================================

export const GET_GRADES = gql`
  query GetGrades($boardName: String!) {
    grades(boardName: $boardName) {
      difficultyId
      name
    }
  }
`;

export type GetGradesQueryVariables = {
  boardName: string;
};

export type GetGradesQueryResponse = {
  grades: Grade[];
};

export const GET_ANGLES = gql`
  query GetAngles($boardName: String!, $layoutId: Int!) {
    angles(boardName: $boardName, layoutId: $layoutId) {
      angle
    }
  }
`;

export type GetAnglesQueryVariables = {
  boardName: string;
  layoutId: number;
};

export type GetAnglesQueryResponse = {
  angles: Angle[];
};

// ============================================
// Board Entity Queries
// ============================================

export const GET_MY_BOARDS = gql`
  query GetMyBoards($input: MyBoardsInput) {
    myBoards(input: $input) {
      boards {
        ${BOARD_FIELDS}
      }
      totalCount
      hasMore
    }
  }
`;

export type GetMyBoardsQueryVariables = {
  input?: MyBoardsInput;
};

export type GetMyBoardsQueryResponse = {
  myBoards: UserBoardConnection;
};

export const GET_DEFAULT_BOARD = gql`
  query GetDefaultBoard {
    defaultBoard {
      ${BOARD_FIELDS}
    }
  }
`;

export type GetDefaultBoardQueryResponse = {
  defaultBoard: UserBoard | null;
};

export const GET_BOARD = gql`
  query GetBoard($boardUuid: ID!) {
    board(boardUuid: $boardUuid) {
      ${BOARD_FIELDS}
    }
  }
`;

export type GetBoardQueryVariables = {
  boardUuid: string;
};

export type GetBoardQueryResponse = {
  board: UserBoard | null;
};

export const SEARCH_BOARDS = gql`
  query SearchBoards($input: SearchBoardsInput!) {
    searchBoards(input: $input) {
      boards {
        ${BOARD_FIELDS}
      }
      totalCount
      hasMore
    }
  }
`;

export type SearchBoardsQueryVariables = {
  input: SearchBoardsInput;
};

export type SearchBoardsQueryResponse = {
  searchBoards: UserBoardConnection;
};

export const GET_BOARDS_BY_SERIAL_NUMBERS = gql`
  query GetBoardsBySerialNumbers($serialNumbers: [String!]!) {
    boardsBySerialNumbers(serialNumbers: $serialNumbers) {
      ${BOARD_FIELDS}
    }
  }
`;

export type GetBoardsBySerialNumbersQueryVariables = {
  serialNumbers: string[];
};

export type GetBoardsBySerialNumbersQueryResponse = {
  boardsBySerialNumbers: UserBoard[];
};

// ============================================
// Climb Queries
// ============================================

export const SEARCH_CLIMBS = gql`
  query SearchClimbs($input: ClimbSearchInput!) {
    searchClimbs(input: $input) {
      climbs {
        ${CLIMB_SEARCH_FIELDS}
      }
      hasMore
    }
  }
`;

export type SearchClimbsQueryVariables = {
  input: ClimbSearchInput;
};

export type SearchClimbsQueryResponse = {
  searchClimbs: {
    climbs: Climb[];
    hasMore: boolean;
  };
};

export const SEARCH_CLIMBS_COUNT = gql`
  query SearchClimbsCount($input: ClimbSearchInput!) {
    searchClimbs(input: $input) {
      totalCount
    }
  }
`;

export type SearchClimbsCountQueryResponse = {
  searchClimbs: {
    totalCount: number;
  };
};

export const GET_CLIMB = gql`
  query GetClimb(
    $boardName: String!
    $layoutId: Int!
    $sizeId: Int!
    $setIds: String!
    $angle: Int!
    $climbUuid: ID!
  ) {
    climb(
      boardName: $boardName
      layoutId: $layoutId
      sizeId: $sizeId
      setIds: $setIds
      angle: $angle
      climbUuid: $climbUuid
    ) {
      ${CLIMB_DETAIL_FIELDS}
    }
  }
`;

export type GetClimbQueryVariables = {
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
  climbUuid: string;
};

export type GetClimbQueryResponse = {
  climb: Climb | null;
};

// ============================================
// Session Queries & Mutations
// ============================================

const SESSION_SUMMARY_FIELDS = `
  sessionId
  totalSends
  totalAttempts
  gradeDistribution {
    grade
    count
  }
  hardestClimb {
    climbUuid
    climbName
    grade
  }
  participants {
    userId
    displayName
    avatarUrl
    sends
    attempts
  }
  startedAt
  endedAt
  durationMinutes
  goal
`;

export const CREATE_SESSION = gql`
  mutation CreateSession($input: CreateSessionInput!) {
    createSession(input: $input) {
      id
      name
      boardPath
      goal
      isPublic
      isPermanent
      color
      startedAt
    }
  }
`;

export type CreateSessionInput = {
  boardPath: string;
  latitude: number;
  longitude: number;
  name?: string;
  discoverable: boolean;
  goal?: string;
  isPermanent?: boolean;
  boardIds?: number[];
  color?: string;
};

export type CreateSessionMutationVariables = {
  input: CreateSessionInput;
};

export type CreateSessionMutationResponse = {
  createSession: {
    id: string;
    name: string | null;
    boardPath: string;
    goal: string | null;
    isPublic: boolean;
    isPermanent: boolean;
    color: string | null;
    startedAt: string;
  };
};

export const END_SESSION = gql`
  mutation EndSession($sessionId: ID!) {
    endSession(sessionId: $sessionId) {
      ${SESSION_SUMMARY_FIELDS}
    }
  }
`;

export type EndSessionMutationVariables = {
  sessionId: string;
};

export type EndSessionMutationResponse = {
  endSession: SessionSummary | null;
};

export const GET_SESSION_SUMMARY = gql`
  query GetSessionSummary($sessionId: ID!) {
    sessionSummary(sessionId: $sessionId) {
      ${SESSION_SUMMARY_FIELDS}
    }
  }
`;

export type GetSessionSummaryQueryVariables = {
  sessionId: string;
};

export type GetSessionSummaryQueryResponse = {
  sessionSummary: SessionSummary | null;
};

export const GET_NEARBY_SESSIONS = gql`
  query GetNearbySessions($latitude: Float!, $longitude: Float!, $radiusMeters: Float) {
    nearbySessions(latitude: $latitude, longitude: $longitude, radiusMeters: $radiusMeters) {
      id
      name
      boardPath
      participantCount
      distance
      color
    }
  }
`;

export type GetNearbySessionsQueryVariables = {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
};

export type DiscoverableSessionItem = {
  id: string;
  name: string | null;
  boardPath: string;
  participantCount: number;
  distance: number;
  color: string | null;
};

export type GetNearbySessionsQueryResponse = {
  nearbySessions: DiscoverableSessionItem[];
};

// ============================================
// Tick Queries & Mutations
// ============================================

export const SAVE_TICK = gql`
  mutation SaveTick($input: SaveTickInput!) {
    saveTick(input: $input) {
      uuid
      climbUuid
      angle
      isMirror
      status
      attemptCount
      quality
      difficulty
      comment
      climbedAt
    }
  }
`;

export type SaveTickMutationVariables = {
  input: {
    boardType: string;
    climbUuid: string;
    angle: number;
    isMirror: boolean;
    status: TickStatus;
    attemptCount: number;
    quality?: number | null;
    difficulty?: number | null;
    isBenchmark: boolean;
    comment: string;
    climbedAt: string;
    sessionId?: string;
    layoutId?: number;
    sizeId?: number;
    setIds?: string;
  };
};

export type SaveTickMutationResponse = {
  saveTick: {
    uuid: string;
    climbUuid: string;
    angle: number;
    isMirror: boolean;
    status: string;
    attemptCount: number;
    quality: number | null;
    difficulty: number | null;
    comment: string;
    climbedAt: string;
  };
};

export const TOGGLE_FAVORITE = gql`
  mutation ToggleFavorite($input: ToggleFavoriteInput!) {
    toggleFavorite(input: $input) {
      favorited
    }
  }
`;

export type ToggleFavoriteMutationVariables = {
  input: {
    boardName: string;
    climbUuid: string;
    angle: number;
  };
};

export type ToggleFavoriteMutationResponse = {
  toggleFavorite: {
    favorited: boolean;
  };
};

// ============================================
// Queue Mutations
// ============================================

export const ADD_QUEUE_ITEM = gql`
  mutation AddQueueItem($item: ClimbQueueItemInput!, $position: Int) {
    addQueueItem(item: $item, position: $position) {
      uuid
      climb {
        uuid
        name
        frames
      }
    }
  }
`;

export type AddQueueItemMutationVariables = {
  item: {
    uuid: string;
    climb: {
      uuid: string;
      name: string;
      frames: string;
      setter_username: string;
      angle: number;
      ascensionist_count: number;
      difficulty: string;
      quality_average: string;
      stars: number;
      difficulty_error: string;
      benchmark_difficulty: string | null;
    };
  };
  position?: number;
};

export type AddQueueItemMutationResponse = {
  addQueueItem: {
    uuid: string;
    climb: { uuid: string; name: string; frames: string };
  };
};

export const REMOVE_QUEUE_ITEM = gql`
  mutation RemoveQueueItem($uuid: ID!) {
    removeQueueItem(uuid: $uuid)
  }
`;

export type RemoveQueueItemMutationVariables = {
  uuid: string;
};

export type RemoveQueueItemMutationResponse = {
  removeQueueItem: boolean;
};

export const SET_CURRENT_CLIMB = gql`
  mutation SetCurrentClimb($item: ClimbQueueItemInput, $shouldAddToQueue: Boolean, $correlationId: ID) {
    setCurrentClimb(item: $item, shouldAddToQueue: $shouldAddToQueue, correlationId: $correlationId) {
      uuid
      climb {
        uuid
        name
        frames
      }
    }
  }
`;

export type SetCurrentClimbMutationVariables = {
  item: {
    uuid: string;
    climb: {
      uuid: string;
      name: string;
      frames: string;
      setter_username: string;
      angle: number;
      ascensionist_count: number;
      difficulty: string;
      quality_average: string;
      stars: number;
      difficulty_error: string;
      benchmark_difficulty: string | null;
    };
  } | null;
  shouldAddToQueue?: boolean;
  correlationId?: string;
};

export type SetCurrentClimbMutationResponse = {
  setCurrentClimb: {
    uuid: string;
    climb: { uuid: string; name: string; frames: string };
  } | null;
};

// ============================================
// Social Queries
// ============================================

export const GET_FOLLOWERS = gql`
  query GetFollowers($input: FollowListInput!) {
    followers(input: $input) {
      users {
        id
        displayName
        avatarUrl
        followerCount
        followingCount
        isFollowedByMe
      }
      totalCount
      hasMore
    }
  }
`;

export type GetFollowersQueryVariables = {
  input: { userId: string; limit?: number; offset?: number };
};

export type GetFollowersQueryResponse = {
  followers: FollowConnection;
};

export const GET_FOLLOWING = gql`
  query GetFollowing($input: FollowListInput!) {
    following(input: $input) {
      users {
        id
        displayName
        avatarUrl
        followerCount
        followingCount
        isFollowedByMe
      }
      totalCount
      hasMore
    }
  }
`;

export type GetFollowingQueryVariables = {
  input: { userId: string; limit?: number; offset?: number };
};

export type GetFollowingQueryResponse = {
  following: FollowConnection;
};

export const FOLLOW_USER = gql`
  mutation FollowUser($input: FollowInput!) {
    followUser(input: $input)
  }
`;

export type FollowUserMutationVariables = {
  input: { userId: string };
};

export type FollowUserMutationResponse = {
  followUser: boolean;
};

export const UNFOLLOW_USER = gql`
  mutation UnfollowUser($input: FollowInput!) {
    unfollowUser(input: $input)
  }
`;

export type UnfollowUserMutationVariables = {
  input: { userId: string };
};

export type UnfollowUserMutationResponse = {
  unfollowUser: boolean;
};

// ============================================
// Subscription Operations
//
// Subscriptions are plain strings (not gql-tagged) because they go
// through graphql-ws, not graphql-request's HTTP transport.
// ============================================

export const SESSION_UPDATES_SUBSCRIPTION = `
  subscription SessionUpdates($sessionId: ID!) {
    sessionUpdates(sessionId: $sessionId) {
      __typename
      ... on UserJoined {
        user { id username isLeader avatarUrl userId connectionState }
      }
      ... on UserLeft {
        userId
      }
      ... on UserPresenceChanged {
        user { id username isLeader avatarUrl userId connectionState }
      }
      ... on LeaderChanged {
        leaderId
        leaderConnectionId
      }
      ... on DriverChanged {
        driverParticipantId
        previousDriverParticipantId
      }
      ... on SessionEnded {
        reason
        newPath
      }
    }
  }
`;

export const QUEUE_UPDATES_SUBSCRIPTION = `
  subscription QueueUpdates($sessionId: ID!) {
    queueUpdates(sessionId: $sessionId) {
      __typename
      ... on FullSync {
        sequence
        state {
          sequence
          stateHash
          queue { uuid climb { uuid name frames } }
          currentClimbQueueItem { uuid climb { uuid name frames } }
        }
      }
      ... on QueueItemAdded {
        sequence
        stateHash
        item { uuid climb { uuid name frames } }
        position
      }
      ... on QueueItemRemoved {
        sequence
        stateHash
        uuid
      }
      ... on CurrentClimbChanged {
        sequence
        stateHash
        item { uuid climb { uuid name frames } }
      }
    }
  }
`;

export const NOTIFICATION_RECEIVED_SUBSCRIPTION = `
  subscription NotificationReceived {
    notificationReceived {
      notification {
        uuid
        type
        actorId
        actorDisplayName
        actorAvatarUrl
        entityType
        entityId
        commentBody
        climbName
        climbUuid
        boardType
        proposalUuid
        isRead
        createdAt
      }
    }
  }
`;
