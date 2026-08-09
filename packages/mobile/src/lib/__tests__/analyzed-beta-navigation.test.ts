import { describe, expect, it } from 'vite-plus/test';
import type { AnalyzedBetaMoveAttempt } from '@boardsesh/shared-schema';
import type { AnalysisCatalogVideo } from '../analyzed-beta-analysis-client';
import { buildAnalyzedBetaNavigationItems } from '../analyzed-beta-navigation';

const videos: AnalysisCatalogVideo[] = [
  {
    id: 'scraped-one',
    sourceAccount: 'one',
    hasMoveAnalysis: true,
  },
  {
    id: 'scraped-two',
    sourceAccount: 'two',
    hasMoveAnalysis: true,
  },
];

const attempt: AnalyzedBetaMoveAttempt = {
  moveKey: 'targets:grid:G14',
  videoId: 'scraped-two',
  sourceAccount: 'two',
  localMoveId: 'move-4',
  localOrdinal: 4,
  targetHolds: [{ key: 'grid:G14', col: 7, row: 14 }],
  transitions: [
    {
      hand: 'right_hand',
      source: { key: 'grid:H9', col: 8, row: 9 },
      destination: { key: 'grid:G14', col: 7, row: 14 },
      sourceAssumed: false,
    },
  ],
  playbackStartS: 4,
  playbackEndS: 6,
  confidence: 0.9,
  warnings: [],
  occurrenceCount: 1,
};

describe('analyzed beta mobile navigation', () => {
  it('uses every confirmed video for all moves and only matching videos for a target', () => {
    expect(buildAnalyzedBetaNavigationItems(videos, [], 'all').map((item) => item.video.id)).toEqual([
      'scraped-one',
      'scraped-two',
    ]);
    expect(buildAnalyzedBetaNavigationItems(videos, [attempt], attempt.moveKey)).toEqual([
      { video: videos[1], attempt },
    ]);
  });
});
