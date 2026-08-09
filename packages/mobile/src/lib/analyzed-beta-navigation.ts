import type { AnalyzedBetaMoveAttempt } from '@boardsesh/shared-schema';
import type { AnalysisCatalogVideo } from './analyzed-beta-analysis-client';

export type AnalyzedBetaNavigationItem = {
  video: AnalysisCatalogVideo;
  attempt: AnalyzedBetaMoveAttempt | null;
};

export function buildAnalyzedBetaNavigationItems(
  videos: AnalysisCatalogVideo[],
  attempts: AnalyzedBetaMoveAttempt[],
  moveKey: string,
): AnalyzedBetaNavigationItem[] {
  if (moveKey === 'all') return videos.map((video) => ({ video, attempt: null }));
  const videoById = new Map(videos.map((video) => [video.id, video]));
  return attempts.flatMap((attempt) => {
    const video = videoById.get(attempt.videoId);
    return video ? [{ video, attempt }] : [];
  });
}
