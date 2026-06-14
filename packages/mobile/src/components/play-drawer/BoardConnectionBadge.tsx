// "Who's connected" badge — the board-presence holder shown next to the play
// drawer lightbulb. The holder IS the last sender, so identity comes from the
// live current climb (falling back to the holder record for a late joiner).
//
// States:
//   - free (no holder)        → renders nothing; the unlit lightbulb means "tap
//                               to take".
//   - held, logged-in         → the sender's avatar.
//   - held, anonymous         → a "?" avatar (Avatar renders "?" with no uri/name).
//   - held but idle (>15 min) → the avatar gains a small "?" overlay.
//
// The idle check is a single threshold re-evaluated about once a minute (no
// per-second ticking), matching the product decision to avoid a live countdown.

import { memo, useContext, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BoardPresenceCurrentContext } from '@boardsesh/board-presence-react';
import { Avatar } from '../Avatar';
import { Text } from '../Text';
import { iosSystemColors } from '../../theme/ios-colors';

/** Holder is "idle" once nothing has changed on the wall for this long. */
const IDLE_THRESHOLD_MS = 15 * 60 * 1000;
/** Re-evaluate the idle threshold about once a minute — no ticking seconds. */
const IDLE_RECHECK_MS = 60 * 1000;

function BoardConnectionBadgeComponent({ size = 24 }: { size?: number }) {
  // Read the context directly rather than via useBoardPresenceCurrent(), which
  // throws when no provider is in scope. gorhom portals the play drawer to a
  // modal host, so a consumer can render outside the provider subtree — degrade
  // to nothing instead of crashing the screen.
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

  // The current climb is the freshest identity (the holder is its sender); fall
  // back to the holder record for a late joiner whose feed hasn't backfilled.
  const displayName = currentClimb?.sentByDisplayName ?? holder.displayName ?? null;
  const avatarUrl = currentClimb?.sentByAvatarUrl ?? holder.avatarUrl ?? null;
  const lastSentAtIso = currentClimb?.sentAt ?? holder.lastSentAt ?? null;
  const lastSentAtMs = lastSentAtIso ? Date.parse(lastSentAtIso) : NaN;
  const isIdle = Number.isFinite(lastSentAtMs) && now - lastSentAtMs > IDLE_THRESHOLD_MS;

  const idleSize = Math.round(size * 0.5);

  return (
    <View style={styles.container}>
      <Avatar uri={avatarUrl} name={displayName} size={size} />
      {isIdle && (
        <View style={[styles.idleBadge, { width: idleSize, height: idleSize, borderRadius: idleSize / 2 }]}>
          <Text variant="caption2" color={iosSystemColors.white} style={styles.idleGlyph}>
            {'?'}
          </Text>
        </View>
      )}
    </View>
  );
}

export const BoardConnectionBadge = memo(BoardConnectionBadgeComponent);

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  idleBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    backgroundColor: iosSystemColors.systemGray,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: iosSystemColors.white,
  },
  idleGlyph: {
    fontWeight: '700',
  },
});
