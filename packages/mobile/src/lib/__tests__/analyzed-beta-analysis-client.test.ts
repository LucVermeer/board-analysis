import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  fetchAnalyzedClimbIds,
  fetchClimbAnalysisAvailability,
  fetchClimbAnalysisNavigation,
  fetchClimbMoveAttempts,
} from '../analyzed-beta-analysis-client';

function response(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload };
}

afterEach(() => vi.unstubAllGlobals());

describe('device analysis client', () => {
  it('uses the device climb index only as a stable UUID availability list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          climbs: [
            { id: '9fcceb8b-06aa-55a1-8372-f281308a0703', name: 'display metadata is ignored' },
            { id: 'not-a-provider-uuid', name: 'invalid' },
          ],
        }),
      ),
    );

    await expect(fetchAnalyzedClimbIds()).resolves.toEqual(['9fcceb8b-06aa-55a1-8372-f281308a0703']);
  });

  it('keeps only definitive videos joined to the requested BoardSesh climb', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        videos: [
          {
            id: 'scraped-confirmed',
            provider: 'boardsesh_public_graphql_search_climbs',
            provider_climb_id: 'climb-1',
            source_account: 'confirmed',
            is_definitive: true,
            has_move_analysis: true,
            climb: { id: 'stable-climb-1' },
          },
          {
            id: 'scraped-candidate',
            provider: 'boardsesh_public_graphql_search_climbs',
            provider_climb_id: 'climb-1',
            source_account: 'candidate',
            is_definitive: false,
            has_move_analysis: false,
            climb: null,
          },
          {
            id: 'scraped-other',
            provider: 'boardsesh_public_graphql_search_climbs',
            provider_climb_id: 'other-climb',
            is_definitive: true,
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchClimbAnalysisAvailability('climb-1')).resolves.toEqual({
      videos: [{ id: 'scraped-confirmed', sourceAccount: 'confirmed', hasMoveAnalysis: true }],
      candidateVideoCount: 1,
      analysisClimbId: 'stable-climb-1',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('climb_id=climb-1');
  });

  it('fails closed when definitive rows disagree on climb identity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          videos: ['one', 'two'].map((id) => ({
            id: `scraped-${id}`,
            provider: 'boardsesh_public_graphql_search_climbs',
            provider_climb_id: 'climb-1',
            is_definitive: true,
            has_move_analysis: true,
            climb: { id: `stable-${id}` },
          })),
        }),
      ),
    );

    await expect(fetchClimbAnalysisAvailability('climb-1')).rejects.toThrow('disagree');
  });

  it('maps target moves and attempt playback without changing inferred provenance', async () => {
    const hold = { key: 'grid:G14', col: 7, row: 14 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          confirmed_video_count: 2,
          analyzed_video_count: 2,
          moves: [
            {
              move_key: 'targets:grid:G14',
              target_holds: [hold],
              video_count: 2,
              confirmed_video_count: 2,
              hand_counts: [
                { hand: 'RH', count: 1 },
                { hand: 'LH', count: 1 },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          move_key: 'targets:grid:G14',
          attempts: [
            {
              move_key: 'targets:grid:G14',
              video_id: 'scraped-attempt',
              source_account: 'climber',
              local_move_id: 'move-3',
              local_ordinal: 3,
              target_holds: [hold],
              transitions: [
                {
                  hand: 'left_hand',
                  source: { key: 'grid:E9', col: 5, row: 9 },
                  destination: hold,
                  source_assumed: false,
                },
              ],
              playback: { start_s: 4.5, end_s: 6.25 },
              confidence: 0.92,
              warnings: ['pose_gap'],
              occurrence_count: 1,
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const navigation = await fetchClimbAnalysisNavigation('stable-climb');
    const attempts = await fetchClimbMoveAttempts('stable-climb', 'targets:grid:G14');

    expect(navigation.moves[0]).toMatchObject({ moveKey: 'targets:grid:G14', videoCount: 2 });
    expect(attempts[0]).toMatchObject({ videoId: 'scraped-attempt', playbackStartS: 4.5, playbackEndS: 6.25 });
  });
});
