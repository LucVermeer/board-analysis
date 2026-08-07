import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { fetchAnalyzedBetaVideos } from '../services/analyzed-beta-videos';

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
});
