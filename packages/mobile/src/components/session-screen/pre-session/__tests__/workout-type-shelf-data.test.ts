import { describe, expect, it } from 'vitest';
import type { PlannedClimbSlot } from '@boardsesh/playlist-generator';
import { buildWorkoutGradeBars } from '../workout-type-shelf-data';

function slot(grade: number, index: number): PlannedClimbSlot {
  return { grade, section: 'main', index };
}

const formatDifficultyId = (difficultyId: number | null | undefined) =>
  difficultyId == null ? null : `V${difficultyId - 10}`;

describe('buildWorkoutGradeBars', () => {
  it('groups planned climbs by grade in easy-to-hard order', () => {
    const bars = buildWorkoutGradeBars([slot(13, 0), slot(11, 1), slot(13, 2), slot(12, 3)], formatDifficultyId);

    expect(bars?.map((bar) => ({ key: bar.key, label: bar.label, value: bar.segments[0].value }))).toEqual([
      { key: '11', label: 'V1', value: 1 },
      { key: '12', label: 'V2', value: 1 },
      { key: '13', label: 'V3', value: 2 },
    ]);
  });

  it('falls back to the difficulty id when no formatted grade is available', () => {
    const bars = buildWorkoutGradeBars([slot(20, 0)], () => null);

    expect(bars?.[0]).toMatchObject({
      key: '20',
      label: '20',
      segments: [{ value: 1, key: '20', label: '20' }],
    });
  });

  it('returns null when there are no planned slots', () => {
    expect(buildWorkoutGradeBars([], formatDifficultyId)).toBeNull();
  });
});
