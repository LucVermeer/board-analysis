import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Icon } from './Icon';
import type { IconName } from './icon-map';
import { brandColors } from '../theme/colors';
import { borderRadius, spacing } from '../theme/tokens';

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

const VARIANT_CONFIG: Record<ToastVariant, { icon: IconName; color: string; backgroundColor: string }> = {
  success: { icon: 'success', color: brandColors.success, backgroundColor: 'rgba(107, 144, 128, 0.15)' },
  error: { icon: 'error', color: brandColors.error, backgroundColor: 'rgba(184, 82, 76, 0.15)' },
  info: { icon: 'info', color: brandColors.primary, backgroundColor: 'rgba(140, 74, 82, 0.15)' },
  warning: { icon: 'warning', color: brandColors.warning, backgroundColor: 'rgba(196, 148, 60, 0.15)' },
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const insets = useSafeAreaInsets();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const config = VARIANT_CONFIG[toast.variant];

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, { top: insets.top + spacing[2], backgroundColor: config.backgroundColor }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
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
    zIndex: 9999,
  },
  message: {
    flexShrink: 1,
  },
});
