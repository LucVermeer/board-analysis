export const boardPresenceTypeDefs = /* GraphQL */ `
  # ============================================
  # Board Presence — "now on the wall"
  #
  # Real-time view of the climb currently lit on a shared physical board,
  # keyed on a shared board_id (userBoards.id, resolved from the BLE serial).
  # Decoupled from sessions: anyone who has connected to the board can watch
  # its live feed. Membership-free, no driver. See docs / the board-presence epic.
  # ============================================

  """
  A climb reported as lit on a physical board. Denormalised for display (mirrors
  the ESP32 LedUpdate payload) plus server-derived attribution and ordering.
  """
  type BoardPresenceClimb {
    "UUID of the climb lit on the wall"
    climbUuid: String!
    "Queue item UUID that triggered the send, if any (disambiguates duplicates)"
    queueItemUuid: String
    "Climb name"
    name: String
    "Grade name (e.g. V6 / 7A+) at the reported angle"
    grade: String
    "Grade colour as a hex string"
    gradeColor: String
    "Aurora frames string for rendering a thumbnail"
    frames: String
    "Board angle in degrees. Null means unspecified (0 is a valid angle)."
    angle: Int
    "Catalog route setter display name (who set the climb)"
    setter: String
    "Display name of the Boardsesh user who lit it. Server-derived from the caller; never client-supplied."
    sentByDisplayName: String
    "Avatar URL of the user who lit it. Server-derived."
    sentByAvatarUrl: String
    "ISO 8601 timestamp when the report was received (server-stamped)"
    sentAt: String!
    "Monotonic per-board sequence number for ordering and late-joiner dedup"
    seq: Int!
  }

  """
  Event: a climb was set (lit) on the wall.
  """
  type BoardClimbSet {
    "The climb now on the wall"
    climb: BoardPresenceClimb!
  }

  """
  Event: the wall was cleared (best-effort — only emitted on a deliberate
  disconnect; an involuntary BLE drop leaves the last climb sticky).
  """
  type BoardClimbCleared {
    "ISO 8601 timestamp when the wall was cleared"
    clearedAt: String!
    "Monotonic per-board sequence number"
    seq: Int!
  }

  """
  Union of board-presence events streamed by \`boardNowPlaying\`.
  """
  union BoardPresenceEvent = BoardClimbSet | BoardClimbCleared

  """
  A board resolved from a BLE serial — the one shared board everyone at this
  physical wall sees. \`boardId\` is the shared key for the presence channel.
  """
  type ResolvedBoard {
    "Shared board id (userBoards.id), keyed 1:1 to the serial"
    boardId: Int!
    "Display name of the board (e.g. 'Garage Kilter')"
    boardName: String!
    "Board type (kilter, tension, ...)"
    boardType: String!
    "Layout id"
    layoutId: Int!
    "Size id"
    sizeId: Int!
    "Comma-separated set ids"
    setIds: String!
  }

  """
  Lightweight live + durable stats for a board's wall feed. Durable counts are
  derived from \`boardsesh_ticks\` stamped with this board_id; "right now" comes
  from the live Redis window.
  """
  type BoardPresenceStats {
    "Distinct climbs sent/logged on this wall"
    climbsSentCount: Int!
    "Distinct climbers seen on this wall"
    distinctClimbersCount: Int!
    "Hardest grade sent on this wall (name), if any"
    hardestGrade: String
    "Most-sent grade on this wall (name), if any"
    topGrade: String
    "ISO 8601 timestamp of the most recent send on this wall"
    lastSentAt: String
  }
`;
