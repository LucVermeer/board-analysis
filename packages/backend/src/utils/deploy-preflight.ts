import { sql } from 'drizzle-orm';
import { executeFirstRow } from '@boardsesh/db/client';
import bundledMigrationJournal from '@boardsesh/db/migration-journal' with { type: 'json' };
import { db } from '../db/client';
import { asErrorLikeRecord } from './error-utils';
import { logger } from './logger';

type MigrationJournalEntry = {
  idx?: number;
  tag: string;
  when: number;
};

type MigrationJournal = {
  entries: MigrationJournalEntry[];
};

type AppliedMigrationStateRow = {
  latestMigrationId: string | number | bigint | null;
  appliedMigrationCount: string | number | bigint | null;
};

export type MigrationInfo = {
  tag: string;
  createdAt: number;
  migrationId: number;
};

export type AppliedMigrationState = {
  latestMigrationId: number;
  appliedMigrationCount: number;
};

const BUILD_SHA_ENV_KEYS = [
  'RAILWAY_GIT_COMMIT_SHA',
  'VERCEL_GIT_COMMIT_SHA',
  'GIT_SHA',
  'COMMIT_SHA',
  'SOURCE_VERSION',
] as const;

type BuildShaEnv = Partial<Record<(typeof BUILD_SHA_ENV_KEYS)[number], string | undefined>>;

function isMigrationJournal(value: unknown): value is MigrationJournal {
  if (!value || typeof value !== 'object' || !('entries' in value)) return false;
  const entries = (value as { entries?: unknown }).entries;
  return Array.isArray(entries);
}

export function getBackendBuildSha(env: BuildShaEnv | NodeJS.ProcessEnv = process.env): string {
  for (const key of BUILD_SHA_ENV_KEYS) {
    const sha = env[key];
    if (sha) return sha;
  }
  return 'unknown';
}

export function readBundledLatestMigration(journal: unknown = bundledMigrationJournal): MigrationInfo | null {
  if (!isMigrationJournal(journal)) return null;

  const validEntries = journal.entries
    .map((entry, entryIndex) => ({ entry, entryIndex }))
    .filter(
      (candidate): candidate is { entry: MigrationJournalEntry; entryIndex: number } =>
        !!candidate.entry &&
        typeof candidate.entry === 'object' &&
        typeof candidate.entry.tag === 'string' &&
        typeof candidate.entry.when === 'number',
    );
  if (validEntries.length === 0) return null;

  const migrationIdForEntry = (entry: MigrationJournalEntry, entryIndex: number) =>
    typeof entry.idx === 'number' && Number.isInteger(entry.idx) && entry.idx >= 0 ? entry.idx + 1 : entryIndex + 1;

  const latestEntry = validEntries.reduce((latest, candidate) => {
    const latestMigrationId = migrationIdForEntry(latest.entry, latest.entryIndex);
    const candidateMigrationId = migrationIdForEntry(candidate.entry, candidate.entryIndex);
    if (candidateMigrationId > latestMigrationId) return candidate;
    if (candidateMigrationId === latestMigrationId && candidate.entry.when > latest.entry.when) return candidate;
    return latest;
  });

  return {
    tag: latestEntry.entry.tag,
    createdAt: latestEntry.entry.when,
    migrationId: migrationIdForEntry(latestEntry.entry, latestEntry.entryIndex),
  };
}

export function isMissingMigrationTableError(error: unknown, depth = 0): boolean {
  if (depth > 3) return false;

  const errorRecord = asErrorLikeRecord(error);
  if (!errorRecord) return false;

  // 42P01 = undefined_table, 3F000 = invalid_schema_name.
  if (errorRecord.code === '42P01' || errorRecord.code === '3F000') return true;
  return isMissingMigrationTableError(errorRecord.cause, depth + 1);
}

type ReadLatestAppliedMigrationOptions = {
  database?: Parameters<typeof executeFirstRow>[0];
  executeFirstRow?: typeof executeFirstRow;
};

export async function readLatestAppliedMigrationState(
  schemaName: 'drizzle' | 'public',
  options: ReadLatestAppliedMigrationOptions = {},
): Promise<AppliedMigrationState | null> {
  const database = options.database ?? db;
  const firstRow = options.executeFirstRow ?? executeFirstRow;
  // Use id/count instead of created_at. Drizzle's table records created_at from
  // the journal in normal migrations, but seeded/prebuilt DB images can contain
  // apply-time values there; id/count still tells us if the DB has more applied
  // migrations than this bundle knows about.
  const query =
    schemaName === 'drizzle'
      ? sql`SELECT MAX("id")::int AS "latestMigrationId", COUNT(*)::int AS "appliedMigrationCount" FROM drizzle."__drizzle_migrations"`
      : sql`SELECT MAX("id")::int AS "latestMigrationId", COUNT(*)::int AS "appliedMigrationCount" FROM public."__drizzle_migrations"`;

  try {
    const row = await firstRow<AppliedMigrationStateRow>(database, query);
    const latestMigrationId = Number(row?.latestMigrationId ?? 0);
    const appliedMigrationCount = Number(row?.appliedMigrationCount ?? 0);
    if (latestMigrationId <= 0 || appliedMigrationCount <= 0) return null;
    return { latestMigrationId, appliedMigrationCount };
  } catch (error) {
    if (isMissingMigrationTableError(error)) return null;
    throw error;
  }
}

type DeployPreflightLogger = Pick<typeof logger, 'info' | 'warn'>;

type VerifyDeployCompatibilityOptions = {
  env?: BuildShaEnv | NodeJS.ProcessEnv;
  logger?: DeployPreflightLogger;
  readBundledLatestMigration?: () => MigrationInfo | null;
  readLatestAppliedMigrationState?: (schemaName: 'drizzle' | 'public') => Promise<AppliedMigrationState | null>;
};

export async function verifyDeployCompatibility(options: VerifyDeployCompatibilityOptions = {}): Promise<void> {
  const buildSha = getBackendBuildSha(options.env);
  const deployLogger = options.logger ?? logger;
  const bundledMigrationReader = options.readBundledLatestMigration ?? readBundledLatestMigration;
  const appliedMigrationReader = options.readLatestAppliedMigrationState ?? readLatestAppliedMigrationState;
  let bundledLatestMigration: MigrationInfo | null = null;

  try {
    bundledLatestMigration = bundledMigrationReader();
  } catch (error) {
    deployLogger.warn('[Deploy] Could not read bundled migration journal', { buildSha, error });
  }

  deployLogger.info('[Deploy] Backend build info', {
    buildSha,
    expectedMigration: bundledLatestMigration?.tag ?? null,
    expectedMigrationCreatedAt: bundledLatestMigration?.createdAt ?? null,
    expectedMigrationId: bundledLatestMigration?.migrationId ?? null,
  });

  if (!bundledLatestMigration) return;

  const readAppliedMigrationStateOrWarn = async (schemaName: 'drizzle' | 'public') => {
    try {
      return await appliedMigrationReader(schemaName);
    } catch (error) {
      deployLogger.warn('[Deploy] Could not read applied migration state', { buildSha, schemaName, error });
      return null;
    }
  };

  const [drizzleMigrationState, publicMigrationState] = await Promise.all([
    readAppliedMigrationStateOrWarn('drizzle'),
    readAppliedMigrationStateOrWarn('public'),
  ]);
  const latestAppliedMigrationId = Math.max(
    drizzleMigrationState?.latestMigrationId ?? 0,
    publicMigrationState?.latestMigrationId ?? 0,
  );
  const appliedMigrationCount = Math.max(
    drizzleMigrationState?.appliedMigrationCount ?? 0,
    publicMigrationState?.appliedMigrationCount ?? 0,
  );
  const appliedMigrationId = Math.max(latestAppliedMigrationId, appliedMigrationCount);

  if (appliedMigrationId === 0) {
    deployLogger.warn('[Deploy] Could not find applied drizzle migrations table', { buildSha });
    return;
  }

  if (appliedMigrationId > bundledLatestMigration.migrationId) {
    throw new Error(
      `[Deploy] Database migration id ${appliedMigrationId} is newer than backend bundle ` +
        `${buildSha} expects (${bundledLatestMigration.tag}:id ${bundledLatestMigration.migrationId}). ` +
        'Deploy newer code.',
    );
  }
}
