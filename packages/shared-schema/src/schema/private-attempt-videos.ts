export const privateAttemptVideoTypeDefs = /* GraphQL */ `
  """
  An owner-only MoonBoard 2024 attempt recording. The opaque filesystem asset
  key is intentionally absent; playback is always authorized independently.
  """
  type PrivateAttemptVideo {
    uuid: ID!
    tickUuid: ID!
    boardType: String!
    climbProvider: String!
    climbUuid: String!
    layoutId: Int!
    angle: Int!
    isMirror: Boolean!
    mimeType: String!
    byteSize: Int!
    durationMs: Int!
    recordedAt: String!
    createdAt: String!
    playbackPath: String!
  }
`;
