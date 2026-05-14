/**
 * APNs Live Activity heartbeat.
 *
 * Backgrounded iOS apps lose the native WebSocket, so the only way to keep the
 * lock-screen Live Activity from going stale (`staleDate = now + 10min` on the
 * device) is for the server to push an APNs update. Real queue events do that
 * naturally, but when a session is idle for several minutes the activity would
 * tip over into "Session ended" before any new event arrives.
 *
 * This module runs a periodic sweep every 90 s that re-sends the current
 * content state for every session with at least one registered push token. It
 * piggybacks on the existing debounce path, so if a real queue event was
 * already coalesced into the pending window the heartbeat just gets dropped
 * harmlessly.
 */

import { sql } from 'drizzle-orm';
import { activityPushTokens } from '@boardsesh/db/schema/app';
import { db } from '../../db/client';
import { type LiveActivityContentState, incrementApnsMetric, isApnsConfigured, sendLiveActivityUpdate } from './index';
import type { roomManager as RoomManagerType } from '../room-manager';

/**
 * 90 s gives 6× headroom against the 10-minute iOS staleInterval. We need to
 * stay well below the staleInterval so a single dropped APNs (network blip,
 * APNs latency spike, server restart) doesn't tip the activity into stale.
 */
const HEARTBEAT_INTERVAL_MS = 90 * 1000;

let heartbeatHandle: ReturnType<typeof setInterval> | null = null;

type RoomManager = Pick<typeof RoomManagerType, 'getQueueState'>;

/**
 * Distinct session_ids that currently have at least one registered push token.
 * Bounded by the total number of active iOS Live Activities in the cluster,
 * which is small enough that a SELECT DISTINCT every 90 s is fine.
 */
async function getSessionsWithRegisteredTokens(): Promise<string[]> {
  const rows = await db.execute<{ session_id: string }>(sql`SELECT DISTINCT session_id FROM ${activityPushTokens}`);
  // drizzle's execute returns either { rows: [...] } or the raw array depending
  // on the dialect/driver. Normalize.
  const data =
    (rows as unknown as { rows?: { session_id: string }[] }).rows ?? (rows as unknown as { session_id: string }[]);
  return data.map((r) => r.session_id);
}

async function buildContentStateForSession(
  sessionId: string,
  roomManager: RoomManager,
): Promise<LiveActivityContentState | null> {
  const queueState = await roomManager.getQueueState(sessionId);
  const currentItem = queueState.currentClimbQueueItem;
  if (!currentItem) return null;

  const currentIndex = queueState.queue.findIndex((item) => item.uuid === currentItem.uuid);

  return {
    climbName: currentItem.climb.name,
    climbDifficulty: currentItem.climb.difficulty,
    angle: currentItem.climb.angle,
    currentIndex: currentIndex >= 0 ? currentIndex : 0,
    totalClimbs: queueState.queue.length,
    hasNext: currentIndex >= 0 && currentIndex < queueState.queue.length - 1,
    hasPrevious: currentIndex > 0,
    climbUuid: currentItem.climb.uuid,
  };
}

async function runHeartbeatTick(roomManager: RoomManager): Promise<void> {
  if (!isApnsConfigured()) return;

  let sessions: string[];
  try {
    sessions = await getSessionsWithRegisteredTokens();
  } catch (error) {
    console.error('[APNs Heartbeat] Failed to list sessions with registered tokens:', error);
    return;
  }

  if (sessions.length === 0) return;

  for (const sessionId of sessions) {
    try {
      const state = await buildContentStateForSession(sessionId, roomManager);
      if (!state) continue;
      sendLiveActivityUpdate(sessionId, state);
      incrementApnsMetric('heartbeatsSent');
    } catch (error) {
      console.warn(`[APNs Heartbeat] Failed to build heartbeat state for session ${sessionId}:`, error);
    }
  }
}

/**
 * Start the periodic heartbeat loop. Safe to call multiple times; subsequent
 * calls are no-ops until `stopApnsHeartbeat()` is called.
 */
export function startApnsHeartbeat(roomManager: RoomManager): void {
  if (heartbeatHandle !== null) return;
  if (!isApnsConfigured()) return;

  console.info(`[APNs Heartbeat] Started (interval=${String(HEARTBEAT_INTERVAL_MS)}ms)`);

  heartbeatHandle = setInterval(() => {
    runHeartbeatTick(roomManager).catch((error) => {
      console.error('[APNs Heartbeat] Tick failed:', error);
    });
  }, HEARTBEAT_INTERVAL_MS);

  if (typeof heartbeatHandle.unref === 'function') heartbeatHandle.unref();
}

export function stopApnsHeartbeat(): void {
  if (heartbeatHandle === null) return;
  clearInterval(heartbeatHandle);
  heartbeatHandle = null;
  console.info('[APNs Heartbeat] Stopped');
}

/** Test-only utility. */
export async function __runHeartbeatTickForTests(roomManager: RoomManager): Promise<void> {
  await runHeartbeatTick(roomManager);
}
