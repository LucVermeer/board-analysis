import type {
  AnalyzedBetaHold,
  AnalyzedBetaMoveAttempt,
  AnalyzedBetaMoveSummary,
  AnalyzedBetaNavigation,
} from '@boardsesh/shared-schema';
import { ANALYSIS_URL } from './env';

const DATASET = 'moonboard_2024_7a';
const PROVIDER = 'boardsesh_public_graphql_search_climbs';
const VIDEO_ID = /^scraped-[A-Za-z0-9._-]+$/;
const REQUEST_TIMEOUT_MS = 12_000;

export type AnalysisCatalogVideo = {
  id: string;
  sourceAccount: string;
  hasMoveAnalysis: boolean;
};

export type ClimbAnalysisAvailability = {
  videos: AnalysisCatalogVideo[];
  candidateVideoCount: number;
  analysisClimbId: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function endpoint(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${ANALYSIS_URL}${path}?${query.toString()}`;
}

async function fetchAnalysis(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint(path, params), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Analysis service returned ${response.status}`);
    const payload = record(await response.json());
    if (!payload) throw new Error('Analysis service returned an invalid response');
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function parseHold(value: unknown): AnalyzedBetaHold | null {
  const hold = record(value);
  if (!hold) return null;
  const key = stringValue(hold.key);
  if (!key) return null;
  return { key, col: numberValue(hold.col), row: numberValue(hold.row) };
}

function parseMoveSummary(value: unknown): AnalyzedBetaMoveSummary | null {
  const move = record(value);
  if (!move) return null;
  const moveKey = stringValue(move.move_key);
  if (!moveKey.startsWith('targets:')) return null;
  return {
    moveKey,
    targetHolds: arrayValue(move.target_holds).flatMap((hold) => {
      const parsed = parseHold(hold);
      return parsed ? [parsed] : [];
    }),
    videoCount: numberValue(move.video_count),
    confirmedVideoCount: numberValue(move.confirmed_video_count),
    handCounts: arrayValue(move.hand_counts).flatMap((entry) => {
      const count = record(entry);
      return count ? [{ hand: stringValue(count.hand), count: numberValue(count.count) }] : [];
    }),
  };
}

function parseAttempt(value: unknown): AnalyzedBetaMoveAttempt | null {
  const attempt = record(value);
  const playback = record(attempt?.playback);
  if (!attempt || !playback) return null;
  const moveKey = stringValue(attempt.move_key);
  const videoId = stringValue(attempt.video_id);
  if (!moveKey.startsWith('targets:') || !VIDEO_ID.test(videoId)) return null;
  return {
    moveKey,
    videoId,
    sourceAccount: stringValue(attempt.source_account),
    localMoveId: stringValue(attempt.local_move_id),
    localOrdinal: numberValue(attempt.local_ordinal),
    targetHolds: arrayValue(attempt.target_holds).flatMap((hold) => {
      const parsed = parseHold(hold);
      return parsed ? [parsed] : [];
    }),
    transitions: arrayValue(attempt.transitions).flatMap((value) => {
      const transition = record(value);
      const source = parseHold(transition?.source);
      const destination = parseHold(transition?.destination);
      return transition && source && destination
        ? [
            {
              hand: stringValue(transition.hand),
              source,
              destination,
              sourceAssumed: booleanValue(transition.source_assumed),
            },
          ]
        : [];
    }),
    playbackStartS: numberValue(playback.start_s),
    playbackEndS: numberValue(playback.end_s),
    confidence: numberValue(attempt.confidence),
    warnings: arrayValue(attempt.warnings).map(stringValue).filter(Boolean),
    occurrenceCount: numberValue(attempt.occurrence_count),
  };
}

export async function fetchClimbAnalysisAvailability(climbUuid: string): Promise<ClimbAnalysisAvailability> {
  const payload = await fetchAnalysis('/api/climb-beta-videos', {
    provider: PROVIDER,
    board_type: 'moonboard',
    climb_id: climbUuid,
  });
  const rows = arrayValue(payload.videos).flatMap((value) => {
    const video = record(value);
    return video?.provider_climb_id === climbUuid && video.provider === PROVIDER ? [video] : [];
  });
  const definitive = rows.filter((video) => booleanValue(video.is_definitive));
  const climbIds = new Set(
    definitive
      .map((video) => stringValue(record(video.climb)?.id) || stringValue(record(video.climb)?.normalized_id))
      .filter(Boolean),
  );
  if (climbIds.size > 1) throw new Error('Confirmed videos disagree on climb identity');
  return {
    videos: definitive.flatMap((video) => {
      const id = stringValue(video.id);
      return VIDEO_ID.test(id)
        ? [
            {
              id,
              sourceAccount: stringValue(video.source_account),
              hasMoveAnalysis: booleanValue(video.has_move_analysis),
            },
          ]
        : [];
    }),
    candidateVideoCount: rows.length - definitive.length,
    analysisClimbId: [...climbIds][0] ?? climbUuid,
  };
}

export async function fetchClimbAnalysisNavigation(climbId: string): Promise<AnalyzedBetaNavigation> {
  const payload = await fetchAnalysis('/api/analysis-climb-moves', { dataset: DATASET, climb: climbId });
  return {
    confirmedVideoCount: numberValue(payload.confirmed_video_count),
    analyzedVideoCount: numberValue(payload.analyzed_video_count),
    moves: arrayValue(payload.moves).flatMap((move) => {
      const parsed = parseMoveSummary(move);
      return parsed ? [parsed] : [];
    }),
  };
}

export async function fetchClimbMoveAttempts(climbId: string, moveKey: string): Promise<AnalyzedBetaMoveAttempt[]> {
  const payload = await fetchAnalysis('/api/analysis-move-attempts', {
    dataset: DATASET,
    climb: climbId,
    move: moveKey,
  });
  if (stringValue(payload.move_key) !== moveKey) throw new Error('Analysis service returned the wrong move');
  return arrayValue(payload.attempts).flatMap((attempt) => {
    const parsed = parseAttempt(attempt);
    return parsed ? [parsed] : [];
  });
}

export function analysisVideoUrl(videoId: string): string {
  if (!VIDEO_ID.test(videoId)) throw new Error('Invalid analysis video ID');
  return `${ANALYSIS_URL}/review-media/${encodeURIComponent(videoId)}`;
}
