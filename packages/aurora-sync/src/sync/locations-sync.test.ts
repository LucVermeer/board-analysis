import { describe, expect, it } from 'vitest';
import { buildAuroraLocationRecords } from './locations-sync';

describe('buildAuroraLocationRecords', () => {
  it('maps Aurora pins to public board location records', () => {
    const { records, skipped } = buildAuroraLocationRecords('tension', [
      {
        id: 123,
        username: 'board-house',
        name: 'Board House',
        latitude: -33.86,
        longitude: 151.2,
      },
    ]);

    expect(skipped).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sourceKey: 'tension:123',
      gymSourceKey: 'tension:123',
      boardType: 'tension',
      layoutId: 10,
      sizeId: 6,
      setIds: '12,13',
      name: 'Board House - Tension Board',
      slugBase: 'Board House-tension',
      angle: 40,
      isAngleAdjustable: true,
    });
  });
});
