import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import {
  getMoonBoardLocationConfigs,
  toLocationSyncLogger,
  upsertPublicBoardLocations,
  type LocationSyncSummary,
  type PublicBoardLocationInput,
} from '@boardsesh/location-sync';
import { normalizeGymName } from '@boardsesh/db/queries';
import { MoonBoardClient, type MoonBoardMarker } from '../api/moonboard-client';

type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

type MarkerCoordinates = {
  latitude: number;
  longitude: number;
};

function finiteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function markerCoordinates(marker: MoonBoardMarker): MarkerCoordinates {
  const latitude = finiteNumber(marker.Latitude) ? marker.Latitude : (marker.LatLng?.[0] ?? Number.NaN);
  const longitude = finiteNumber(marker.Longitude) ? marker.Longitude : (marker.LatLng?.[1] ?? Number.NaN);
  return { latitude, longitude };
}

/**
 * Snaps a coordinate to a coarse ~1.1 km grid (integer hundredths of a degree
 * north-south) for use as the *stable* part of a MoonBoard gym's identity.
 *
 * MoonBoard's map-marker payload carries no upstream id, so a gym's identity has
 * to come from its name + location. Full-precision coordinates made the source
 * key change on every pin nudge, which minted a permanent duplicate gym on any
 * move beyond the 20 m physical-match tier (issue #3715: the moved pin trips the
 * same-provider guard at 20-150 m and mints a twin). Rounding to a coarse cell
 * keeps the key stable across the whole realistic pin-correction range (GPS /
 * map-click jitter), while two same-named gyms in genuinely different places
 * (the collisions we see in prod sit thousands of km apart) still land on
 * distinct keys. A rare correction that crosses a cell boundary AND lands in the
 * 20-150 m band mints one twin that surfaces in the /admin/gym-duplicates queue
 * for a human merge.
 *
 * Integer grid units (not `toFixed`) avoid floating-point / `-0` string
 * artifacts, so the same coordinate always yields the same key.
 */
function coarseGeoCell(latitude: number, longitude: number): string {
  return `${Math.round(latitude * 100)}:${Math.round(longitude * 100)}`;
}

function baseSourceKey(marker: MoonBoardMarker): string {
  const coordinates = markerCoordinates(marker);
  // The key is normalized (lowercase, single-spaced) so casing / whitespace
  // jitter in the upstream marker name can't split one gym into two identities;
  // the human-readable name is kept separately for display (see gymName below).
  const name = normalizeGymName(marker.Name || 'MoonBoard Gym');
  return `moonboard:${name}:${coarseGeoCell(coordinates.latitude, coordinates.longitude)}`;
}

function sourceKeyForConfig(marker: MoonBoardMarker, layoutId: number, angle: number): string {
  const base = baseSourceKey(marker);
  // The 2016 / 40 degree install keeps the bare base key (no layout:angle
  // suffix) so it stays the gym's default board; every other layout/angle gets a
  // suffixed key.
  return layoutId === 2 && angle === 40 ? base : `${base}:${layoutId}:${angle}`;
}

export function buildMoonBoardLocationRecords(markers: MoonBoardMarker[]): PublicBoardLocationInput[] {
  const records: PublicBoardLocationInput[] = [];
  const configs = getMoonBoardLocationConfigs();

  for (const marker of markers) {
    const gymName = marker.Name || 'MoonBoard Gym';
    const gymSourceKey = baseSourceKey(marker);
    const coordinates = markerCoordinates(marker);
    for (const config of configs) {
      records.push({
        ...config,
        sourceKey: sourceKeyForConfig(marker, config.layoutId, config.angle),
        gymSourceKey,
        name: `${gymName} - ${config.layoutName} ${config.angle}deg`,
        slugBase:
          config.layoutId === 2 && config.angle === 40
            ? `${gymName}-moonboard`
            : `${gymName}-moonboard-${config.layoutId}-${config.angle}`,
        locationName: null,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        gymName,
        gymAddress: null,
      });
    }
  }

  return records;
}

export async function syncMoonBoardLocations(args: {
  db: DrizzleDb;
  username: string;
  password: string;
  log?: (message: string) => void;
}): Promise<LocationSyncSummary> {
  const client = new MoonBoardClient();
  await client.authenticate(args.username, args.password);
  const markers = await client.getMapMarkers();
  const records = buildMoonBoardLocationRecords(markers);
  const summary = await upsertPublicBoardLocations(args.db, records, {
    logger: toLocationSyncLogger(args.log),
  });
  args.log?.(
    `[moonboard-locations] upserted ${summary.boardsUpserted}/${summary.boardsSeen} board(s), ${summary.gymsUpserted} gym(s), skipped ${summary.boardsSkipped}`,
  );
  return summary;
}
