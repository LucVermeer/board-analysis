import { z } from 'zod';
import { logger } from '../utils/logger';
import { MOONBOARD_2024_LAYOUT_ID, PRIVATE_ATTEMPT_CLIMB_PROVIDER } from './private-attempt-videos';

const CandidateSchema = z.object({
  normalized_climb_id: z.string().optional().default(''),
  climb_id: z.string().optional().default(''),
  climb_name: z.string().optional().default(''),
  board_layout: z.string().optional().default(''),
  grades: z.array(z.string()).optional().default([]),
  angles: z.array(z.string()).optional().default([]),
});

const BetaVideoSchema = z.object({
  id: z.string().regex(/^scraped-[A-Za-z0-9._-]+$/),
  provider: z.literal(PRIVATE_ATTEMPT_CLIMB_PROVIDER),
  provider_climb_id: z.string(),
  board_type: z.literal('moonboard'),
  board_layout: z.string(),
  source_account: z.string(),
  post_key: z.string(),
  post_url: z.string(),
  media_item_key: z.string(),
  media_item_index: z.number().int().positive().nullable(),
  media_item_count: z.number().int().positive().nullable(),
  segment_key: z.string(),
  evidence_scope: z.string(),
  resolution_scope: z.string(),
  assignment_state: z.string(),
  assignment_method: z.string(),
  uncertainty_reasons: z.array(z.string()),
  is_definitive: z.boolean(),
  has_move_analysis: z.boolean(),
  candidate_climbs: z.array(CandidateSchema),
  climb: z
    .object({
      id: z.string(),
      normalized_id: z.string().optional().default(''),
      name: z.string(),
      grade: z.string().optional().default(''),
      angle: z.string().optional().default(''),
      board_layout: z.string().optional().default(''),
      setter_username: z.string().optional().default(''),
    })
    .nullable(),
});

const BetaResponseSchema = z.object({ videos: z.array(BetaVideoSchema) });
export type AnalysisBetaVideo = z.infer<typeof BetaVideoSchema>;

const HoldSchema = z.object({
  key: z.string(),
  col: z.number(),
  row: z.number(),
});

const MoveSummarySchema = z.object({
  move_key: z.string().startsWith('targets:'),
  target_holds: z.array(HoldSchema),
  video_count: z.number().int().nonnegative(),
  confirmed_video_count: z.number().int().nonnegative(),
  hand_counts: z.array(z.object({ hand: z.string(), count: z.number().int().nonnegative() })),
});

const NavigationResponseSchema = z.object({
  climb: z.object({ id: z.string(), normalized_id: z.string().optional().default('') }),
  confirmed_video_count: z.number().int().nonnegative(),
  analyzed_video_count: z.number().int().nonnegative(),
  moves: z.array(MoveSummarySchema),
});

const MoveAttemptSchema = z.object({
  move_key: z.string().startsWith('targets:'),
  video_id: z.string().regex(/^scraped-[A-Za-z0-9._-]+$/),
  source_account: z.string(),
  local_move_id: z.string(),
  local_ordinal: z.number().int().nonnegative(),
  target_holds: z.array(HoldSchema),
  transitions: z.array(
    z.object({
      hand: z.string(),
      source: HoldSchema,
      destination: HoldSchema,
      source_assumed: z.boolean().optional().default(false),
    }),
  ),
  playback: z.object({ start_s: z.number().nonnegative(), end_s: z.number().nonnegative() }),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  occurrence_count: z.number().int().positive(),
});

const MoveAttemptsResponseSchema = z.object({
  climb: z.object({ id: z.string(), normalized_id: z.string().optional().default('') }),
  move_key: z.string().startsWith('targets:'),
  attempts: z.array(MoveAttemptSchema),
});

export type AnalysisBetaNavigation = z.infer<typeof NavigationResponseSchema>;
export type AnalysisBetaMoveAttempt = z.infer<typeof MoveAttemptSchema>;

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { expiresAt: number; videos: AnalysisBetaVideo[] }>();

export function getAnalysisServiceBaseUrl(): string | null {
  const configured = process.env.BOARDSESH_ANALYSIS_URL?.trim();
  if (!configured) return null;
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.pathname = parsed.pathname.replace(/\/$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export async function fetchAnalyzedBetaVideos(
  boardType: string,
  layoutId: number,
  climbUuid: string,
): Promise<AnalysisBetaVideo[]> {
  if (boardType !== 'moonboard' || layoutId !== MOONBOARD_2024_LAYOUT_ID) return [];
  const baseUrl = getAnalysisServiceBaseUrl();
  if (!baseUrl) return [];
  const cacheKey = `${boardType}:${layoutId}:${climbUuid}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.videos;

  const url = new URL('/api/climb-beta-videos', `${baseUrl}/`);
  url.searchParams.set('provider', PRIVATE_ATTEMPT_CLIMB_PROVIDER);
  url.searchParams.set('board_type', boardType);
  url.searchParams.set('climb_id', climbUuid);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`analysis service returned ${response.status}`);
    const parsed = BetaResponseSchema.parse(await response.json());
    const videos = parsed.videos.filter(
      (video) =>
        video.provider_climb_id === climbUuid &&
        video.board_type === boardType &&
        video.provider === PRIVATE_ATTEMPT_CLIMB_PROVIDER,
    );
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, videos });
    return videos;
  } catch (error) {
    logger.warn('[AnalyzedBetaVideos] Catalog fetch failed:', error);
    return [];
  }
}

export async function authorizeAnalyzedBetaVideo(
  videoId: string,
  climbUuid: string,
): Promise<AnalysisBetaVideo | null> {
  const videos = await fetchAnalyzedBetaVideos('moonboard', MOONBOARD_2024_LAYOUT_ID, climbUuid);
  return videos.find((video) => video.id === videoId) ?? null;
}

export function analysisServiceUrl(pathname: string): URL | null {
  const baseUrl = getAnalysisServiceBaseUrl();
  return baseUrl ? new URL(pathname, `${baseUrl}/`) : null;
}

function matchesRequestedClimb(climb: { id: string; normalized_id: string }, climbUuid: string): boolean {
  return climb.id === climbUuid || climb.normalized_id === climbUuid;
}

export async function fetchAnalyzedBetaNavigation(
  boardType: string,
  layoutId: number,
  climbUuid: string,
): Promise<AnalysisBetaNavigation | null> {
  if (boardType !== 'moonboard' || layoutId !== MOONBOARD_2024_LAYOUT_ID) return null;
  const upstreamUrl = analysisServiceUrl('/api/analysis-climb-moves');
  if (!upstreamUrl) return null;
  upstreamUrl.searchParams.set('dataset', 'moonboard_2024_7a');
  upstreamUrl.searchParams.set('climb', climbUuid);
  try {
    const [response, catalogVideos] = await Promise.all([
      fetch(upstreamUrl, { cache: 'no-store', signal: AbortSignal.timeout(8_000) }),
      fetchAnalyzedBetaVideos(boardType, layoutId, climbUuid),
    ]);
    if (!response.ok) throw new Error(`analysis service returned ${response.status}`);
    const parsed = NavigationResponseSchema.parse(await response.json());
    if (!matchesRequestedClimb(parsed.climb, climbUuid)) return null;
    const confirmedVideoCount = catalogVideos.filter((video) => video.is_definitive && video.has_move_analysis).length;
    return {
      ...parsed,
      confirmed_video_count: confirmedVideoCount,
      moves: parsed.moves.map((move) => ({
        ...move,
        confirmed_video_count: confirmedVideoCount,
        video_count: Math.min(move.video_count, confirmedVideoCount),
      })),
    };
  } catch (error) {
    logger.warn('[AnalyzedBetaVideos] Navigation fetch failed:', error);
    return null;
  }
}

export async function fetchAnalyzedBetaMoveAttempts(
  boardType: string,
  layoutId: number,
  climbUuid: string,
  moveKey: string,
): Promise<AnalysisBetaMoveAttempt[]> {
  if (boardType !== 'moonboard' || layoutId !== MOONBOARD_2024_LAYOUT_ID || !moveKey.startsWith('targets:')) return [];
  const upstreamUrl = analysisServiceUrl('/api/analysis-move-attempts');
  if (!upstreamUrl) return [];
  upstreamUrl.searchParams.set('dataset', 'moonboard_2024_7a');
  upstreamUrl.searchParams.set('climb', climbUuid);
  upstreamUrl.searchParams.set('move', moveKey);
  try {
    const [response, catalogVideos] = await Promise.all([
      fetch(upstreamUrl, { cache: 'no-store', signal: AbortSignal.timeout(8_000) }),
      fetchAnalyzedBetaVideos(boardType, layoutId, climbUuid),
    ]);
    if (!response.ok) throw new Error(`analysis service returned ${response.status}`);
    const parsed = MoveAttemptsResponseSchema.parse(await response.json());
    if (parsed.move_key !== moveKey || !matchesRequestedClimb(parsed.climb, climbUuid)) return [];
    const allowedVideoIds = new Set(
      catalogVideos.filter((video) => video.is_definitive && video.has_move_analysis).map((video) => video.id),
    );
    return parsed.attempts.filter((attempt) => allowedVideoIds.has(attempt.video_id));
  } catch (error) {
    logger.warn('[AnalyzedBetaVideos] Move attempts fetch failed:', error);
    return [];
  }
}
