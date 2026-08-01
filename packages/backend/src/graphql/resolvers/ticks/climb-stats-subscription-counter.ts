/**
 * Per-WebSocket cap for layout-wide climb-stats subscriptions. A normal app
 * holds one; eight leaves room for board switches and several browser tabs
 * sharing a connection while preventing a logged-in layout sweep from pinning
 * an unbounded number of Redis/local subscriber sets.
 */
const connectionCounts = new Map<string, number>();

export const MAX_CLIMB_STATS_SUBSCRIPTIONS_PER_CONNECTION = 8;

export function acquireClimbStatsSubscription(connectionId: string): void {
  const current = connectionCounts.get(connectionId) ?? 0;
  if (current >= MAX_CLIMB_STATS_SUBSCRIPTIONS_PER_CONNECTION) {
    throw new Error(
      `Too many climb-stats subscriptions on this connection (max ${MAX_CLIMB_STATS_SUBSCRIPTIONS_PER_CONNECTION})`,
    );
  }
  connectionCounts.set(connectionId, current + 1);
}

export function releaseClimbStatsSubscription(connectionId: string): void {
  const current = connectionCounts.get(connectionId) ?? 0;
  if (current <= 1) connectionCounts.delete(connectionId);
  else connectionCounts.set(connectionId, current - 1);
}

export function getClimbStatsSubscriptionCount(connectionId: string): number {
  return connectionCounts.get(connectionId) ?? 0;
}

export function resetClimbStatsSubscriptionCountsForTests(): void {
  connectionCounts.clear();
}
