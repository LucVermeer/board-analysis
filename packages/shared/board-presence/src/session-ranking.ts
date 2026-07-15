// Pure session-leaderboard ranking over a board's presence history.

import type { BoardPresenceClimb } from '@boardsesh/shared-schema';

export type RankedSessionClimber = {
  userId: string | null;
  /** Null when the sender had no display name; the UI supplies a localized fallback. */
  displayName: string | null;
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
  displayName: string | null;
  avatarUrl: string | null;
  distinctClimbUuids: Set<string>;
  lastSentAt: string;
  lastSentAtMs: number;
};

// Ranks distinct-climb counts per climber within the session window, tie-broken by most recent send.
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

    const userId = climb.sentByUserId || null;
    const displayName = climb.sentByDisplayName || null;
    if (!userId && !displayName) continue;

    const key = userId ? `user:${userId}` : `name:${displayName}`;
    const existing = climbersByKey.get(key);

    if (!existing) {
      climbersByKey.set(key, {
        userId,
        displayName,
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
      // Prefer the most recent send's identity details (name/avatar may have changed mid-session).
      existing.displayName = displayName ?? existing.displayName;
      existing.avatarUrl = climb.sentByAvatarUrl ?? existing.avatarUrl;
    }
  }

  return Array.from(climbersByKey.values())
    .sort((first, second) => {
      const firstSendCount = first.distinctClimbUuids.size;
      const secondSendCount = second.distinctClimbUuids.size;
      if (secondSendCount !== firstSendCount) return secondSendCount - firstSendCount;
      return second.lastSentAtMs - first.lastSentAtMs;
    })
    .map((climber) => ({
      userId: climber.userId,
      displayName: climber.displayName,
      avatarUrl: climber.avatarUrl,
      sendCount: climber.distinctClimbUuids.size,
      lastSentAt: climber.lastSentAt,
    }));
}
