export { createTestDatabase, listTables, tableColumns, primaryKeyColumns, type TestSqliteDb } from './sqlite-test-db';
// Test-only state resets for the engine's module-level guards — exported here
// (not on the main entry) so app code never sees the escape hatches.
export { __resetDrainerStateForTests } from '../mutation-queue/drainer';
export { __resetSyncSchedulerStateForTests } from '../sync/sync-scheduler';
