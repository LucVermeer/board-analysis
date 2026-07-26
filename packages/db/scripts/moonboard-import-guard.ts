import { isLocalDatabaseUrl } from './db-connection.js';

// The env var a human sets to deliberately bypass the guard below (e.g. to
// re-run against a restored snapshot or a staging copy). Never set by any
// automation in this repo, so a mistyped DB_URL can never carry it.
export const MOONBOARD_IMPORT_ALLOW_REMOTE_ENV_VAR = 'MOONBOARD_IMPORT_ALLOW_REMOTE';

export type MoonBoardImportDecision = 'local' | 'remote-allowed' | 'remote-refused';

/**
 * Pure decision logic for whether a deprecated MoonBoard importer
 * (import-moonboard-problems.ts / import-moonboard-2024.ts) should be allowed
 * to run against `databaseUrl`. Both importers are superseded by
 * import-moonboard-catalog.ts and their stats upsert can regress newer grade
 * data on a re-run (issue #3530), so they must refuse anything but a
 * recognizably local/dev-tooling host unless a human explicitly opts in via
 * MOONBOARD_IMPORT_ALLOW_REMOTE=1.
 *
 * Takes the override value as a parameter (rather than reading
 * process.env itself) so this stays pure and unit-testable; only the exact
 * string '1' opts in — any other value (unset, 'true', 'yes', '') fails
 * closed to 'remote-refused'.
 */
export function resolveMoonBoardImportDecision(
  databaseUrl: string,
  allowRemoteEnvValue: string | undefined,
): MoonBoardImportDecision {
  if (isLocalDatabaseUrl(databaseUrl)) return 'local';
  return allowRemoteEnvValue === '1' ? 'remote-allowed' : 'remote-refused';
}

/**
 * Enforces resolveMoonBoardImportDecision for a deprecated MoonBoard importer
 * script. Exits the process (never returns) when the run must not proceed.
 * Callers must print the resolved target host themselves before calling this,
 * so the operator sees it regardless of which branch is taken.
 */
export function assertMoonBoardImportAllowed(databaseUrl: string, scriptLabel: string): void {
  const decision = resolveMoonBoardImportDecision(databaseUrl, process.env[MOONBOARD_IMPORT_ALLOW_REMOTE_ENV_VAR]);

  if (decision === 'local') return;

  if (decision === 'remote-allowed') {
    console.warn(
      `⚠️  ${MOONBOARD_IMPORT_ALLOW_REMOTE_ENV_VAR}=1 set — proceeding against a non-local database despite ${scriptLabel} being deprecated.`,
    );
    return;
  }

  console.error(`❌ ${scriptLabel} refuses to run against a non-local database.`);
  console.error('   This importer is deprecated and its stats upsert can regress newer grade data on a re-run.');
  console.error('   Use `vp run db:import-moonboard-catalog` for prod/authoritative imports instead.');
  console.error(
    `   If this is a deliberate run against a restored snapshot or staging copy, set ${MOONBOARD_IMPORT_ALLOW_REMOTE_ENV_VAR}=1.`,
  );
  process.exit(1);
}
