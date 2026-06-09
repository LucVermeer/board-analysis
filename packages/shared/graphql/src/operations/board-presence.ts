// GraphQL operations for board presence ("now on the wall").
//
// A board's live feed is keyed on the shared board_id (userBoards.id, resolved
// from the BLE serial). The subscription streams the climb currently lit; the
// queries backfill recent history + durable stats; the mutations report a fresh
// send and bind a serial to a board. Modelled on the queue-session operations
// in queue-session.ts so codegen (documents glob `packages/shared/graphql/src/**`)
// picks these up the same way.

// All display + ordering fields of a BoardPresenceClimb. Reused across the
// subscription, the recent-climbs query, and anywhere a climb is rendered on
// the wall feed so every surface decodes the same shape.
const BOARD_PRESENCE_CLIMB_FIELDS = `
  climbUuid
  queueItemUuid
  name
  grade
  gradeColor
  frames
  angle
  setter
  sentByDisplayName
  sentByAvatarUrl
  sentAt
  seq
`;

// Subscription — the live "now on the wall" feed for a board. Emits a
// BoardPresenceEvent union discriminated by __typename: a BoardClimbSet carries
// the full climb, a BoardClimbCleared carries only the clear timestamp + seq.
export const BOARD_NOW_PLAYING = `
  subscription BoardNowPlaying($boardId: Int!) {
    boardNowPlaying(boardId: $boardId) {
      __typename
      ... on BoardClimbSet {
        climb {
          ${BOARD_PRESENCE_CLIMB_FIELDS}
        }
      }
      ... on BoardClimbCleared {
        clearedAt
        seq
      }
    }
  }
`;

// Mutation — report the climb a connected phone just lit on the wall. The
// sender's identity is server-derived; this is fire-and-forget after the BLE
// write succeeds. Returns Boolean! (accepted).
export const REPORT_BOARD_CLIMB = `
  mutation ReportBoardClimb($boardId: Int!, $climb: ClimbQueueItemInput!, $angle: Int) {
    reportBoardClimb(boardId: $boardId, climb: $climb, angle: $angle)
  }
`;

// Mutation — resolve (and bind) the shared board for a BLE serial. Called once
// on BLE connect; the board-config args are used only to create the board the
// first time a serial is seen. Returns the one board everyone at this wall shares.
export const RESOLVE_BOARD_FOR_SERIAL = `
  mutation ResolveBoardForSerial(
    $serial: String!
    $boardType: String!
    $layoutId: Int!
    $sizeId: Int!
    $setIds: String!
  ) {
    resolveBoardForSerial(
      serial: $serial
      boardType: $boardType
      layoutId: $layoutId
      sizeId: $sizeId
      setIds: $setIds
    ) {
      boardId
      boardName
      boardType
      layoutId
      sizeId
      setIds
    }
  }
`;

// Query — newest-first recent climbs for a board, used by a late joiner to
// backfill history before following the live subscription.
export const BOARD_RECENT_CLIMBS = `
  query BoardRecentClimbs($boardId: Int!) {
    boardRecentClimbs(boardId: $boardId) {
      ${BOARD_PRESENCE_CLIMB_FIELDS}
    }
  }
`;

// Query — durable + live stats for a board's wall feed.
export const BOARD_PRESENCE_STATS = `
  query BoardPresenceStats($boardId: Int!) {
    boardPresenceStats(boardId: $boardId) {
      climbsSentCount
      distinctClimbersCount
      hardestGrade
      topGrade
      lastSentAt
    }
  }
`;
