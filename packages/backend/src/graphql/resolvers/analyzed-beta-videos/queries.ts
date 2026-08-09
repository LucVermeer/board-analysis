import type { ConnectionContext } from '@boardsesh/shared-schema';
import {
  fetchAnalyzedBetaMoveAttempts,
  fetchAnalyzedBetaNavigation,
  fetchAnalyzedBetaVideos,
} from '../../../services/analyzed-beta-videos';

export const analyzedBetaVideoQueries = {
  analyzedBetaVideos: async (
    _: unknown,
    { boardType, climbUuid, layoutId }: { boardType: string; climbUuid: string; layoutId: number },
    _ctx: ConnectionContext,
  ) => {
    const videos = await fetchAnalyzedBetaVideos(boardType, layoutId, climbUuid);
    return videos.map((video) => ({
      id: video.id,
      provider: video.provider,
      providerClimbId: video.provider_climb_id,
      boardType: video.board_type,
      boardLayout: video.board_layout,
      sourceAccount: video.source_account,
      postKey: video.post_key,
      postUrl: video.post_url,
      mediaItemKey: video.media_item_key,
      mediaItemIndex: video.media_item_index,
      mediaItemCount: video.media_item_count,
      segmentKey: video.segment_key,
      evidenceScope: video.evidence_scope,
      resolutionScope: video.resolution_scope,
      assignmentState: video.assignment_state,
      assignmentMethod: video.assignment_method,
      uncertaintyReasons: video.uncertainty_reasons,
      isDefinitive: video.is_definitive,
      hasMoveAnalysis: video.has_move_analysis,
      candidateClimbs: video.candidate_climbs.map((candidate) => ({
        normalizedClimbId: candidate.normalized_climb_id,
        climbId: candidate.climb_id,
        climbName: candidate.climb_name,
        boardLayout: candidate.board_layout,
        grades: candidate.grades,
        angles: candidate.angles,
      })),
      climb: video.climb
        ? {
            id: video.climb.id,
            normalizedId: video.climb.normalized_id,
            name: video.climb.name,
            grade: video.climb.grade,
            angle: video.climb.angle,
            boardLayout: video.climb.board_layout,
            setterUsername: video.climb.setter_username,
          }
        : null,
      playbackPath: `/api/analyzed-beta-videos/${video.id}/stream?climbUuid=${encodeURIComponent(climbUuid)}`,
      movesPath: video.has_move_analysis
        ? `/api/analyzed-beta-videos/${video.id}/moves?climbUuid=${encodeURIComponent(climbUuid)}`
        : null,
    }));
  },
  analyzedBetaNavigation: async (
    _: unknown,
    { boardType, climbUuid, layoutId }: { boardType: string; climbUuid: string; layoutId: number },
    _ctx: ConnectionContext,
  ) => {
    const navigation = await fetchAnalyzedBetaNavigation(boardType, layoutId, climbUuid);
    if (!navigation) return { confirmedVideoCount: 0, analyzedVideoCount: 0, moves: [] };
    return {
      confirmedVideoCount: navigation.confirmed_video_count,
      analyzedVideoCount: navigation.analyzed_video_count,
      moves: navigation.moves.map((move) => ({
        moveKey: move.move_key,
        targetHolds: move.target_holds,
        videoCount: move.video_count,
        confirmedVideoCount: move.confirmed_video_count,
        handCounts: move.hand_counts,
      })),
    };
  },
  analyzedBetaMoveAttempts: async (
    _: unknown,
    {
      boardType,
      climbUuid,
      layoutId,
      moveKey,
    }: { boardType: string; climbUuid: string; layoutId: number; moveKey: string },
    _ctx: ConnectionContext,
  ) => {
    const attempts = await fetchAnalyzedBetaMoveAttempts(boardType, layoutId, climbUuid, moveKey);
    return attempts.map((attempt) => ({
      moveKey: attempt.move_key,
      videoId: attempt.video_id,
      sourceAccount: attempt.source_account,
      localMoveId: attempt.local_move_id,
      localOrdinal: attempt.local_ordinal,
      targetHolds: attempt.target_holds,
      transitions: attempt.transitions.map((transition) => ({
        hand: transition.hand,
        source: transition.source,
        destination: transition.destination,
        sourceAssumed: transition.source_assumed,
      })),
      playbackStartS: attempt.playback.start_s,
      playbackEndS: attempt.playback.end_s,
      confidence: attempt.confidence,
      warnings: attempt.warnings,
      occurrenceCount: attempt.occurrence_count,
    }));
  },
};
