import { describe, expect, it } from 'vitest';
import { resolveLocationSyncIntegrationConfig } from './integration-test-config';

describe('resolveLocationSyncIntegrationConfig', () => {
  it('self-skips a local developer run with no database', () => {
    expect(resolveLocationSyncIntegrationConfig({})).toEqual({
      databaseUrl: null,
      required: false,
      skipReason: 'DATABASE_URL is not set',
    });
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not a URL'],
    ['wrong protocol', 'https://localhost/main'],
    ['remote', 'postgres://postgres:password@db.example.com/main'],
  ])('fails closed in required mode when the database is %s', (_caseName, databaseUrl) => {
    expect(() =>
      resolveLocationSyncIntegrationConfig({
        REQUIRE_LOCATION_SYNC_INTEGRATION: '1',
        DATABASE_URL: databaseUrl,
      }),
    ).toThrow(/location-sync integration is required/);
  });

  it.each([
    'postgres://postgres:password@localhost:5432/main',
    'postgresql://postgres:password@127.0.0.1:5432/main',
    'postgres://postgres:password@[::1]:5432/main',
    'postgres://postgres:password@postgres:5432/main',
    'postgres://postgres:password@postgres-test:5432/main',
  ])('accepts the local PostgreSQL URL %s', (databaseUrl) => {
    expect(
      resolveLocationSyncIntegrationConfig({
        REQUIRE_LOCATION_SYNC_INTEGRATION: '1',
        DATABASE_URL: databaseUrl,
      }),
    ).toEqual({ databaseUrl, required: true, skipReason: null });
  });

  it('only arms required mode on the exact value 1', () => {
    expect(
      resolveLocationSyncIntegrationConfig({
        REQUIRE_LOCATION_SYNC_INTEGRATION: 'true',
        DATABASE_URL: 'postgres://postgres:password@db.example.com/main',
      }),
    ).toMatchObject({ databaseUrl: null, required: false });
  });
});
