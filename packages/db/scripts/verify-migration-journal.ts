/**
 * Read-only pre-flight for the migration journal check that `migrate.ts` runs
 * under `VERIFY_MIGRATION_JOURNAL=1`.
 *
 * Why it exists separately: `migrate` is the gate job for both `deploy-web` and
 * `deploy-backend` in `production-deploy.yml`, so a gap in the target database's
 * ledger blocks the whole production deploy. This script answers "would that
 * gate fire?" without applying anything — one
 * `SELECT hash FROM drizzle."__drizzle_migrations"` plus local file reads. No
 * writes, no `migrate()` call, no DDL.
 *
 * Usage: `DB_URL=postgres://... vp run db:verify-journal`
 * Exit 0 = no gap the deploy gate would fail on. Exit 1 = each missing tag
 * listed with the ledger hash its repair row needs, so nobody has to re-derive
 * a sha256 by hand (the exact parity liability this check avoids elsewhere).
 *
 * Tags in the recorded baseline (`scripts/lib/migration-ledger-baseline.ts`)
 * print with their repair hashes but do not set the exit code — production
 * carried them before the gate existed, and blocking every release on that
 * backlog is what this baseline exists to avoid. They are still printed, because
 * a tolerated gap nobody sees is a gap nobody repairs.
 */
import postgres from 'postgres';
import { describeDatabaseHost, getScriptDatabaseUrl } from './db-connection.js';
import { inspectMigrationJournal, readLedgerHashesWith } from './migration-journal.js';
import { MIGRATION_GAP_REMEDIATION } from '../../../scripts/lib/migration-ledger.js';

async function verifyMigrationJournal(): Promise<void> {
  const databaseUrl = getScriptDatabaseUrl();
  console.info(`🔎 Verifying migration journal against: ${describeDatabaseHost(databaseUrl)} (read-only)`);

  const client = postgres(databaseUrl, { max: 1 });
  try {
    const report = await inspectMigrationJournal(readLedgerHashesWith(client));
    if (report.baselinedMissing.length > 0) {
      // Printed whether or not there is a new gap: these are the tags waiting on
      // a hand repair, and the hashes below are what their repair rows need.
      console.warn(
        `⚠️  ${report.baselinedMissing.length} of ${report.expectedCount} journal migrations have no ledger row ` +
          `and are covered by the baseline recorded ${report.baseline.recordedAt} (repair pending, deploy not blocked):`,
      );
      for (const migration of report.baselinedMissing) {
        console.warn(`   • ${migration.tag}  (ledger hash ${migration.hash})`);
      }
    }
    if (report.unbaselinedMissing.length > 0) {
      console.error(
        `❌ ${report.unbaselinedMissing.length} of ${report.expectedCount} journal migrations have no row in ` +
          `drizzle.__drizzle_migrations (${report.ledgerCount} rows present).`,
      );
      for (const migration of report.unbaselinedMissing) {
        console.error(`   • ${migration.tag}  (ledger hash ${migration.hash})`);
      }
      console.error(`   ${MIGRATION_GAP_REMEDIATION}`);
      process.exitCode = 1;
      return;
    }
    console.info(
      `✅ All ${report.expectedCount - report.baselinedMissing.length} unbaselined journal migrations are ` +
        `recorded (${report.ledgerCount} ledger rows).`,
    );
  } catch (error) {
    console.error('❌ Migration journal verification failed:', error);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

void verifyMigrationJournal();
