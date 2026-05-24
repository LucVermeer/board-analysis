import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Boardsesh',
  slug: 'boardsesh',
  version: '2.0.0',
  scheme: 'com.boardsesh.app',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'com.boardsesh.app',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSBluetoothAlwaysUsageDescription:
        'Boardsesh uses Bluetooth to connect to your Kilter Board, Tension Board, or MoonBoard and light up climbing holds. No personal data is sent over Bluetooth.',
      NSBluetoothPeripheralUsageDescription:
        'Boardsesh uses Bluetooth to connect to your climbing board and control the LED holds.',
      NSLocationWhenInUseUsageDescription:
        'Boardsesh uses your location to find nearby boards to climb on and to discover nearby climbing sessions in Party Mode.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Boardsesh uses your location to find nearby boards to climb on and to discover nearby climbing sessions in Party Mode.',
      NSSupportsLiveActivities: true,
      UIBackgroundModes: ['bluetooth-central'],
    },
  },
  android: {
    package: 'com.boardsesh.app',
    permissions: ['BLUETOOTH_SCAN', 'BLUETOOTH_CONNECT', 'ACCESS_FINE_LOCATION'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    'expo-status-bar',
    'expo-web-browser',
  ],
});
