export const analyzedBetaVideoTypeDefs = /* GraphQL */ `
  type AnalyzedBetaClimbCandidate {
    normalizedClimbId: String!
    climbId: String!
    climbName: String!
    boardLayout: String!
    grades: [String!]!
    angles: [String!]!
  }

  type AnalyzedBetaClimb {
    id: String!
    normalizedId: String!
    name: String!
    grade: String!
    angle: String!
    boardLayout: String!
    setterUsername: String!
  }

  """
  A provider-scoped beta item with explicit post/item/segment provenance.
  """
  type AnalyzedBetaVideo {
    id: ID!
    provider: String!
    providerClimbId: String!
    boardType: String!
    boardLayout: String!
    sourceAccount: String!
    postKey: String!
    postUrl: String!
    mediaItemKey: String!
    mediaItemIndex: Int
    mediaItemCount: Int
    segmentKey: String!
    evidenceScope: String!
    resolutionScope: String!
    assignmentState: String!
    assignmentMethod: String!
    uncertaintyReasons: [String!]!
    isDefinitive: Boolean!
    hasMoveAnalysis: Boolean!
    candidateClimbs: [AnalyzedBetaClimbCandidate!]!
    climb: AnalyzedBetaClimb
    playbackPath: String!
    movesPath: String
  }

  type AnalyzedBetaHold {
    key: String!
    col: Float!
    row: Float!
  }

  type AnalyzedBetaHandCount {
    hand: String!
    count: Int!
  }

  type AnalyzedBetaMoveSummary {
    moveKey: String!
    targetHolds: [AnalyzedBetaHold!]!
    videoCount: Int!
    confirmedVideoCount: Int!
    handCounts: [AnalyzedBetaHandCount!]!
  }

  type AnalyzedBetaMoveTransition {
    hand: String!
    source: AnalyzedBetaHold!
    destination: AnalyzedBetaHold!
    sourceAssumed: Boolean!
  }

  type AnalyzedBetaMoveAttempt {
    moveKey: String!
    videoId: String!
    sourceAccount: String!
    localMoveId: String!
    localOrdinal: Int!
    targetHolds: [AnalyzedBetaHold!]!
    transitions: [AnalyzedBetaMoveTransition!]!
    playbackStartS: Float!
    playbackEndS: Float!
    confidence: Float!
    warnings: [String!]!
    occurrenceCount: Int!
  }

  type AnalyzedBetaNavigation {
    confirmedVideoCount: Int!
    analyzedVideoCount: Int!
    moves: [AnalyzedBetaMoveSummary!]!
  }
`;
