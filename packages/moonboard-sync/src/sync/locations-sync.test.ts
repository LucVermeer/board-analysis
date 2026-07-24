import { describe, expect, it } from 'vitest';
import { buildMoonBoardLocationRecords } from './locations-sync';
import type { MoonBoardMarker } from '../api/moonboard-client';

function defaultBoardKey(marker: MoonBoardMarker): string | undefined {
  const records = buildMoonBoardLocationRecords([marker]);
  return records.find((record) => record.layoutId === 2 && record.angle === 40)?.sourceKey;
}

describe('buildMoonBoardLocationRecords', () => {
  it('creates all supported MoonBoard layout and angle boards per marker', () => {
    const records = buildMoonBoardLocationRecords([
      {
        Name: 'Board House',
        Description: '<p>Ask staff for the key.</p>',
        Image: null,
        Latitude: -33.86,
        Longitude: 151.2,
        IsCommercial: true,
        IsLed: true,
        LatLng: [-33.86, 151.2],
      },
    ]);

    expect(records).toHaveLength(14);
    expect(records.map((record) => `${record.layoutId}:${record.angle}`)).toContain('2:25');
    expect(records.map((record) => `${record.layoutId}:${record.angle}`)).toContain('2:40');
    expect(records.map((record) => `${record.layoutId}:${record.angle}`)).toContain('7:40');
    // Identity keys are the normalized name + a coarse ~1.1 km cell (integer
    // hundredths of a degree), not the raw full-precision coordinates. The
    // 2016/40deg default keeps the bare base key; other configs get suffixed.
    expect(records.find((record) => record.layoutId === 2 && record.angle === 40)?.sourceKey).toBe(
      'moonboard:board house:-3386:15120',
    );
    expect(records.find((record) => record.layoutId === 2 && record.angle === 25)?.sourceKey).toBe(
      'moonboard:board house:-3386:15120:2:25',
    );
    // The gym identity key matches the default board's base key, and the display
    // name keeps its original casing (only the key is normalized).
    const defaultRecord = records.find((record) => record.layoutId === 2 && record.angle === 40);
    expect(defaultRecord?.gymSourceKey).toBe('moonboard:board house:-3386:15120');
    expect(defaultRecord?.gymName).toBe('Board House');
    expect(records.every((record) => record.gymAddress === null)).toBe(true);
  });

  it('falls back to LatLng when scalar coordinates are missing', () => {
    const records = buildMoonBoardLocationRecords([
      {
        Name: 'LatLng Board',
        Description: null,
        Latitude: null,
        Longitude: null,
        LatLng: [10.5, 20.25],
      },
    ]);

    expect(records.find((record) => record.layoutId === 2 && record.angle === 40)).toMatchObject({
      sourceKey: 'moonboard:latlng board:1050:2025',
      latitude: 10.5,
      longitude: 20.25,
    });
  });

  it('keeps the same source key when a pin moves a few tens of metres within the cell', () => {
    // ~50 m nudge (0.0005 deg) that stays inside the same coarse cell. Before
    // #3715 this changed the full-precision key and minted a duplicate gym.
    const original = defaultBoardKey({ Name: 'The School Room', Latitude: 53.386, Longitude: -1.476 });
    const nudged = defaultBoardKey({ Name: 'The School Room', Latitude: 53.3865, Longitude: -1.4755 });
    expect(original).toBe('moonboard:the school room:5339:-148');
    expect(nudged).toBe(original);
  });

  it('gives two same-named gyms in different places distinct keys', () => {
    // The real prod collisions ("MoonBoard" vs "Moonboard") sit thousands of km
    // apart; a coarse cell keeps them on separate identities so they are not
    // wrongly merged into one gym.
    const sydney = defaultBoardKey({ Name: 'MoonBoard', Latitude: -33.86, Longitude: 151.2 });
    const newYork = defaultBoardKey({ Name: 'MoonBoard', Latitude: 40.71, Longitude: -74.0 });
    expect(sydney).toBe('moonboard:moonboard:-3386:15120');
    expect(newYork).toBe('moonboard:moonboard:4071:-7400');
    expect(sydney).not.toBe(newYork);
  });

  it('normalizes casing and whitespace in the identity key', () => {
    const canonical = defaultBoardKey({ Name: 'Board House', Latitude: -33.86, Longitude: 151.2 });
    const noisy = defaultBoardKey({ Name: '  BOARD   house ', Latitude: -33.86, Longitude: 151.2 });
    expect(noisy).toBe(canonical);
  });
});
