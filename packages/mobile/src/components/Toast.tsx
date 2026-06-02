import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Icon } from './Icon';
import type { IconName } from './icon-map';
import { brandColors, withAlpha } from '../theme/colors';
import { borderRadius, spacing } from '../theme/tokens';
import { useTheme } from '../providers/theme-provider';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export type ToastData = {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
};

type ToastProps = {
  toast: ToastData;
  onDismiss: (id: string) => void;
};

const VARIANT_CONFIG: Record<ToastVariant, { icon: IconName; color: string }> = {
  success: { icon: 'success', color: brandColors.success },
  error: { icon: 'error', color: brandColors.error },
  info: { icon: 'info', color: brandColors.primary },
  warning: { icon: 'warning', color: brandColors.warning },
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const insets = useSafeAreaInsets();
  const { systemColors, colorScheme } = useTheme();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const config = VARIANT_CONFIG[toast.variant];

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, onDismiss]);

  // Opaque themed pill keeps the toast legible over any content; the brand-hued
  // wash on top carries the variant cue. Bump the wash alpha in dark mode where
  // a 15% tint barely registers.
  const tintColor = withAlpha(config.color, colorScheme === 'dark' ? 0.24 : 0.15);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, { top: insets.top + spacing[2], backgroundColor: systemColors.secondaryBackground }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tintColor }]} />
      <Icon name={config.icon} size={18} color={config.color} />
      <Text variant="subheadline" color={config.color} style={styles.message} numberOfLines={2}>
        {toast.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    zIndex: 9999,
  },
  message: {
    flexShrink: 1,
  },
});
