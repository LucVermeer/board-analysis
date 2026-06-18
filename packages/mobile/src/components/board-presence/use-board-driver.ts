import { useContext, useEffect, useState } from 'react';
import { BoardPresenceCurrentContext } from '@boardsesh/board-presence-react';

/** Holder is "idle" once nothing has changed on the wall for this long. */
const IDLE_THRESHOLD_MS = 15 * 60 * 1000;
/** Re-evaluate the idle threshold about once a minute — no ticking seconds. */
const IDLE_RECHECK_MS = 60 * 1000;

export type BoardDriver = {
  /** Null for an anonymous holder (renders a non-pressable "?" avatar). */
  userId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** True once the wall hasn't changed for IDLE_THRESHOLD_MS. */
  isIdle: boolean;
};

/**
 * Resolves the board's current BLE driver from board presence: identity comes
 * from the freshest current climb, falling back to the holder record for a late
 * joiner whose feed hasn't backfilled. Returns null when the wall is free.
 *
 * Reads the context directly (non-throwing) rather than via
 * `useBoardPresenceCurrent()`, which throws with no provider in scope — gorhom
 * portals the play drawer to a modal host, so a consumer can render outside the
 * provider subtree; degrade to "no driver" instead of crashing.
 */
export function useBoardDriver(): BoardDriver | null {
  const current = useContext(BoardPresenceCurrentContext);
  const holder = current?.holder ?? null;
  const currentClimb = current?.currentClimb ?? null;
  const [now, setNow] = useState(() => Date.now());

  const held = holder !== null;
  useEffect(() => {
    if (!held) return;
    const interval = setInterval(() => setNow(Date.now()), IDLE_RECHECK_MS);
    return () => clearInterval(interval);
  }, [held]);

  if (!holder) return null;

  const lastSentAtIso = currentClimb?.sentAt ?? holder.lastSentAt ?? null;
  const lastSentAtMs = lastSentAtIso ? Date.parse(lastSentAtIso) : NaN;
  const isIdle = Number.isFinite(lastSentAtMs) && now - lastSentAtMs > IDLE_THRESHOLD_MS;

  return {
    userId: currentClimb?.sentByUserId ?? holder.userId ?? null,
    displayName: currentClimb?.sentByDisplayName ?? holder.displayName ?? null,
    avatarUrl: currentClimb?.sentByAvatarUrl ?? holder.avatarUrl ?? null,
    isIdle,
  };
}
