import { useEffect, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Snackbar } from 'react-native-paper';
import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Icon } from './Icon';
import type { IconName } from './icon-map';
import { brandColors, blendOpaque, withAlpha } from '../theme/colors';
import { borderRadius, spacing } from '../theme/tokens';
import { TAB_BAR_HEIGHT, TOOLBAR_RESERVE } from '../theme/layout';
import { isTabsRoute } from '../lib/route-segments';
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

/**
 * Toast routes to a Material 3 Paper Snackbar on the Material variant, and to the
 * existing Liquid-Glass/HIG pill on the Liquid Glass variant. The public prop API
 * is identical for both, so ToastProvider never changes.
 */
export function Toast({ toast, onDismiss }: ToastProps) {
  const { variant: uiVariant } = useTheme();
  return uiVariant === 'material' ? (
    <ToastMaterial toast={toast} onDismiss={onDismiss} />
  ) : (
    <ToastGlass toast={toast} onDismiss={onDismiss} />
  );
}

/**
 * Reserve the worst-case queue toolbar height on tab screens so a toast never
 * covers the current-climb controls; off tab screens it sits just above the safe
 * area. Shared by both variants — ToastProvider sits above QueueProvider, so this
 * must stay independent from queue context.
 */
function useToastBottomOffset() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  return isTabsRoute(segments)
    ? insets.bottom + TAB_BAR_HEIGHT + TOOLBAR_RESERVE + spacing[2]
    : insets.bottom + spacing[3];
}

function ToastMaterial({ toast, onDismiss }: ToastProps) {
  const { systemColors, colorScheme } = useTheme();
  const bottomOffset = useToastBottomOffset();
  const config = VARIANT_CONFIG[toast.variant];

  // Paper drives its own auto-dismiss timer off `duration` + `onDismiss`, so we
  // don't run a manual setTimeout on the Material path (it would double-fire).
  // The glass toast has no tappable affordance, so we omit Paper's trailing
  // icon-dismiss button to keep the same auto-dismiss-only interaction. Paper's
  // wrapper is pointerEvents="box-none", so taps outside the pill reach content
  // behind it — matching the glass path's absoluteFill/box-none wrapper.
  const wrapperStyle: ViewStyle = { bottom: bottomOffset };

  // Carry the same variant cue as the glass pill: an opaque brand-hued wash over
  // the surface (legible while floating over content) plus a leading icon and
  // brand-coloured label. Passing our own content node lets us own the icon and
  // text colour rather than inheriting Paper's inverse-surface text colour.
  const backgroundColor = blendOpaque(
    config.color,
    systemColors.secondaryBackground as string,
    colorScheme === 'dark' ? 0.24 : 0.15,
  );

  return (
    <Snackbar
      visible
      onDismiss={() => onDismiss(toast.id)}
      duration={toast.duration}
      wrapperStyle={wrapperStyle}
      style={{ backgroundColor }}
    >
      <View style={styles.materialContent} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <Icon name={config.icon} size={18} color={config.color} />
        <Text variant="subheadline" color={config.color} style={styles.message} numberOfLines={2}>
          {toast.message}
        </Text>
      </View>
    </Snackbar>
  );
}

// Liquid Glass / HIG toast — the original implementation, unchanged.
function ToastGlass({ toast, onDismiss }: ToastProps) {
  const { systemColors, colorScheme } = useTheme();
  const bottomOffset = useToastBottomOffset();
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
      style={[
        styles.container,
        {
          bottom: bottomOffset,
          backgroundColor: systemColors.secondaryBackground,
        },
      ]}
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
  materialContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
});
