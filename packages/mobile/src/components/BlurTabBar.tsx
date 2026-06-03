import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { iosSystemColors, iosDarkColors, iosLightColors } from '../theme/ios-colors';
import { useBluetoothConnectedStatus } from '../lib/ble/bluetooth-status-store';
import { brandColors } from '../theme/colors';
import { useTheme } from '../providers/theme-provider';
import { GlassSurface } from './GlassSurface';
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

export default function BlurTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const isBluetoothConnected = useBluetoothConnectedStatus();
  const { isOpen: sessionScreenOpen, toggle: toggleSessionScreen } = useSessionScreen();
  const { sessionId } = useQueue();

  const activeTint = iosSystemColors.systemBlue;
  const inactiveTint = isDark ? iosDarkColors.systemGray : iosLightColors.inactiveGray;
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
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : undefined}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tabItem}
          >
            <View style={styles.iconContainer}>
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
          </Pressable>
        );
      })}
    </View>
  );

  // Bottom-anchored, full-width Liquid Glass bar. GlassSurface resolves the
  // material per device (Liquid Glass on iOS 26+, frosted blur on older iOS,
  // solid on Android); the glass spans through the home-indicator inset.
  return (
    <View style={[styles.container, { height: totalHeight, paddingBottom: insets.bottom }]}>
      <GlassSurface glassEffectStyle="regular" style={StyleSheet.absoluteFill} pointerEvents="none" />
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
