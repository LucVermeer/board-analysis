import { describe, expect, it } from 'vitest';
import type { KilterReferencePull } from './reference-pull';
import type { LayoutResolver } from './layout-resolver';
import { buildKilterLocationRecords } from './locations-sync';

function resolver(): LayoutResolver {
  return {
    resolve: (productLayoutUuid: string) => (productLayoutUuid === '27' ? 1 : null),
    drainNewAliases: () => [],
    unmapped: () => [],
  };
}

describe('buildKilterLocationRecords', () => {
  it('maps Kilter gyms and walls into public board location records', () => {
    const reference: KilterReferencePull = {
      products: [],
      holds: [],
      difficultyGrades: [],
      productLayouts: [
        {
          productLayoutUuid: '27',
          productName: 'Kilter Board Original',
          isListed: true,
          edgeLeft: 0,
          edgeRight: 144,
          edgeBottom: 12,
          edgeTop: 156,
        },
      ],
      gyms: [
        {
          id: 'gym-row',
          gymUuid: 'gym-uuid',
          name: 'Board House',
          address: '1 Wall St',
          city: 'Sydney',
          country: 'AU',
          countryCode: 'AU',
          postalCode: '2000',
          latitude: -33.86,
          longitude: 151.2,
          instagramUsername: null,
          gymLogo: null,
          bannerLogo: null,
          isListed: true,
        },
      ],
      walls: [
        {
          id: 'wall-row',
          wallUuid: 'wall-uuid',
          gymUuid: 'gym-uuid',
          name: null,
          productName: 'Kilter Board Original',
          productLayoutUuid: '27',
          isAdjustable: true,
          minAngle: null,
          maxAngle: null,
          angleIncrements: null,
          angle: 35,
          serialNumber: 'SERIAL-1',
          accumulatedHoldSetValue: 1,
          isListed: true,
          createdAt: null,
        },
      ],
    };

    const { records, skipped } = buildKilterLocationRecords(reference, resolver());

    expect(skipped).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sourceKey: 'kilter:gym-uuid:wall-uuid',
      gymSourceKey: 'kilter:gym-uuid',
      boardType: 'kilter',
      layoutId: 1,
      sizeId: 27,
      setIds: '1',
      name: 'Board House - Kilter Board Original',
      locationName: 'Sydney, AU',
      angle: 35,
      isAngleAdjustable: true,
      serialNumber: 'SERIAL-1',
    });
  });
});
