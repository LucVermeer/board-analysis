import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useTheme } from '../../providers/theme-provider';
import { spacing } from '../../theme/tokens';

type SessionScreenHeaderProps = {
  /** Minimize handler (chevron-down). Absent in tab mode — switching tabs minimizes. */
  onClose?: () => void;
  sessionActive: boolean;
  /** When set, a share button floats at the trailing edge to invite climbers. */
  onShare?: () => void;
  /**
   * Show a short "Invite" label beside the share glyph to teach the affordance.
   * Set while the climber is solo; collapses to the icon alone once a friend
   * joins (a clear contextual label, the HIG-preferred alternative to a coachmark).
   */
  inviteHint?: boolean;
  /**
   * Swipe-down-to-dismiss gesture (the header doubles as the drag handle).
   * Absent in tab mode, where the header isn't draggable.
   */
  dragGesture?: PanGesture;
};

/**
 * Compact header strip for the session screen. Left: chevron-down to minimize
 * in overlay mode (omitted in tab mode, where switching tabs is the minimize).
 * Center: contextual title. Right: a share button to invite climbers while a
 * session is live. In overlay mode the whole strip is also a drag handle —
 * swipe it down to dismiss; tab mode renders the same row without the gesture.
 */
export function SessionScreenHeader({
  onClose,
  sessionActive,
  onShare,
  inviteHint,
  dragGesture,
}: SessionScreenHeaderProps) {
  const { t } = useTranslation('session');
  const { systemColors, brandColors } = useTheme();

  const title = sessionActive ? t('mobile.session.headerActive') : t('mobile.session.headerStart');

  const row = (
    <View style={styles.row}>
      {onClose ? (
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.session.minimize')}
          style={styles.iconButton}
        >
          <Icon name="chevron.down" size={26} color={systemColors.label} />
        </Pressable>
      ) : (
        <View style={styles.iconButton} />
      )}
      <Text variant="title3" color={systemColors.label} style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {onShare ? (
        <Pressable
          onPress={onShare}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.session.invite')}
          style={styles.shareButton}
        >
          {inviteHint ? (
            <Text variant="subheadline" color={brandColors.primary} style={styles.shareLabel}>
              {t('mobile.session.inviteAction')}
            </Text>
          ) : null}
          <Icon name="share" size={22} color={brandColors.primary} />
        </Pressable>
      ) : (
        <View style={styles.iconButton} />
      )}
    </View>
  );

  // Tab mode: no drag handle, render the row directly.
  if (!dragGesture) {
    return row;
  }

  return <GestureDetector gesture={dragGesture}>{row}</GestureDetector>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing[1],
    minWidth: 40,
    height: 40,
    paddingLeft: spacing[2],
  },
  shareLabel: {
    fontWeight: '600',
  },
});
