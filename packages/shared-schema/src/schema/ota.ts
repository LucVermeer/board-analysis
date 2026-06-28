export const otaTypeDefs = /* GraphQL */ `
  # ============================================
  # OTA Preview Channel Types
  # ============================================

  """
  A live per-PR OTA preview channel. Switching a store/TestFlight build onto one
  loads that pull request's JS bundle before it ships, with no new build. The
  list is derived from the GitHub "pr-preview" deployments the
  mobile-ota-preview workflow publishes, so only channels that are actually live
  appear. See docs/mobile-ota-updates.md.
  """
  type OtaPreviewChannel {
    "The OTA channel name to switch onto, e.g. \\"pr-3253\\"."
    channel: String!
    "The pull request number."
    prNumber: Int!
    "The pull request title, for display."
    title: String!
    "The pull request web URL."
    url: String!
  }
`;
