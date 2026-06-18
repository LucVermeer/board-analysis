import { memo, useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '../Text';
import { Icon } from '../Icon';
import type { IconName } from '../icon-map';
import { useTheme } from '../../providers/theme-provider';
import { hapticSelection } from '../../lib/haptics';
import { borderRadius, spacing } from '../../theme/tokens';

type OnboardingTipBannerProps = {
  /** Already-translated tip copy; a string, or rich content (e.g. an inline icon). */
  text: ReactNode;
  /** Spoken label for the banner; required when `text` isn't a plain string. */
  accessibilityLabel?: string;
  /** Already-translated accessibility label for the close button. */
  dismissLabel: string;
  /** Hide the banner. */
  onDismiss: () => void;
  /** Optional whole-banner action (e.g. open the board sheet). */
  onPress?: () => void;
  /** Leading glyph; defaults to a lightbulb. */
  icon?: IconName;
  /** Layout override (margins) from the host surface. */
  style?: StyleProp<ViewStyle>;
};

/**
 * A single dismissible, one-line just-in-time tip. Used for the post-onboarding
 * Home reveal banner and the contextual feature tips (workout / crew / record).
 * No animation, so it's Reduce-Motion-safe by construction; the copy + close
 * button are separate accessibility elements. The host owns the "show once"
 * flag — this is purely presentational.
 */
function OnboardingTipBannerComponent({
  text,
  accessibilityLabel,
  dismissLabel,
  onDismiss,
  onPress,
  icon = 'lightbulb.fill',
  style,
}: OnboardingTipBannerProps) {
  const { brandColors, systemColors } = useTheme();
  // Fall back to the text when it's a plain string; rich content passes a label.
  const a11yLabel = accessibilityLabel ?? (typeof text === 'string' ? text : undefined);

  const handlePress = useCallback(() => {
    if (!onPress) return;
    hapticSelection();
    onPress();
  }, [onPress]);

  const body = (
    <>
      <Icon name={icon} size={20} color={brandColors.primary} />
      <Text variant="subheadline" color={systemColors.label} style={styles.text}>
        {text}
      </Text>
    </>
  );

  return (
    <View
      style={[
        styles.surface,
        { backgroundColor: `${brandColors.primary}14`, borderColor: `${brandColors.primary}33` },
        style,
      ]}
    >
      {onPress ? (
        <Pressable
          style={styles.tappable}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
        >
          {body}
        </Pressable>
      ) : (
        <View style={styles.tappable} accessible accessibilityLabel={a11yLabel}>
          {body}
        </View>
      )}
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        hitSlop={8}
        style={styles.close}
      >
        <Icon name="close" size={16} color={systemColors.secondaryLabel} />
      </Pressable>
    </View>
  );
}

export const OnboardingTipBanner = memo(OnboardingTipBannerComponent);

const styles = StyleSheet.create({
  surface: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tappable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  text: {
    flex: 1,
  },
  close: {
    padding: spacing[1],
  },
});
