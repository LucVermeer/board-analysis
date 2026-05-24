import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Icon } from './Icon';
import { iosSystemColors } from '../theme/ios-colors';

type AscentStatusBadgeProps = {
  userAscents: number | null | undefined;
  userAttempts: number | null | undefined;
};

const AscentStatusBadge = React.memo(function AscentStatusBadge({
  userAscents,
  userAttempts,
}: AscentStatusBadgeProps) {
  if (userAscents && userAscents > 0) {
    return (
      <View style={[styles.badge, styles.sentBadge]}>
        <Icon name="tick.outline" size={10} color={iosSystemColors.white} />
      </View>
    );
  }

  if (userAttempts && userAttempts > 0) {
    return (
      <View style={[styles.badge, styles.attemptedBadge]}>
        <Icon name="close" size={8} color={iosSystemColors.white} />
      </View>
    );
  }

  return null;
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
  attemptedBadge: {
    // iOS systemOrange (#FF9500) — not in iosSystemColors yet
    backgroundColor: '#FF9500',
  },
});
