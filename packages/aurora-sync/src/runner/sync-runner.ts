import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, ne, and, or, isNotNull, sql } from 'drizzle-orm';

import { auroraCredentials } from '@boardsesh/db/schema/auth';
import { credentialRetryReadySql, selfHealStaleClimbStats } from '@boardsesh/db/queries';
import { syncUserData } from '../sync/user-sync';
import { syncSharedData } from '../sync/shared-sync';
import {
  AURORA_LOCATION_BOARDS,
  syncAllAuroraBoardLocations,
  syncAuroraBoardLocations,
  type AuroraLocationBoardName,
} from '../sync/locations-sync';
import { AuroraClimbingClient } from '../api/aurora-client';
import { isAuroraRequestError, isTransientAuroraError } from '../api/errors';
import { decrypt, encrypt } from '@boardsesh/crypto';
import type { LocationSyncSummary } from '@boardsesh/location-sync';
import type { AuroraBoardName } from '../api/types';
import { resolveDaemonOptions, runDaemonLoop } from './daemon';
import type { SyncRunnerConfig, SyncSummary, CredentialRecord, DaemonOptions } from './types';

type RunnerClient = ReturnType<typeof postgres>;
type RunnerDb = ReturnType<typeof drizzle>;

// Cooldown between shared-sync attempts on the same board, regardless of which
// user-sync triggered them. Without this, if N users on the same board cycle
// in quick succession, we'd fire N independent shared-sync loops against
// Aurora and N independent setter-notification scans — all redundant, since
// the per-table cursors mean only the first one would actually find new rows.
// 1 hour matches the smallest unit of meaningful change for board-wide data
// (climbs, climb_stats); tune via SyncRunnerConfig.sharedSyncCooldownMs.
const DEFAULT_SHARED_SYNC_COOLDOWN_MS = 60 * 60 * 1000;
const MAX_CREDENTIAL_FAILURES = 2;

type CredentialFailureUpdate = {
  credentialFailureCount?: number;
  lastCredentialFailureAt?: Date | null;
  // Scheduler/observability fields (distinct from the invalid-credential
  // counter above): the attempt clock, the general consecutive-failure count
  // that drives backoff, and the last error message. Set on the success path
  // to reset them; failures stamp them via recordSyncFailure().
  lastSyncAttemptAt?: Date;
  consecutiveFailures?: number;
  lastSyncError?: string | null;
};

export class SyncRunner {
  private config: SyncRunnerConfig;
  private daemonController: AbortController | null = null;
  private client: RunnerClient | null = null;
  private db: RunnerDb | null = null;
  private lastSharedSyncAt = new Map<string, number>();
  // In-memory hourly gate for the recompute self-heal. Resets to 0 on process
  // start, so the FIRST daemon cycle after a deploy runs the self-heal
  // immediately — exactly catching the debounced recomputes that the deploy's
  // restart dropped (the whole point of the self-heal).
  private lastSelfHealAt = 0;

  constructor(config: SyncRunnerConfig = {}) {
    this.config = config;
  }

  private getSharedSyncCooldownMs(): number {
    return this.config.sharedSyncCooldownMs ?? DEFAULT_SHARED_SYNC_COOLDOWN_MS;
  }

  private getClient(): { client: RunnerClient; db: RunnerDb } {
    if (!this.client || !this.db) {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL is required');
      }
      // `prepare: false` is required for Railway's PgBouncer pooled URL
      // (transaction-pooling mode is incompatible with prepared statements).
      this.client = postgres(connectionString, {
        max: 5,
        idle_timeout: 30,
        connect_timeout: 30,
        prepare: false,
      });
      this.db = drizzle(this.client);
    }
    return { client: this.client, db: this.db };
  }

  private log(message: string): void {
    if (this.config.onLog) {
      this.config.onLog(message);
    } else {
      console.info(message);
    }
  }

  private handleError(error: Error, context: { userId?: string; board?: string }): void {
    if (this.config.onError) {
      this.config.onError(error, context);
    } else {
      console.error(`[SyncRunner] Error:`, error, context);
    }
  }

  async syncNextUser(): Promise<SyncSummary> {
    const results: SyncSummary = {
      total: 1,
      successful: 0,
      failed: 0,
      errors: [],
    };

    const cred = await this.getNextCredentialToSync();

    if (!cred) {
      this.log(`[SyncRunner] No users with Aurora credentials to sync`);
      results.total = 0;
      return results;
    }

    this.log(`[SyncRunner] Syncing next user: ${cred.userId} for ${cred.boardType}`);

    try {
      await this.syncSingleCredential(cred);
      results.successful++;
      this.log(`[SyncRunner] ✓ Successfully synced user ${cred.userId} for ${cred.boardType}`);
    } catch (error) {
      results.failed++;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      // Stamp the scheduler + observability fields on EVERY failure, whatever
      // path inside syncSingleCredential threw (transient login, invalid
      // credential, decryption). syncSingleCredential's own error branches set
      // the user-facing sync_status/sync_error where appropriate; this always
      // advances last_sync_attempt_at (so the credential rotates out of the
      // front of the queue instead of being re-picked first every cycle),
      // bumps consecutive_failures (backoff), and records last_sync_error.
      // Without this the transient-login path advanced NOTHING and wedged the
      // whole board's sync — the aurora starvation bug.
      await this.recordSyncFailure(cred, errorMsg);
      results.errors.push({
        userId: cred.userId,
        boardType: cred.boardType,
        error: errorMsg,
      });
      this.handleError(error instanceof Error ? error : new Error(errorMsg), {
        userId: cred.userId,
        board: cred.boardType,
      });
      this.log(`[SyncRunner] ✗ Failed to sync user ${cred.userId} for ${cred.boardType}: ${errorMsg}`);
    }

    return results;
  }

  /**
   * Record a failed sync attempt on the credential's scheduler fields. Runs on
   * every user-sync failure regardless of which inner branch threw. Touches
   * ONLY the attempt clock, the consecutive-failure counter (backoff), and the
   * observability error — NOT sync_status/sync_error, which the specific error
   * branches own (a transient failure must not flip the card to 'error'). The
   * counter is incremented in SQL so it is correct even if two paths update the
   * row in one cycle (e.g. recordInvalidCredentialFailure + this).
   */
  private async recordSyncFailure(cred: CredentialRecord, errorMsg: string): Promise<void> {
    const { db } = this.getClient();
    const attemptAt = new Date();
    await db
      .update(auroraCredentials)
      .set({
        lastSyncAttemptAt: attemptAt,
        consecutiveFailures: sql`COALESCE(${auroraCredentials.consecutiveFailures}, 0) + 1`,
        lastSyncError: errorMsg,
        updatedAt: attemptAt,
      })
      .where(and(eq(auroraCredentials.userId, cred.userId), eq(auroraCredentials.boardType, cred.boardType)));
  }

  /** @deprecated Use syncNextUser() instead to avoid IP blocking */
  async syncAllUsers(): Promise<SyncSummary> {
    const results: SyncSummary = {
      total: 0,
      successful: 0,
      failed: 0,
      errors: [],
    };

    const credentials = await this.getActiveCredentials();
    results.total = credentials.length;

    this.log(`[SyncRunner] Found ${credentials.length} users with Aurora credentials to sync`);

    for (const cred of credentials) {
      try {
        await this.syncSingleCredential(cred);
        await new Promise((resolve) => setTimeout(resolve, 10000));
        results.successful++;
        this.log(`[SyncRunner] ✓ Successfully synced user ${cred.userId} for ${cred.boardType}`);
      } catch (error) {
        results.failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        // Stamp the scheduler + observability fields on every failure here too,
        // exactly as syncNextUser does. This CLI `all` path is deprecated in
        // favour of syncNextUser, but it's still wired to the `aurora-sync all`
        // command — without this it would advance neither the attempt clock nor
        // consecutive_failures, so an operator run would leave the backoff /
        // attempt-clock invisible for every credential it touched.
        await this.recordSyncFailure(cred, errorMsg);
        results.errors.push({
          userId: cred.userId,
          boardType: cred.boardType,
          error: errorMsg,
        });
        this.handleError(error instanceof Error ? error : new Error(errorMsg), {
          userId: cred.userId,
          board: cred.boardType,
        });
        this.log(`[SyncRunner] ✗ Failed to sync user ${cred.userId} for ${cred.boardType}: ${errorMsg}`);
      }
    }

    return results;
  }

  async syncUser(userId: string, boardType: string): Promise<void> {
    const { db } = this.getClient();
    const credentials = await db
      .select()
      .from(auroraCredentials)
      .where(and(eq(auroraCredentials.userId, userId), eq(auroraCredentials.boardType, boardType)))
      .limit(1);

    if (credentials.length === 0) {
      throw new Error(`No credentials found for user ${userId} on ${boardType}`);
    }

    const cred = credentials[0] as CredentialRecord;
    await this.syncSingleCredential(cred);
  }

  async runDaemon(options: DaemonOptions = {}): Promise<void> {
    if (this.daemonController && !this.daemonController.signal.aborted) {
      throw new Error('Daemon mode is already running');
    }

    const resolved = resolveDaemonOptions(options);
    const controller = new AbortController();
    this.daemonController = controller;

    this.log(
      `[SyncRunner] Starting daemon mode (${resolved.timeZone}, quiet ${resolved.quietHoursStart}:00-${resolved.quietHoursEnd}:00, random interval ${resolved.minDelayMinutes}-${resolved.maxDelayMinutes} minutes)`,
    );

    try {
      await runDaemonLoop(
        async () => {
          await this.syncNextUser();
          // Self-heal is a daemon-wide concern (not per-credential), gated
          // hourly. Runs after the per-user sync so a fresh tick's recompute
          // has had its chance first.
          await this.maybeSelfHealRecomputes();
        },
        resolved,
        {
          signal: controller.signal,
          onLog: this.log.bind(this),
          onCycleError: (error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            this.handleError(err, {});
            this.log(`[SyncRunner] Daemon cycle failed: ${err.message}`);
          },
        },
      );
    } finally {
      this.daemonController = null;
      this.log('[SyncRunner] Daemon mode stopped');
    }
  }

  private syncableCredentialsFilter() {
    return and(
      or(
        eq(auroraCredentials.syncStatus, 'pending'),
        eq(auroraCredentials.syncStatus, 'active'),
        eq(auroraCredentials.syncStatus, 'error'),
      ),
      isNotNull(auroraCredentials.encryptedUsername),
      isNotNull(auroraCredentials.encryptedPassword),
      isNotNull(auroraCredentials.auroraUserId),
      ne(auroraCredentials.boardType, 'kilter'),
    );
  }

  private async getActiveCredentials(): Promise<CredentialRecord[]> {
    const { db } = this.getClient();
    const credentials = await db.select().from(auroraCredentials).where(this.syncableCredentialsFilter());
    return credentials as CredentialRecord[];
  }

  private async getNextCredentialToSync(): Promise<CredentialRecord | null> {
    const { db } = this.getClient();
    const credentials = await db
      .select()
      .from(auroraCredentials)
      // Order by the ATTEMPT clock (bumped on EVERY attempt), not last_sync_at
      // (bumped only on success). Ordering by last_sync_at let one
      // persistently-failing credential — whose last_sync_at never advances —
      // sort to the FRONT every cycle and monopolise the single-user-per-cycle
      // queue, wedging every other user's sync (and, via the shared-sync
      // piggyback, the whole board's catalog: Touchstone went 5 months stale).
      // With the attempt clock a failure rotates to the back, and the backoff
      // predicate below skips it entirely until its window elapses, so a
      // healthy credential is picked next and its token drives shared sync.
      .where(and(this.syncableCredentialsFilter(), credentialRetryReadySql()))
      .orderBy(sql`${auroraCredentials.lastSyncAttemptAt} ASC NULLS FIRST`)
      .limit(1);

    return credentials.length > 0 ? (credentials[0] as CredentialRecord) : null;
  }

  private async syncSingleCredential(cred: CredentialRecord): Promise<void> {
    if (!cred.encryptedUsername || !cred.encryptedPassword || !cred.auroraUserId) {
      throw new Error('Missing credentials or user ID');
    }

    const boardType = cred.boardType as AuroraBoardName;

    let username: string;
    let password: string;
    try {
      username = decrypt(cred.encryptedUsername);
      password = decrypt(cred.encryptedPassword);
    } catch (decryptError) {
      const errorMessage = `Decryption failed: ${this.formatErrorMessage(decryptError)}`;
      await this.updateCredentialStatus(cred.userId, cred.boardType, 'error', errorMessage);
      throw new Error(errorMessage);
    }

    this.log(`[SyncRunner] Getting fresh token for user ${cred.userId} (${boardType})...`);
    const auroraClient = new AuroraClimbingClient({ boardName: boardType });
    let token: string;

    try {
      const loginResponse = await auroraClient.signIn(username, password);
      if (!loginResponse.token) {
        throw new Error('Login succeeded but no token returned');
      }
      token = loginResponse.token;
    } catch (loginError) {
      if (isTransientAuroraError(loginError)) {
        this.log(
          `[SyncRunner] Transient Aurora login error for user ${cred.userId} (${boardType}); will retry later: ${(loginError as Error).message}`,
        );
        throw loginError;
      }

      const errorMessage = `Login failed: ${this.formatErrorMessage(loginError)}`;
      if (this.isInvalidCredentialError(loginError)) {
        const storedErrorMessage = await this.recordInvalidCredentialFailure(cred, errorMessage);
        throw new Error(storedErrorMessage);
      } else {
        await this.updateCredentialStatus(cred.userId, cred.boardType, 'error', errorMessage);
        throw new Error(errorMessage);
      }
    }

    await this.updateStoredToken(cred.userId, cred.boardType, token);

    const { client } = this.getClient();
    this.log(`[SyncRunner] Syncing user ${cred.userId} for ${boardType}...`);
    await syncUserData(client, boardType, token, cred.auroraUserId, cred.userId, undefined, this.log.bind(this));
    const succeededAt = new Date();
    await this.updateCredentialStatus(cred.userId, cred.boardType, 'active', null, succeededAt, {
      credentialFailureCount: 0,
      lastCredentialFailureAt: null,
      // Success advances the attempt clock too (they coincide on a clean
      // cycle) and clears the backoff counter + observability error.
      lastSyncAttemptAt: succeededAt,
      consecutiveFailures: 0,
      lastSyncError: null,
    });

    // Piggyback shared sync onto user sync — the user's fresh token
    // authenticates the shared `/sync` request the same way the old Vercel
    // cron's *_SYNC_TOKEN env vars used to. Throttled per board so that N
    // consecutive user syncs for the same board don't fire N independent
    // shared-sync loops (and N copies of setter notifications for the same
    // pre-existing climbs). Failures here must not poison the user's
    // credential status, since the user-half already succeeded.
    await this.maybeRunSharedSync(boardType, token, cred.userId);
  }

  private async maybeRunSharedSync(boardType: AuroraBoardName, token: string, userId: string): Promise<void> {
    const cooldownMs = this.getSharedSyncCooldownMs();
    const lastRunAt = this.lastSharedSyncAt.get(boardType);
    const now = Date.now();

    if (lastRunAt !== undefined && now - lastRunAt < cooldownMs) {
      const remainingMs = cooldownMs - (now - lastRunAt);
      this.log(
        `[SyncRunner] Skipping shared sync for ${boardType} (last run ${Math.round(
          (now - lastRunAt) / 1000,
        )}s ago; cooldown ${Math.round(cooldownMs / 1000)}s, ${Math.round(remainingMs / 1000)}s remaining)`,
      );
      return;
    }

    // Stamp the timestamp before running so a concurrent caller (or the next
    // user-sync that lands while we're still working) doesn't also fire. Stamp
    // again on success/failure so partial work counts toward the cooldown
    // either way — a permanent failure shouldn't loop on every cycle.
    this.lastSharedSyncAt.set(boardType, now);

    const { client, db } = this.getClient();
    try {
      this.log(`[SyncRunner] Running shared sync for ${boardType} using ${userId}'s token...`);
      await syncSharedData(client, boardType, token, this.log.bind(this));
      if (this.isLocationBoard(boardType)) {
        await syncAuroraBoardLocations({ db, board: boardType, log: this.log.bind(this) });
      }
      this.lastSharedSyncAt.set(boardType, Date.now());
    } catch (sharedError) {
      this.lastSharedSyncAt.set(boardType, Date.now());
      const sharedErrorMessage = this.formatErrorMessage(sharedError);
      this.handleError(sharedError instanceof Error ? sharedError : new Error(sharedErrorMessage), {
        board: boardType,
        userId,
      });
      this.log(`[SyncRunner] Shared sync for ${boardType} failed (user sync was OK): ${sharedErrorMessage}`);
    }
  }

  private static readonly SELF_HEAL_COOLDOWN_MS = 60 * 60 * 1000;

  /**
   * Hourly recompute self-heal. The saveTick recompute is debounced in-process
   * with setTimeout, so a deploy drops any recompute still pending — leaving a
   * flash/send tick's updated_at ahead of the board_climb_stats row it feeds.
   * This bulk-recomputes those stale keys (one bounded batch per pass) so the
   * ascensionist counts self-correct instead of waiting for the next tick on
   * the same climb. A failure never breaks the daemon cycle.
   */
  private async maybeSelfHealRecomputes(): Promise<void> {
    const now = Date.now();
    if (this.lastSelfHealAt !== 0 && now - this.lastSelfHealAt < SyncRunner.SELF_HEAL_COOLDOWN_MS) {
      return;
    }
    // Stamp before running so a slow/erroring pass doesn't re-fire next cycle.
    this.lastSelfHealAt = now;
    try {
      const { db } = this.getClient();
      const { keysHealed } = await selfHealStaleClimbStats(db);
      if (keysHealed > 0) {
        this.log(`[SyncRunner] Recompute self-heal: re-derived ${keysHealed} stale climb-stat key(s)`);
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)), {});
      this.log(`[SyncRunner] Recompute self-heal failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async syncLocations(
    board: AuroraLocationBoardName | 'all',
  ): Promise<LocationSyncSummary | Record<AuroraLocationBoardName, LocationSyncSummary>> {
    const { db } = this.getClient();
    if (board === 'all') {
      return syncAllAuroraBoardLocations({ db, log: this.log.bind(this) });
    }
    return syncAuroraBoardLocations({ db, board, log: this.log.bind(this) });
  }

  private isLocationBoard(boardType: AuroraBoardName): boardType is AuroraLocationBoardName {
    return AURORA_LOCATION_BOARDS.includes(boardType as AuroraLocationBoardName);
  }

  private async updateCredentialStatus(
    userId: string,
    boardType: string,
    status: string,
    error: string | null,
    lastSyncAt?: Date,
    credentialFailureUpdate: CredentialFailureUpdate = {},
  ): Promise<void> {
    const { db } = this.getClient();
    const updateData: Record<string, unknown> = {
      syncStatus: status,
      syncError: error,
      updatedAt: new Date(),
    };

    if (lastSyncAt) {
      updateData.lastSyncAt = lastSyncAt;
    }

    if (credentialFailureUpdate.credentialFailureCount !== undefined) {
      updateData.credentialFailureCount = credentialFailureUpdate.credentialFailureCount;
    }

    if (credentialFailureUpdate.lastCredentialFailureAt !== undefined) {
      updateData.lastCredentialFailureAt = credentialFailureUpdate.lastCredentialFailureAt;
    }

    if (credentialFailureUpdate.lastSyncAttemptAt !== undefined) {
      updateData.lastSyncAttemptAt = credentialFailureUpdate.lastSyncAttemptAt;
    }

    if (credentialFailureUpdate.consecutiveFailures !== undefined) {
      updateData.consecutiveFailures = credentialFailureUpdate.consecutiveFailures;
    }

    if (credentialFailureUpdate.lastSyncError !== undefined) {
      updateData.lastSyncError = credentialFailureUpdate.lastSyncError;
    }

    await db
      .update(auroraCredentials)
      .set(updateData)
      .where(and(eq(auroraCredentials.userId, userId), eq(auroraCredentials.boardType, boardType)));
  }

  private isInvalidCredentialError(error: unknown): boolean {
    return isAuroraRequestError(error) && error.code === 'invalid_credentials';
  }

  private async recordInvalidCredentialFailure(cred: CredentialRecord, errorMessage: string): Promise<string> {
    const credentialFailureCount = (cred.credentialFailureCount ?? 0) + 1;
    const expired = credentialFailureCount >= MAX_CREDENTIAL_FAILURES;
    const storedErrorMessage = expired
      ? `${errorMessage} (expired after ${MAX_CREDENTIAL_FAILURES} failed credential attempts; reconnect to resume sync)`
      : errorMessage;

    await this.updateCredentialStatus(
      cred.userId,
      cred.boardType,
      expired ? 'expired' : 'error',
      storedErrorMessage,
      undefined,
      {
        credentialFailureCount,
        lastCredentialFailureAt: new Date(),
      },
    );

    return storedErrorMessage;
  }

  private async updateStoredToken(userId: string, boardType: string, token: string): Promise<void> {
    const encryptedToken = encrypt(token);
    const { db } = this.getClient();
    await db
      .update(auroraCredentials)
      .set({
        auroraToken: encryptedToken,
        credentialFailureCount: 0,
        lastCredentialFailureAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(auroraCredentials.userId, userId), eq(auroraCredentials.boardType, boardType)));
  }

  async close(): Promise<void> {
    this.daemonController?.abort();
    if (this.client) {
      try {
        await this.client.end();
      } finally {
        this.client = null;
        this.db = null;
      }
    }
  }

  private formatErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

export default SyncRunner;
