import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { PressableAvatar } from '../PressableAvatar';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useTheme } from '../../providers/theme-provider';
import { iosSystemColors } from '../../theme/ios-colors';

/**
 * Corner status badge content:
 *  - `connected` → amber Bluetooth glyph: this climber is driving the wall over BLE right now.
 *  - `idle`      → grey "?": the holder hasn't changed the wall for a while.
 *  - `none`      → no badge (past climbs in the history feed; the lightbulb pip while connected).
 */
export type BoardDriverStatus = 'connected' | 'idle' | 'none';

type BoardDriverAvatarProps = {
  /** Sender's Boardsesh user id; null/undefined renders a non-interactive avatar. */
  userId?: string | null;
  uri?: string | null;
  name?: string | null;
  size?: number;
  status?: BoardDriverStatus;
  /** Overrides the default "View {name}'s profile" press label with driver context. */
  accessibilityLabel?: string;
};

/**
 * A climber rendered as the board's BLE driver: a (pressable) avatar with a
 * Bluetooth status glyph tucked into the top-right corner. The single visual
 * atom behind the play-drawer on-wall banner, the lightbulb holder pip and the
 * board-sheet hero / history rows.
 *
 * Presentational only — the parent decides whether to render it at all (a free
 * wall renders nothing) and which `status` to pass. The badge is amber to match
 * the board-presence vocabulary the sheet and drawer already speak; a neutral
 * disc backing keeps the glyph legible in both schemes (white-on-amber fails the
 * dark-mode `warning` tint).
 */
function BoardDriverAvatarComponent({
  userId,
  uri,
  name,
  size = 24,
  status = 'connected',
  accessibilityLabel,
}: BoardDriverAvatarProps) {
  const { brandColors, systemColors } = useTheme();
  const badgeSize = Math.round(size * 0.5);
  const glyphSize = Math.max(8, Math.round(badgeSize * 0.72));

  return (
    <View style={styles.container}>
      <PressableAvatar userId={userId} uri={uri} name={name} size={size} accessibilityLabel={accessibilityLabel} />
      {status !== 'none' ? (
        <View
          // Decorative: the avatar's own label already carries identity + driver context.
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              backgroundColor: systemColors.secondaryBackground,
              borderColor: systemColors.background,
            },
          ]}
        >
          {status === 'idle' ? (
            <Text
              variant="caption2"
              color={iosSystemColors.systemGray}
              style={[styles.idleGlyph, { fontSize: glyphSize, lineHeight: glyphSize }]}
            >
              {'?'}
            </Text>
          ) : (
            <Icon name="bluetooth.connected" size={glyphSize} color={brandColors.warning} />
          )}
        </View>
      ) : null}
    </View>
  );
}

export const BoardDriverAvatar = memo(BoardDriverAvatarComponent);

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  idleGlyph: {
    fontWeight: '700',
  },
});
