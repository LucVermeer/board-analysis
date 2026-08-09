import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  fetchAnalyzedBetaMoveAttempts,
  fetchAnalyzedBetaNavigation,
  fetchAnalyzedBetaVideos,
} from '../services/analyzed-beta-videos';

function beta(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scraped-source-1',
    provider: 'boardsesh_public_graphql_search_climbs',
    provider_climb_id: 'target-climb',
    board_type: 'moonboard',
    board_layout: 'MoonBoard 2024',
    source_account: 'setter',
    post_key: 'instagram:POST1',
    post_url: 'https://www.instagram.com/p/POST1/',
    media_item_key: 'instagram:POST1:item:1',
    media_item_index: 1,
    media_item_count: 2,
    segment_key: 'scraped-source-1:full',
    evidence_scope: 'post',
    resolution_scope: 'post',
    assignment_state: 'ambiguous',
    assignment_method: 'candidate_only',
    uncertainty_reasons: ['multiple_catalog_links'],
    is_definitive: false,
    has_move_analysis: false,
    candidate_climbs: [
      { climb_id: 'target-climb', climb_name: 'Target', board_layout: 'MoonBoard 2024' },
      { climb_id: 'other-climb', climb_name: 'Other', board_layout: 'MoonBoard 2024' },
    ],
    climb: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BOARDSESH_ANALYSIS_URL;
});

describe('analyzed beta provider adapter', () => {
  it('keeps unresolved candidates explicit and filters cross-climb rows', async () => {
    process.env.BOARDSESH_ANALYSIS_URL = 'http://127.0.0.1:8765';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        videos: [beta(), beta({ id: 'scraped-other', provider_climb_id: 'other-climb' })],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const videos = await fetchAnalyzedBetaVideos('moonboard', 3, 'target-climb');

    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      provider_climb_id: 'target-climb',
      is_definitive: false,
      has_move_analysis: false,
      assignment_method: 'candidate_only',
    });
    expect(videos[0]?.candidate_climbs).toHaveLength(2);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get('provider')).toBe('boardsesh_public_graphql_search_climbs');
    expect(requestedUrl.searchParams.get('climb_id')).toBe('target-climb');
  });

  it('does not query the analysis service outside MoonBoard 2024', async () => {
    process.env.BOARDSESH_ANALYSIS_URL = 'http://127.0.0.1:8765';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAnalyzedBetaVideos('kilter', 3, 'not-mb2024')).resolves.toEqual([]);
    await expect(fetchAnalyzedBetaVideos('moonboard', 2, 'not-mb2024')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads confirmed move coverage without promoting ambiguous candidates', async () => {
    process.env.BOARDSESH_ANALYSIS_URL = 'http://127.0.0.1:8765';
    const climbUuid = 'navigation-climb';
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/analysis-climb-moves') {
        return {
          ok: true,
          json: async () => ({
            climb: { id: climbUuid, normalized_id: climbUuid },
            confirmed_video_count: 2,
            analyzed_video_count: 2,
            moves: [
              {
                move_key: 'targets:grid:G14',
                target_holds: [{ key: 'grid:G14', col: 7, row: 14 }],
                video_count: 2,
                confirmed_video_count: 2,
                hand_counts: [{ hand: 'RH', count: 2 }],
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          videos: [
            beta({
              id: 'scraped-confirmed-navigation',
              provider_climb_id: climbUuid,
              assignment_state: 'resolved',
              assignment_method: 'manual_review',
              is_definitive: true,
              has_move_analysis: true,
            }),
            beta({ id: 'scraped-ambiguous-navigation', provider_climb_id: climbUuid }),
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const navigation = await fetchAnalyzedBetaNavigation('moonboard', 3, climbUuid);

    expect(navigation?.confirmed_video_count).toBe(1);
    expect(navigation?.moves[0]).toMatchObject({ video_count: 1, confirmed_video_count: 1 });
  });

  it('filters move attempts to definitive videos authorized for the climb', async () => {
    process.env.BOARDSESH_ANALYSIS_URL = 'http://127.0.0.1:8765';
    const climbUuid = 'attempt-navigation-climb';
    const hold = { key: 'grid:G14', col: 7, row: 14 };
    const attempt = (videoId: string) => ({
      move_key: 'targets:grid:G14',
      video_id: videoId,
      source_account: 'setter',
      local_move_id: `${videoId}:move-4`,
      local_ordinal: 4,
      target_holds: [hold],
      transitions: [
        {
          hand: 'right_hand',
          source: { key: 'grid:H9', col: 8, row: 9 },
          destination: hold,
          source_assumed: false,
        },
      ],
      playback: { start_s: 4, end_s: 6 },
      confidence: 0.9,
      warnings: [],
      occurrence_count: 1,
    });
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/analysis-move-attempts') {
        return {
          ok: true,
          json: async () => ({
            climb: { id: climbUuid, normalized_id: climbUuid },
            move_key: 'targets:grid:G14',
            attempts: [attempt('scraped-confirmed-attempt'), attempt('scraped-ambiguous-attempt')],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          videos: [
            beta({
              id: 'scraped-confirmed-attempt',
              provider_climb_id: climbUuid,
              assignment_state: 'resolved',
              assignment_method: 'manual_review',
              is_definitive: true,
              has_move_analysis: true,
            }),
            beta({ id: 'scraped-ambiguous-attempt', provider_climb_id: climbUuid }),
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const attempts = await fetchAnalyzedBetaMoveAttempts('moonboard', 3, climbUuid, 'targets:grid:G14');

    expect(attempts.map((item) => item.video_id)).toEqual(['scraped-confirmed-attempt']);
  });
});
