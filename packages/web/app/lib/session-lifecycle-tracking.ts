import { track } from '@/app/lib/analytics';

export type SessionEndedReason = 'user_left' | 'tab_closed' | 'idle' | 'server_disconnect';

type SessionLifecycleRecord = {
  sessionId: string;
  startedAt: number;
  peerCount: number;
  climbsAttempted: number;
  emitted: boolean;
};

// Module-level singleton — survives unmount/remount cycles so a session
// joined via cookie that briefly tears down its provider mid-route doesn't
// lose its start time.
const sessionsBySessionId = new Map<string, SessionLifecycleRecord>();

export function registerSessionStart(sessionId: string): void {
  if (!sessionId) return;
  const existing = sessionsBySessionId.get(sessionId);
  if (existing) {
    existing.emitted = false;
    return;
  }
  sessionsBySessionId.set(sessionId, {
    sessionId,
    startedAt: Date.now(),
    peerCount: 0,
    climbsAttempted: 0,
    emitted: false,
  });
}

export function updateSessionPeerCount(sessionId: string, peerCount: number): void {
  const record = sessionsBySessionId.get(sessionId);
  if (!record) return;
  if (peerCount > record.peerCount) record.peerCount = peerCount;
}

export function incrementSessionClimbsAttempted(sessionId: string): void {
  const record = sessionsBySessionId.get(sessionId);
  if (!record) return;
  record.climbsAttempted += 1;
}

export function emitSessionEnded(sessionId: string, endedBy: SessionEndedReason): void {
  if (!sessionId) return;
  const record = sessionsBySessionId.get(sessionId);
  if (!record || record.emitted) return;
  record.emitted = true;

  const durationSec = Math.max(0, Math.round((Date.now() - record.startedAt) / 1000));
  track('Session Ended', {
    sessionId,
    durationSec,
    peerCount: record.peerCount,
    climbsAttempted: record.climbsAttempted,
    endedBy,
  });

  sessionsBySessionId.delete(sessionId);
}

export function getActiveTrackedSessionIds(): string[] {
  return Array.from(sessionsBySessionId.keys()).filter((id) => {
    const record = sessionsBySessionId.get(id);
    return !!record && !record.emitted;
  });
}
