import { describe, expect, it, vi } from 'vitest';
import {
  getBackendBuildSha,
  isMissingMigrationTableError,
  readBundledLatestMigration,
  readLatestAppliedMigrationState,
  verifyDeployCompatibility,
} from '../utils/deploy-preflight';

type ReadLatestAppliedMigrationOptions = NonNullable<Parameters<typeof readLatestAppliedMigrationState>[1]>;
type ExecuteFirstRowOverride = NonNullable<ReadLatestAppliedMigrationOptions['executeFirstRow']>;
type ExecuteFirstRowArgs = Parameters<ExecuteFirstRowOverride>;

describe('deploy preflight', () => {
  it('reads the latest valid migration from the bundled journal shape', () => {
    expect(
      readBundledLatestMigration({
        entries: [
          { idx: 120, tag: '0120_previous', when: 1781057000000 },
          { idx: 121, tag: '0121_add_quality_search_covering_index', when: 1781058236000 },
          { tag: 'ignored_missing_timestamp' },
        ],
      }),
    ).toEqual({
      tag: '0121_add_quality_search_covering_index',
      createdAt: 1781058236000,
      migrationId: 122,
    });
  });

  it('uses the highest migration id when journal entries are out of order', () => {
    expect(
      readBundledLatestMigration({
        entries: [
          { idx: 121, tag: '0121_latest', when: 1781058236000 },
          { idx: 120, tag: '0120_previous', when: 1781059000000 },
        ],
      }),
    ).toEqual({
      tag: '0121_latest',
      createdAt: 1781058236000,
      migrationId: 122,
    });
  });

  it('returns null for malformed or empty migration journals', () => {
    expect(readBundledLatestMigration({ entries: [] })).toBeNull();
    expect(readBundledLatestMigration({ notEntries: [] })).toBeNull();
  });

  it('uses the first available build SHA environment key', () => {
    expect(
      getBackendBuildSha({
        VERCEL_GIT_COMMIT_SHA: 'vercel-sha',
        GIT_SHA: 'generic-sha',
      }),
    ).toBe('vercel-sha');
  });

  it('returns unknown when no build SHA environment key is available', () => {
    expect(getBackendBuildSha({})).toBe('unknown');
  });

  it('detects migration-table errors wrapped by the DB client', () => {
    const missingTableCause = Object.assign(new Error('relation does not exist'), { code: '42P01' });
    const wrappedError = new Error('Failed query', { cause: missingTableCause });

    expect(isMissingMigrationTableError(wrappedError)).toBe(true);
  });

  it('treats missing migration tables as unknown migration state', async () => {
    const missingTableCause = Object.assign(new Error('relation does not exist'), { code: '42P01' });
    const wrappedError = new Error('Failed query', { cause: missingTableCause });
    const databasePassedToFirstRow = { execute: vi.fn(async () => []) };
    const firstRowCalls: Array<{ database: unknown; query: unknown }> = [];
    const firstRow: ExecuteFirstRowOverride = async <T>(
      database: ExecuteFirstRowArgs[0],
      query: ExecuteFirstRowArgs[1],
    ): Promise<T | undefined> => {
      firstRowCalls.push({ database, query });
      throw wrappedError;
    };

    await expect(
      readLatestAppliedMigrationState('drizzle', {
        database: databasePassedToFirstRow,
        executeFirstRow: firstRow,
      }),
    ).resolves.toBeNull();

    expect(firstRowCalls).toHaveLength(1);
    expect(firstRowCalls[0]?.database).toBe(databasePassedToFirstRow);
  });

  it('reads applied migration id and count from the drizzle migrations table', async () => {
    const firstRow: ExecuteFirstRowOverride = async <T>(): Promise<T | undefined> =>
      ({ latestMigrationId: '122', appliedMigrationCount: '122' }) as T;

    await expect(
      readLatestAppliedMigrationState('drizzle', {
        database: { execute: vi.fn(async () => []) },
        executeFirstRow: firstRow,
      }),
    ).resolves.toEqual({ latestMigrationId: 122, appliedMigrationCount: 122 });
  });

  it('throws when the database migration id is newer than the backend bundle', async () => {
    await expect(
      verifyDeployCompatibility({
        env: { GIT_SHA: 'backend-sha' },
        logger: { info: vi.fn(), warn: vi.fn() },
        readBundledLatestMigration: () => ({ tag: '0121_bundle', createdAt: 100, migrationId: 122 }),
        readLatestAppliedMigrationState: async (schemaName) =>
          schemaName === 'drizzle' ? { latestMigrationId: 123, appliedMigrationCount: 123 } : null,
      }),
    ).rejects.toThrow(
      'Database migration id 123 is newer than backend bundle backend-sha expects (0121_bundle:id 122)',
    );
  });

  it('allows startup when the database migration id is not newer than the bundle', async () => {
    await expect(
      verifyDeployCompatibility({
        env: { GIT_SHA: 'backend-sha' },
        logger: { info: vi.fn(), warn: vi.fn() },
        readBundledLatestMigration: () => ({ tag: '0121_bundle', createdAt: 100, migrationId: 122 }),
        readLatestAppliedMigrationState: async (schemaName) =>
          schemaName === 'drizzle'
            ? { latestMigrationId: 122, appliedMigrationCount: 122 }
            : { latestMigrationId: 121, appliedMigrationCount: 121 },
      }),
    ).resolves.toBeUndefined();
  });

  it('warns and continues when applied migration state cannot be read', async () => {
    const warn = vi.fn();
    const info = vi.fn();
    const databaseError = new Error('connection refused');

    await expect(
      verifyDeployCompatibility({
        env: { GIT_SHA: 'backend-sha' },
        logger: { info, warn },
        readBundledLatestMigration: () => ({ tag: '0121_bundle', createdAt: 100, migrationId: 122 }),
        readLatestAppliedMigrationState: async (schemaName) => {
          if (schemaName === 'drizzle') throw databaseError;
          return null;
        },
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      '[Deploy] Could not read applied migration state',
      expect.objectContaining({ buildSha: 'backend-sha', schemaName: 'drizzle', error: databaseError }),
    );
  });

  it('warns and continues when the bundled migration reader throws', async () => {
    const warn = vi.fn();
    const info = vi.fn();
    const readLatestAppliedMigrationStateMock = vi.fn(async () => ({
      latestMigrationId: 100,
      appliedMigrationCount: 100,
    }));

    await expect(
      verifyDeployCompatibility({
        env: {},
        logger: { info, warn },
        readBundledLatestMigration: () => {
          throw new Error('bundle import failed');
        },
        readLatestAppliedMigrationState: readLatestAppliedMigrationStateMock,
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      '[Deploy] Could not read bundled migration journal',
      expect.objectContaining({ buildSha: 'unknown' }),
    );
    expect(info).toHaveBeenCalledWith(
      '[Deploy] Backend build info',
      expect.objectContaining({
        buildSha: 'unknown',
        expectedMigration: null,
        expectedMigrationCreatedAt: null,
      }),
    );
    expect(readLatestAppliedMigrationStateMock).not.toHaveBeenCalled();
  });
});
