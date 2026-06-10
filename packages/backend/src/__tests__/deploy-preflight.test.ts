import { describe, expect, it, vi } from 'vitest';
import {
  getBackendBuildSha,
  isMissingMigrationTableError,
  readBundledLatestMigration,
  readLatestAppliedMigrationCreatedAt,
  verifyDeployCompatibility,
} from '../utils/deploy-preflight';

type ReadLatestAppliedMigrationOptions = NonNullable<Parameters<typeof readLatestAppliedMigrationCreatedAt>[1]>;
type ExecuteFirstRowOverride = NonNullable<ReadLatestAppliedMigrationOptions['executeFirstRow']>;
type ExecuteFirstRowArgs = Parameters<ExecuteFirstRowOverride>;

describe('deploy preflight', () => {
  it('reads the latest valid migration from the bundled journal shape', () => {
    expect(
      readBundledLatestMigration({
        entries: [
          { tag: '0120_previous', when: 1781057000000 },
          { tag: '0121_add_quality_search_covering_index', when: 1781058236000 },
          { tag: 'ignored_missing_timestamp' },
        ],
      }),
    ).toEqual({
      tag: '0121_add_quality_search_covering_index',
      createdAt: 1781058236000,
    });
  });

  it('uses the newest migration timestamp when journal entries are out of order', () => {
    expect(
      readBundledLatestMigration({
        entries: [
          { tag: '0121_latest', when: 1781058236000 },
          { tag: '0120_previous', when: 1781057000000 },
        ],
      }),
    ).toEqual({
      tag: '0121_latest',
      createdAt: 1781058236000,
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
      readLatestAppliedMigrationCreatedAt('drizzle', {
        database: databasePassedToFirstRow,
        executeFirstRow: firstRow,
      }),
    ).resolves.toBeNull();

    expect(firstRowCalls).toHaveLength(1);
    expect(firstRowCalls[0]?.database).toBe(databasePassedToFirstRow);
  });

  it('throws when the database migration timestamp is newer than the backend bundle', async () => {
    await expect(
      verifyDeployCompatibility({
        env: { GIT_SHA: 'backend-sha' },
        logger: { info: vi.fn(), warn: vi.fn() },
        readBundledLatestMigration: () => ({ tag: '0121_bundle', createdAt: 100 }),
        readLatestAppliedMigrationCreatedAt: async (schemaName) => (schemaName === 'drizzle' ? 101 : null),
      }),
    ).rejects.toThrow(
      'Database migration timestamp 101 is newer than backend bundle backend-sha expects (0121_bundle:100)',
    );
  });

  it('allows startup when the database migration timestamp is not newer than the bundle', async () => {
    await expect(
      verifyDeployCompatibility({
        env: { GIT_SHA: 'backend-sha' },
        logger: { info: vi.fn(), warn: vi.fn() },
        readBundledLatestMigration: () => ({ tag: '0121_bundle', createdAt: 100 }),
        readLatestAppliedMigrationCreatedAt: async (schemaName) => (schemaName === 'drizzle' ? 100 : 99),
      }),
    ).resolves.toBeUndefined();
  });

  it('warns and continues when the bundled migration reader throws', async () => {
    const warn = vi.fn();
    const info = vi.fn();
    const readLatestAppliedMigrationCreatedAtMock = vi.fn(async () => 100);

    await expect(
      verifyDeployCompatibility({
        env: {},
        logger: { info, warn },
        readBundledLatestMigration: () => {
          throw new Error('bundle import failed');
        },
        readLatestAppliedMigrationCreatedAt: readLatestAppliedMigrationCreatedAtMock,
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
    expect(readLatestAppliedMigrationCreatedAtMock).not.toHaveBeenCalled();
  });
});
