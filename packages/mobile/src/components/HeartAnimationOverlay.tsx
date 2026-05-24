import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { Icon } from './Icon';
import { iosSystemColors } from '../theme/ios-colors';

type HeartAnimationOverlayProps = {
  visible: boolean;
  onDismiss: () => void;
  size?: number;
};

const HeartAnimationOverlay = React.memo(function HeartAnimationOverlay({
  visible,
  onDismiss,
  size = 32,
}: HeartAnimationOverlayProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSequence(
        withSpring(1.3, { damping: 8, stiffness: 300 }),
        withSpring(1, { damping: 12, stiffness: 200 }),
      );
      opacity.value = withSequence(
        withTiming(1, { duration: 100 }),
        withDelay(600, withTiming(0, { duration: 500 }, (finished) => {
          if (finished) {
            runOnJS(onDismiss)();
          }
        })),
      );
    } else {
      scale.value = 0;
      opacity.value = 0;
    }
  }, [visible, scale, opacity, onDismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, animatedStyle]}>
      <Icon name="favorite.fill" size={size} color={iosSystemColors.white} />
    </Animated.View>
  );
});

export { HeartAnimationOverlay };

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
