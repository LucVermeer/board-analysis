export const betaLinksTypeDefs = /* GraphQL */ `
  """
  An external Instagram or TikTok beta link attached to a climb.
  Thumbnail (when present) is served from our own S3 bucket.
  """
  type BetaLink {
    climbUuid: String!
    link: String!
    foreignUsername: String
    angle: Int
    thumbnail: String
    isListed: Boolean
    createdAt: String
  }

  """
  A recent beta link enriched with the parent climb's display name. Used
  by the home-page slider where multiple climbs are aggregated together.
  """
  type RecentBetaLink {
    betaLink: BetaLink!
    climbName: String
    boardType: String!
  }
`;
