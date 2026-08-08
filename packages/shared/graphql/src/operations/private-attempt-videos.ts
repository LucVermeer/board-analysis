import { gql } from 'graphql-request';
import type { PrivateAttemptVideo } from '@boardsesh/shared-schema';

export const GET_PRIVATE_ATTEMPT_VIDEOS = gql`
  query GetPrivateAttemptVideos($climbUuid: String!, $layoutId: Int!, $angle: Int!) {
    privateAttemptVideos(climbUuid: $climbUuid, layoutId: $layoutId, angle: $angle) {
      uuid
      tickUuid
      boardType
      climbProvider
      climbUuid
      layoutId
      angle
      isMirror
      mimeType
      byteSize
      durationMs
      recordedAt
      createdAt
      playbackPath
    }
  }
`;

export type GetPrivateAttemptVideosVariables = {
  climbUuid: string;
  layoutId: number;
  angle: number;
};

export type GetPrivateAttemptVideosResponse = {
  privateAttemptVideos: PrivateAttemptVideo[];
};
