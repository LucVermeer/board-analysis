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
