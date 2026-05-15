/**
 * Background cleanup of stale APNs Live Activity tokens.
 *
 * Tokens accumulate when iOS devices stop calling the unregister path (app
 * force-killed, OS reinstall, user removed the Activity manually). Until now
 * those rows were only cleared as a side-effect of an APNs send returning
 * 410/BadDeviceToken, which doesn't happen for sessions that have gone idle.
 *
 * A week of `updated_at` staleness is a strong signal the device is gone —
 * every legitimate device re-registers on app foreground / Activity start, and
 * those paths bump `updated_at` via the UPSERT.
 */

import { lt } from 'drizzle-orm';
import { activityPushTokens } from '@boardsesh/db/schema/app';
import { db } from '../../db/client';
import { incrementApnsMetric, isApnsConfigured } from './index';
import { logger } from '../../utils/logger';

const STALE_TOKEN_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let cleanupHandle: ReturnType<typeof setInterval> | null = null;

async function runCleanupTick(): Promise<void> {
  if (!isApnsConfigured()) return;
  const cutoff = new Date(Date.now() - STALE_TOKEN_AGE_MS);
  try {
    const result = await db
      .delete(activityPushTokens)
      .where(lt(activityPushTokens.updatedAt, cutoff))
      .returning({ token: activityPushTokens.token });
    if (result.length > 0) {
      incrementApnsMetric('tokensSweptStale', result.length);
      logger.info(
        `[APNs Cleanup] Removed ${String(result.length)} push token(s) untouched since ${cutoff.toISOString()}`,
      );
    }
  } catch (error) {
    logger.error('[APNs Cleanup] Failed to remove stale tokens:', error);
  }
}

/** Start the periodic stale-token cleanup loop. */
export function startApnsStaleTokenCleanup(): void {
  if (cleanupHandle !== null) return;
  logger.info(
    `[APNs Cleanup] Started (interval=${String(CLEANUP_INTERVAL_MS)}ms, ` +
      `staleAfter=${String(STALE_TOKEN_AGE_MS / (24 * 60 * 60 * 1000))}d)`,
  );

  // Run once shortly after startup so a fresh deploy benefits immediately,
  // then on the regular interval. A small delay avoids piling work onto the
  // process boot.
  const initialDelay = setTimeout(() => {
    runCleanupTick().catch((error) => {
      logger.error('[APNs Cleanup] Initial tick failed:', error);
    });
  }, 60 * 1000);
  if (typeof initialDelay.unref === 'function') initialDelay.unref();

  cleanupHandle = setInterval(() => {
    runCleanupTick().catch((error) => {
      logger.error('[APNs Cleanup] Tick failed:', error);
    });
  }, CLEANUP_INTERVAL_MS);

  if (typeof cleanupHandle.unref === 'function') cleanupHandle.unref();
}

export function stopApnsStaleTokenCleanup(): void {
  if (cleanupHandle === null) return;
  clearInterval(cleanupHandle);
  cleanupHandle = null;
  logger.info('[APNs Cleanup] Stopped');
}

/** Test-only utility. */
export async function __runCleanupTickForTests(): Promise<void> {
  await runCleanupTick();
}
