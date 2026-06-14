// These cover the pure planning/identity helpers (no DB). The behavioural half
// of upsertPublicBoardLocations — that the PostGIS `location` geography ends up
// populated from lat/lng without a manual UPDATE — depends on the migration
// 0127 triggers and is exercised by packages/db's
// location-trigger.integration.test.ts (opt-in, needs a PostGIS dev DB).
import { describe, expect, it } from 'vitest';
import type { PublicBoardLocationInput } from './types';
import {
  buildBoardWriteIdentifiers,
  buildGymWriteIdentifiers,
  buildLocationUpsertPlan,
  collectValidLocationRecords,
  collectUniqueGymLocationRecords,
} from './upsert';

const baseLocationRecord: PublicBoardLocationInput = {
  boardType: 'tension',
  layoutId: 10,
  sizeId: 6,
  setIds: '12,13',
  angle: 40,
  isAngleAdjustable: true,
  sourceKey: 'tension:board-1',
  gymSourceKey: 'tension:gym-1',
  name: 'Board One - Tension Board',
  slugBase: 'Board One-tension',
  locationName: null,
  latitude: -33.86,
  longitude: 151.2,
  gymName: 'Board House',
  gymAddress: null,
};

function locationRecord(overrides: Partial<PublicBoardLocationInput>): PublicBoardLocationInput {
  return { ...baseLocationRecord, ...overrides };
}

describe('location upsert planning', () => {
  it('filters records with invalid coordinates before writing', () => {
    const { validRecords, skipped } = collectValidLocationRecords([
      locationRecord({ sourceKey: 'tension:valid-board' }),
      locationRecord({ sourceKey: 'tension:missing-latitude', latitude: Number.NaN }),
      locationRecord({ sourceKey: 'tension:infinite-longitude', longitude: Number.POSITIVE_INFINITY }),
    ]);

    expect(validRecords.map((record) => record.sourceKey)).toEqual(['tension:valid-board']);
    expect(skipped).toEqual([
      { sourceKey: 'tension:missing-latitude', reason: 'invalid coordinates' },
      { sourceKey: 'tension:infinite-longitude', reason: 'invalid coordinates' },
    ]);
  });

  it('deduplicates gyms by gym source key while preserving the first gym row', () => {
    const duplicateGymRecords = [
      locationRecord({
        sourceKey: 'tension:board-1',
        gymSourceKey: 'tension:gym-shared',
        gymName: 'Original Gym Name',
      }),
      locationRecord({
        sourceKey: 'tension:board-2',
        gymSourceKey: 'tension:gym-shared',
        gymName: 'Later Gym Name',
      }),
      locationRecord({
        sourceKey: 'tension:board-3',
        gymSourceKey: 'tension:gym-other',
        gymName: 'Other Gym',
      }),
    ];

    const gymsBySource = collectUniqueGymLocationRecords(duplicateGymRecords);

    expect([...gymsBySource.keys()]).toEqual(['tension:gym-shared', 'tension:gym-other']);
    expect(gymsBySource.get('tension:gym-shared')).toMatchObject({
      sourceKey: 'tension:board-1',
      gymName: 'Original Gym Name',
    });
  });

  it('builds a write plan with valid boards, skipped records, and unique gyms', () => {
    const plan = buildLocationUpsertPlan([
      locationRecord({ sourceKey: 'tension:board-1', gymSourceKey: 'tension:gym-shared' }),
      locationRecord({ sourceKey: 'tension:board-2', gymSourceKey: 'tension:gym-shared' }),
      locationRecord({ sourceKey: 'tension:bad-board', gymSourceKey: 'tension:gym-bad', latitude: Number.NaN }),
    ]);

    expect(plan.validRecords.map((record) => record.sourceKey)).toEqual(['tension:board-1', 'tension:board-2']);
    expect([...plan.gymsBySource.keys()]).toEqual(['tension:gym-shared']);
    expect(plan.skipped).toEqual([{ sourceKey: 'tension:bad-board', reason: 'invalid coordinates' }]);
  });

  it('builds deterministic gym and board IDs with stable slugs', () => {
    const [validRecord] = collectValidLocationRecords([
      locationRecord({
        sourceKey: 'tension:board-house:123',
        gymSourceKey: 'tension:board-house',
        gymName: 'Board House',
        slugBase: 'Board House-tension',
      }),
    ]).validRecords;

    if (!validRecord) {
      throw new Error('Expected one valid location record');
    }

    const gymIdentifiers = buildGymWriteIdentifiers(validRecord.gymSourceKey, validRecord);
    const boardIdentifiers = buildBoardWriteIdentifiers(validRecord);

    expect(gymIdentifiers.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(gymIdentifiers.slug).toMatch(/^board-house-[0-9a-f]{6}$/);
    expect(boardIdentifiers.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(boardIdentifiers.slug).toMatch(/^board-house-tension-[0-9a-f]{8}$/);
    expect(buildGymWriteIdentifiers(validRecord.gymSourceKey, validRecord)).toEqual(gymIdentifiers);
    expect(buildBoardWriteIdentifiers(validRecord)).toEqual(boardIdentifiers);
  });
});
