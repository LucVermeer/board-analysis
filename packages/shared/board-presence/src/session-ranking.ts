/**
 * Pure session-leaderboard ranking over a board's presence history.
 *
 * Turns the newest-first `BoardPresenceClimb` history the reducer already
 * tracks into a ranked "who's crushing it right now" leaderboard for the gym
 * kiosk dashboard. No React, no DOM, no react-native — same rules as the rest
 * of this package.
 */

import type { BoardPresenceClimb } from '@boardsesh/shared-schema';

export type RankedSessionClimber = {
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  sendCount: number;
  lastSentAt: string;
};

export type SessionRankingOptions = {
  /** How far back a send still counts toward the current session. Default 180. */
  windowMinutes?: number;
  /** Reference "now" the window is measured against. Default `new Date()`. */
  now?: Date;
};

const DEFAULT_WINDOW_MINUTES = 180;

type ClimberAccumulator = {
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  distinctClimbUuids: Set<string>;
  lastSentAt: string;
  lastSentAtMs: number;
};

/**
 * Ranks a board-presence history into a session leaderboard.
 *
 * - Entries older than `windowMinutes` (relative to `now`) are dropped.
 * - Entries with neither `sentByUserId` nor `sentByDisplayName` are skipped —
 *   there's nothing to group them under.
 * - Climbers are keyed on `sentByUserId` when present, falling back to
 *   `sentByDisplayName` for anonymous sends.
 * - `sendCount` is the number of *distinct* `climbUuid`s the climber sent in
 *   the window — relighting the same climb twice counts once.
 * - Ranked by `sendCount` descending, tie-broken by the climber's most recent
 *   `sentAt` descending.
 */
export function rankSessionClimbers(
  history: BoardPresenceClimb[],
  options: SessionRankingOptions = {},
): RankedSessionClimber[] {
  const windowMinutes = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  const now = options.now ?? new Date();
  const windowStartMs = now.getTime() - windowMinutes * 60_000;

  const climbersByKey = new Map<string, ClimberAccumulator>();

  for (const climb of history) {
    const sentAtMs = new Date(climb.sentAt).getTime();
    if (!Number.isFinite(sentAtMs) || sentAtMs < windowStartMs) continue;

    const userId = climb.sentByUserId ?? null;
    const displayName = climb.sentByDisplayName ?? null;
    if (!userId && !displayName) continue;

    const key = userId ? `user:${userId}` : `name:${displayName}`;
    const existing = climbersByKey.get(key);

    if (!existing) {
      climbersByKey.set(key, {
        userId,
        displayName: displayName ?? 'Anonymous',
        avatarUrl: climb.sentByAvatarUrl ?? null,
        distinctClimbUuids: new Set([climb.climbUuid]),
        lastSentAt: climb.sentAt,
        lastSentAtMs: sentAtMs,
      });
      continue;
    }

    existing.distinctClimbUuids.add(climb.climbUuid);
    if (sentAtMs > existing.lastSentAtMs) {
      existing.lastSentAtMs = sentAtMs;
      existing.lastSentAt = climb.sentAt;
      // Prefer the most recent send's identity details, in case a
      // display-name-keyed climber's avatar/name changed mid-session.
      existing.displayName = displayName ?? existing.displayName;
      existing.avatarUrl = climb.sentByAvatarUrl ?? existing.avatarUrl;
    }
  }

  return Array.from(climbersByKey.values())
    .map((climber) => ({
      userId: climber.userId,
      displayName: climber.displayName,
      avatarUrl: climber.avatarUrl,
      sendCount: climber.distinctClimbUuids.size,
      lastSentAt: climber.lastSentAt,
    }))
    .sort((first, second) => {
      if (second.sendCount !== first.sendCount) return second.sendCount - first.sendCount;
      return new Date(second.lastSentAt).getTime() - new Date(first.lastSentAt).getTime();
    });
}
