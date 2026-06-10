import { sql } from 'drizzle-orm';
import { executeFirstRow } from '@boardsesh/db/client';
import bundledMigrationJournal from '@boardsesh/db/migration-journal' with { type: 'json' };
import { db } from '../db/client';
import { asErrorLikeRecord } from './error-utils';
import { logger } from './logger';

type MigrationJournalEntry = {
  tag: string;
  when: number;
};

type MigrationJournal = {
  entries: MigrationJournalEntry[];
};

type LatestMigrationRow = {
  latestMigrationCreatedAt: string | number | bigint | null;
};

export type MigrationInfo = {
  tag: string;
  createdAt: number;
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

  const latestEntry = journal.entries
    .filter(
      (entry): entry is MigrationJournalEntry =>
        !!entry && typeof entry.tag === 'string' && typeof entry.when === 'number',
    )
    .reduce<MigrationJournalEntry | null>((latest, entry) => {
      if (!latest || entry.when > latest.when) return entry;
      return latest;
    }, null);
  if (!latestEntry) return null;

  return { tag: latestEntry.tag, createdAt: latestEntry.when };
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

export async function readLatestAppliedMigrationCreatedAt(
  schemaName: 'drizzle' | 'public',
  options: ReadLatestAppliedMigrationOptions = {},
): Promise<number | null> {
  const database = options.database ?? db;
  const firstRow = options.executeFirstRow ?? executeFirstRow;
  const query =
    schemaName === 'drizzle'
      ? sql`SELECT MAX("created_at")::bigint AS "latestMigrationCreatedAt" FROM drizzle."__drizzle_migrations"`
      : sql`SELECT MAX("created_at")::bigint AS "latestMigrationCreatedAt" FROM public."__drizzle_migrations"`;

  try {
    const row = await firstRow<LatestMigrationRow>(database, query);
    if (!row?.latestMigrationCreatedAt) return null;
    return Number(row.latestMigrationCreatedAt);
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
  readLatestAppliedMigrationCreatedAt?: (schemaName: 'drizzle' | 'public') => Promise<number | null>;
};

export async function verifyDeployCompatibility(options: VerifyDeployCompatibilityOptions = {}): Promise<void> {
  const buildSha = getBackendBuildSha(options.env);
  const deployLogger = options.logger ?? logger;
  const bundledMigrationReader = options.readBundledLatestMigration ?? readBundledLatestMigration;
  const appliedMigrationReader = options.readLatestAppliedMigrationCreatedAt ?? readLatestAppliedMigrationCreatedAt;
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
  });

  if (!bundledLatestMigration) return;

  const latestAppliedMigrationCreatedAt = Math.max(
    (await appliedMigrationReader('drizzle')) ?? 0,
    (await appliedMigrationReader('public')) ?? 0,
  );

  if (latestAppliedMigrationCreatedAt === 0) {
    deployLogger.warn('[Deploy] Could not find applied drizzle migrations table', { buildSha });
    return;
  }

  if (latestAppliedMigrationCreatedAt > bundledLatestMigration.createdAt) {
    throw new Error(
      `[Deploy] Database migration timestamp ${latestAppliedMigrationCreatedAt} is newer than backend bundle ` +
        `${buildSha} expects (${bundledLatestMigration.tag}:${bundledLatestMigration.createdAt}). Deploy newer code.`,
    );
  }
}
