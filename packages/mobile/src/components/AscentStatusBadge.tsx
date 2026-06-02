import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useOptionalBoardProvider } from '@boardsesh/board-react';
import { Icon } from './Icon';
import { iosSystemColors } from '../theme/ios-colors';
import { normalizeAscentStatus, pickHighestAscentStatus, type AscentStatusValue } from '../lib/ascent-status-utils';

type AscentStatusBadgeProps = {
  climbUuid: string;
  angle: number;
  /** Pass to scope to mirrored vs regular ticks on Tension/Decoy. Omit
   *  to consider both sides — the badge picks the highest status across them. */
  isMirror?: boolean;
};

/**
 * Reads the user's logbook (denormalised via `BoardProvider` → `useLogbook`)
 * and renders the highest-status badge for this climb at the given angle.
 * Returns null when the user has no recorded ticks at this angle, or when
 * not inside a `BoardProvider` (e.g. before auth is ready).
 */
const AscentStatusBadge = React.memo(function AscentStatusBadge({
  climbUuid,
  angle,
  isMirror,
}: AscentStatusBadgeProps) {
  const board = useOptionalBoardProvider();
  const status = useMemo<AscentStatusValue | null>(() => {
    if (!board) return null;
    const entries = board.logbook.filter(
      (entry) =>
        entry.climb_uuid === climbUuid &&
        entry.angle === angle &&
        (isMirror === undefined || entry.is_mirror === isMirror),
    );
    if (entries.length === 0) return null;
    return pickHighestAscentStatus(
      entries.map((entry) =>
        normalizeAscentStatus({ status: entry.status, isAscent: entry.is_ascent, tries: entry.tries }),
      ),
    );
  }, [board, climbUuid, angle, isMirror]);

  if (!status) return null;

  if (status === 'flash') {
    return (
      <View style={[styles.badge, styles.flashBadge]}>
        <Icon name="flash" size={10} color={iosSystemColors.black} />
      </View>
    );
  }

  if (status === 'send') {
    return (
      <View style={[styles.badge, styles.sentBadge]}>
        <Icon name="tick.outline" size={10} color={iosSystemColors.white} />
      </View>
    );
  }

  return (
    <View style={[styles.badge, styles.attemptedBadge]}>
      <Icon name="close" size={8} color={iosSystemColors.white} />
    </View>
  );
});

export { AscentStatusBadge };

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentBadge: {
    backgroundColor: iosSystemColors.systemGreen,
  },
  flashBadge: {
    backgroundColor: iosSystemColors.systemYellow,
  },
  attemptedBadge: {
    backgroundColor: iosSystemColors.systemOrange,
  },
});
