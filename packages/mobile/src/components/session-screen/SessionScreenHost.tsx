import { useEffect } from 'react';
import { Dimensions, StyleSheet, View, useColorScheme } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { useSessionScreen } from '../../providers/session-screen-provider';
import { GlassSurface } from '../GlassSurface';
import { SessionScreen } from './SessionScreen';
import { springs } from '../../theme/animations';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_VELOCITY = 800;
const DISMISS_DISTANCE = SCREEN_HEIGHT * 0.25;

/**
 * Full-screen Strava-style overlay that hosts the Session screen. Mounted once
 * at the app root next to DrawerHostProvider; reads its open/close state from
 * SessionScreenContext. The background is a GlassSurface so the layered
 * Liquid-Glass language from PR #2457 (tab bar, persistent bar, sheets) keeps
 * reading as one system as the overlay rises.
 */
export function SessionScreenHost() {
  const { isOpen, close } = useSessionScreen();
  const colorScheme = useColorScheme();

  // translateY: 0 = fully presented, SCREEN_HEIGHT = fully dismissed below.
  const translateY = useSharedValue(SCREEN_HEIGHT);
  // mounted controls when the View is rendered at all — dismount after the
  // dismiss animation completes so the overlay doesn't intercept touches.
  const mounted = useSharedValue(false);

  useEffect(() => {
    if (isOpen) {
      mounted.value = true;
      translateY.value = withSpring(0, springs.gentle);
    } else if (mounted.value) {
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 240, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) mounted.value = false;
      });
    }
  }, [isOpen, translateY, mounted]);

  const handleClose = () => close();

  // Drag-down-to-dismiss on the whole overlay. PanGestureHandler activates on
  // downward motion only; small horizontal jitter or upward motion is ignored.
  const startY = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .activeOffsetY([10, 9999])
    .failOffsetY([-9999, -10])
    .onBegin(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const next = startY.value + event.translationY;
      // Only allow dragging downward from the rest position; rubber-band on overshoot up.
      translateY.value = Math.max(0, next);
    })
    .onEnd((event) => {
      const shouldDismiss = translateY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        runOnJS(handleClose)();
      } else {
        translateY.value = withSpring(0, springs.snappy);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => {
    // Fade a dim layer in proportionally as the sheet rises. Stays subtle —
    // the GlassSurface already provides separation; the backdrop just damps
    // the underlying UI so the tab bar doesn't compete for attention.
    const progress = 1 - translateY.value / SCREEN_HEIGHT;
    return {
      opacity: progress * 0.4,
    };
  });

  if (!isOpen && !mounted.value) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {isOpen ? <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} animated /> : null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <GestureDetector gesture={panGesture}>
          <View style={StyleSheet.absoluteFill}>
            <GlassSurface glassEffectStyle="regular" style={StyleSheet.absoluteFill} />
            <SessionScreen onClose={handleClose} />
          </View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#000',
  },
});
