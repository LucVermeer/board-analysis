import { describe, expect, it } from 'vitest';
import { buildMoonBoardLocationRecords } from './locations-sync';

describe('buildMoonBoardLocationRecords', () => {
  it('creates all supported MoonBoard layout and angle boards per marker', () => {
    const records = buildMoonBoardLocationRecords([
      {
        Name: 'Board House',
        Description: '1 Wall St',
        Image: null,
        Latitude: -33.86,
        Longitude: 151.2,
        IsCommercial: true,
        IsLed: true,
        LatLng: [-33.86, 151.2],
      },
    ]);

    expect(records).toHaveLength(12);
    expect(records.map((record) => `${record.layoutId}:${record.angle}`)).toContain('2:25');
    expect(records.map((record) => `${record.layoutId}:${record.angle}`)).toContain('2:40');
    expect(records.find((record) => record.layoutId === 2 && record.angle === 40)?.sourceKey).toBe(
      'moonboard:Board House:-33.86:151.2',
    );
    expect(records.find((record) => record.layoutId === 2 && record.angle === 25)?.sourceKey).toBe(
      'moonboard:Board House:-33.86:151.2:2:25',
    );
  });
});
