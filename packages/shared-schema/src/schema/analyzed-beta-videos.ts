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
`;
