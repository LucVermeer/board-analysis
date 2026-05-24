import type { ExpoConfig, ConfigContext } from 'expo/config';

const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '0195d3e5-7326-7251-b498-79b3cf7de62a';

function resolveDevMetadata(): {
  branchName: string | null;
  qaNotes: string | null;
  qaNotesFilePath: string | null;
} {
  const branchName = process.env.BOARDSESH_DEV_BRANCH_NAME ?? null;
  const qaNotes = process.env.BOARDSESH_DEV_QA_NOTES ?? null;
  const qaNotesFilePath = process.env.BOARDSESH_DEV_QA_NOTES_FILE ?? null;

  if (!branchName && !qaNotes) {
    return { branchName: null, qaNotes: null, qaNotesFilePath: null };
  }

  return { branchName, qaNotes, qaNotesFilePath };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const devMetadata = resolveDevMetadata();
  const hasDevMetadata = devMetadata.branchName || devMetadata.qaNotes || devMetadata.qaNotesFilePath;

  return {
    ...config,
    name: 'Boardsesh',
    slug: 'boardsesh',
    version: '2.0.0',
    scheme: 'com.boardsesh.app',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    },
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
      'expo-updates',
      'expo-web-browser',
      'react-native-ble-plx',
    ],
    extra: {
      ...config.extra,
      eas: {
        projectId: EAS_PROJECT_ID,
      },
      ...(hasDevMetadata
        ? {
            devMetadata: {
              branchName: devMetadata.branchName,
              qaNotes: devMetadata.qaNotes,
              qaNotesFilePath: devMetadata.qaNotesFilePath,
            },
          }
        : {}),
    },
  };
};
