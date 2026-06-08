import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useTheme } from '../../providers/theme-provider';
import { hapticLight } from '../../lib/haptics';
import { spacing, borderRadius } from '../../theme/tokens';
import { timing } from '../../theme/animations';

const AUTO_DISMISS_MS = 10_000;

type ConnectionBannerProps = {
  visible: boolean;
  onReconnect: () => void;
  onDismiss: () => void;
};

function useSlideAnimation(
  visible: boolean,
  onHidden: () => void,
): { translateY: SharedValue<number>; bannerOpacity: SharedValue<number> } {
  const translateY = useSharedValue(-80);
  const bannerOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: timing.normal });
      bannerOpacity.value = withTiming(1, { duration: timing.normal });
    } else {
      translateY.value = withTiming(-80, { duration: timing.fast });
      bannerOpacity.value = withTiming(0, { duration: timing.fast }, (finished) => {
        if (finished) {
          runOnJS(onHidden)();
        }
      });
    }
  }, [visible, translateY, bannerOpacity, onHidden]);

  return { translateY, bannerOpacity };
}

export function ConnectionBanner({ visible, onReconnect, onDismiss }: ConnectionBannerProps) {
  const { t } = useTranslation('settings');
  const { systemColors, brandColors } = useTheme();
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the component mounted until the exit animation completes
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
    }
  }, [visible]);

  const handleHidden = useCallback(() => {
    setIsMounted(false);
  }, []);

  const { translateY, bannerOpacity } = useSlideAnimation(visible, handleHidden);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: bannerOpacity.value,
  }));

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    if (visible) {
      autoDismissTimer.current = setTimeout(() => {
        onDismiss();
      }, AUTO_DISMISS_MS);
    }

    return () => {
      if (autoDismissTimer.current) {
        clearTimeout(autoDismissTimer.current);
        autoDismissTimer.current = null;
      }
    };
  }, [visible, onDismiss]);

  const handleReconnect = useCallback(() => {
    hapticLight();
    onReconnect();
  }, [onReconnect]);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  if (!isMounted) return null;

  return (
    <Animated.View style={[styles.wrapper, animatedStyle]}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: `${brandColors.warning}1F`,
            borderColor: `${brandColors.warning}40`,
          },
        ]}
      >
        <Icon name="bluetooth.off" size={18} color={brandColors.warning} />

        <Text variant="subheadline" color={systemColors.label} style={styles.messageText} numberOfLines={1}>
          {t('ble.disconnected')}
        </Text>

        <Pressable onPress={handleReconnect} accessibilityRole="button" style={styles.reconnectButton}>
          <Text variant="subheadline" color={brandColors.primary} style={styles.reconnectLabel}>
            {t('ble.reconnect')}
          </Text>
        </Pressable>

        <Pressable onPress={handleDismiss} accessibilityRole="button" hitSlop={8}>
          <Icon name="close" size={16} color={systemColors.tertiaryLabel} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  messageText: {
    flex: 1,
    fontWeight: '500',
  },
  reconnectButton: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  reconnectLabel: {
    fontWeight: '600',
  },
});
