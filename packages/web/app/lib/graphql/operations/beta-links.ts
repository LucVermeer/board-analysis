import { gql } from 'graphql-request';

export const GET_BETA_LINKS = gql`
  query GetBetaLinks($boardType: String!, $climbUuid: String!) {
    betaLinks(boardType: $boardType, climbUuid: $climbUuid) {
      climbUuid
      link
      foreignUsername
      angle
      thumbnail
      isListed
      createdAt
    }
  }
`;

export const GET_RECENT_BETA_LINKS = gql`
  query GetRecentBetaLinks($limit: Int, $boardType: String) {
    recentBetaLinks(limit: $limit, boardType: $boardType) {
      climbName
      boardType
      betaLink {
        climbUuid
        link
        foreignUsername
        angle
        thumbnail
        isListed
        createdAt
      }
    }
  }
`;

export const GET_USER_BETA_LINKS = gql`
  query GetUserBetaLinks($userId: String!, $limit: Int) {
    userBetaLinks(userId: $userId, limit: $limit) {
      climbName
      boardType
      betaLink {
        climbUuid
        link
        foreignUsername
        angle
        thumbnail
        isListed
        createdAt
      }
    }
  }
`;
