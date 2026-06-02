import { useEffect } from 'react';
import { Dimensions, StyleSheet, View, useColorScheme } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { useSessionScreen } from '../../providers/session-screen-provider';
import { GlassSurface } from '../GlassSurface';
import { SessionScreen } from './SessionScreen';
import { springs } from '../../theme/animations';

const SCREEN_HEIGHT = Dimensions.get('window').height;

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
        <View style={StyleSheet.absoluteFill}>
          <GlassSurface glassEffectStyle="regular" style={StyleSheet.absoluteFill} />
          <SessionScreen onClose={handleClose} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#000',
  },
});
