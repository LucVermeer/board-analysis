import { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { iosSystemColors } from '../theme/ios-colors';
import { useBluetoothConnectedStatus } from '../lib/ble/bluetooth-status-store';
import { brandColors, withAlpha } from '../theme/colors';
import { material } from '../theme/tokens';
import { useTheme } from '../providers/theme-provider';
import { GlassSurface } from './GlassSurface';
import { PressableSurface } from './PressableSurface';
import { useSessionScreen } from '../providers/session-screen-provider';
import { useQueue } from '../providers/queue-provider';
import { TAB_BAR_HEIGHT } from '../theme/layout';

// Re-exported for back-compat: layout consumers historically imported the
// tab-bar height from here. The source of truth now lives in theme/layout.
export { TAB_BAR_HEIGHT };

type TabIconName =
  | 'view-dashboard'
  | 'magnify'
  | 'record-circle-outline'
  | 'account'
  | 'bookmark-multiple-outline'
  | 'dots-horizontal';

const TAB_ICONS: Record<string, TabIconName> = {
  boards: 'view-dashboard',
  climbs: 'magnify',
  record: 'record-circle-outline',
  discover: 'bookmark-multiple-outline',
  profile: 'account',
};

const BLINK_MIN_OPACITY = 0.35;
const BLINK_DURATION_MS = 700;

const isAndroid = Platform.OS === 'android';

// Dark-tinted glass tab bar: a translucent dark tint over the Liquid Glass so the
// bar stays dark enough for the white/grey tab icons regardless of app theme,
// while letting more of the blurred content through than the original near-opaque
// tint — it no longer has to match the (now-removed) dark queue bar. Solid
// fallback for Reduce Transparency and the Android surface.
const TAB_BAR_DARK_TINT = 'rgba(12, 12, 12, 0.65)';
const TAB_BAR_DARK_SOLID = '#0C0C0C';
// Spotify tab tints on the dark bar: crisp white active, mid-grey inactive.
const TAB_BAR_INACTIVE_TINT = '#9A9A9A';

export default function BlurTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { systemColors } = useTheme();
  const isBluetoothConnected = useBluetoothConnectedStatus();
  const { isOpen: sessionScreenOpen, toggle: toggleSessionScreen } = useSessionScreen();
  const { sessionId } = useQueue();

  const activeTint = iosSystemColors.white;
  const inactiveTint = TAB_BAR_INACTIVE_TINT;
  const totalHeight = TAB_BAR_HEIGHT + insets.bottom;

  // The Record tab opacity-pulses when a session is alive but the user has
  // minimized the overlay — same ambient "still recording" cue as Strava.
  const sessionActive = sessionId !== null;
  const shouldBlink = sessionActive && !sessionScreenOpen;

  const blinkOpacity = useSharedValue(1);
  useEffect(() => {
    if (shouldBlink) {
      blinkOpacity.value = withRepeat(
        withTiming(BLINK_MIN_OPACITY, { duration: BLINK_DURATION_MS, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      blinkOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [shouldBlink, blinkOpacity]);

  const blinkStyle = useAnimatedStyle(() => ({ opacity: blinkOpacity.value }));

  const renderContent = () => (
    <View style={[styles.tabRow, { height: TAB_BAR_HEIGHT }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const isRecordTab = route.name === 'record';
        // Record is never a "navigated to" tab — instead it reflects the
        // session-screen open state. Other tabs use the router's focused state.
        const isFocused = isRecordTab ? sessionScreenOpen : state.index === index;

        // While blinking, paint the icon in the "live" colour so the pulse
        // reads as a status indicator, not a press-state flicker.
        const tintColor: string =
          isRecordTab && shouldBlink ? iosSystemColors.systemRed : isFocused ? activeTint : inactiveTint;

        const iconName = TAB_ICONS[route.name] ?? 'dots-horizontal';
        const showBluetoothDot = isRecordTab && isBluetoothConnected;

        const onPress = () => {
          if (isRecordTab) {
            toggleSessionScreen();
            return;
          }

          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <PressableSurface
            key={route.key}
            // No iOS press animation on tabs (matches the prior plain Pressable);
            // Android still gets a borderless ripple around the icon.
            feedback="none"
            rippleBorderless
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : undefined}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tabItem}
          >
            <View style={styles.iconContainer}>
              {/* Material 3 active-indicator pill behind the focused tab's icon
                  (Android only — iOS conveys focus through the tint alone). */}
              {isAndroid && isFocused && (
                <View
                  pointerEvents="none"
                  style={[styles.activeIndicator, { backgroundColor: withAlpha(activeTint, 0.16) }]}
                />
              )}
              {isRecordTab ? (
                <Animated.View style={blinkStyle}>
                  <MaterialCommunityIcons name={iconName} size={24} color={tintColor} />
                </Animated.View>
              ) : (
                <MaterialCommunityIcons name={iconName} size={24} color={tintColor} />
              )}
              {showBluetoothDot && <View style={styles.bluetoothDot} />}
            </View>
            <Text style={[styles.label, { color: tintColor }]} numberOfLines={1}>
              {label}
            </Text>
          </PressableSurface>
        );
      })}
    </View>
  );

  // iOS: a bottom-anchored Liquid Glass bar (GlassSurface resolves Liquid Glass
  // on iOS 26+, frosted blur below) spanning through the home-indicator inset.
  // Android: a solid Material navigation surface with elevation + a top divider
  // — Material doesn't use translucent/blurred bottom navigation.
  const androidSurfaceStyle = isAndroid
    ? {
        backgroundColor: TAB_BAR_DARK_SOLID,
        elevation: material.navBar.surfaceElevation,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: systemColors.separator,
      }
    : null;

  return (
    <View style={[styles.container, { height: totalHeight, paddingBottom: insets.bottom }, androidSurfaceStyle]}>
      {!isAndroid && (
        <GlassSurface
          glassEffectStyle="regular"
          tintColor={TAB_BAR_DARK_TINT}
          fallbackColor={TAB_BAR_DARK_SOLID}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      {renderContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  iconContainer: {
    position: 'relative',
  },
  // Centred on the 24px icon: width/height pulled from the Material nav tokens,
  // offset so the pill is symmetric around the icon.
  activeIndicator: {
    position: 'absolute',
    left: (24 - material.navBar.activeIndicatorWidth) / 2,
    top: (24 - material.navBar.activeIndicatorHeight) / 2,
    width: material.navBar.activeIndicatorWidth,
    height: material.navBar.activeIndicatorHeight,
    borderRadius: material.navBar.activeIndicatorRadius,
  },
  bluetoothDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: brandColors.success,
  },
  label: {
    fontSize: 10,
    marginTop: 2,
  },
});
