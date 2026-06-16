import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

// --- BoardBle native module ---

export type NativeBleScanEvent = {
  device: { deviceId: string; name: string };
  localName: string;
  rssi: number;
  /**
   * Advertised service UUIDs from the advertisement packet. Only present on
   * binaries new enough to scan unfiltered (the ones that also expose
   * `getConnectedDevice`); older binaries scan with a native UUID filter and
   * omit the field.
   */
  serviceUuids?: string[];
};

export type NativeBleDisconnectEvent = {
  deviceId: string;
};

export type NativeBleConnectedEvent = {
  deviceId: string;
  deviceName?: string;
};

export type NativeBleConnectedDevice = {
  deviceId: string;
  name?: string;
};

export type NativeBleConfigureBoardOptions = {
  boardName: string;
  layoutId: number;
  sizeId: number;
  apiLevel?: number;
  deviceName?: string;
  colorOverrides?: Record<string, string>;
};

type BoardBleNativeModule = {
  isAvailable(): Promise<{ available: boolean }>;
  /** An empty `services` array means "scan unfiltered" on newer binaries. */
  startScan(services?: string[]): Promise<void>;
  stopScan(): Promise<void>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  write(value: string): Promise<void>;
  cancelWrites(): Promise<void>;
  configureBoard(options: NativeBleConfigureBoardOptions): Promise<void>;
  /**
   * Returns the natively-connected board, or null. Only present on newer
   * binaries — its presence doubles as the feature gate for unfiltered
   * scanning, the `connected` event and connection adoption, so always check
   * `typeof getConnectedDevice === 'function'` before relying on any of them
   * (an OTA JS update can run against an older binary).
   */
  getConnectedDevice?(): Promise<NativeBleConnectedDevice | null>;
  addListener(event: 'scanResult', listener: (payload: NativeBleScanEvent) => void): EventSubscription;
  addListener(event: 'disconnected', listener: (payload: NativeBleDisconnectEvent) => void): EventSubscription;
  addListener(event: 'connected', listener: (payload: NativeBleConnectedEvent) => void): EventSubscription;
};

// requireOptionalNativeModule returns null in Expo Go or any binary without
// the module linked (Android, dev clients built before this module was added).
// Callers should check for null before invoking.
export const boardBleNative = requireOptionalNativeModule<BoardBleNativeModule>('BoardBle');

// --- LiveActivity native module ---

export type LiveActivityStartSessionOptions = {
  sessionId: string;
  serverUrl: string;
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  authToken?: string;
  wsUrl?: string;
  graphqlUrl?: string;
  widgetNavigationAllowed: boolean;
  isPartySession: boolean;
  /**
   * Bundled board-background webp file paths for the active board, resolved on
   * the JS side (expo-asset) and staged into the App Group so the iOS
   * ThumbnailFetcher can composite them behind the server's holds-only overlay —
   * keeping board art off the network. Ordered base layers (drawn first). iOS
   * only; the Android foreground service ignores it.
   */
  boardBackgroundPaths?: string[];
  /**
   * Localized strings for the Android foreground-service notification. Ignored
   * on iOS (ActivityKit builds its UI in Swift). Supplied so the ongoing
   * notification + its Previous/Next actions respect the app locale instead of
   * hardcoding English in Kotlin.
   */
  androidNotification?: {
    channelName: string;
    channelDescription: string;
    contentTitleFallback: string;
    previousLabel: string;
    nextLabel: string;
  };
};

export type LiveActivityQueueItem = {
  uuid: string;
  climbUuid: string;
  climbName: string;
  difficulty: string;
  angle: number;
  frames: string;
  setterUsername: string;
  mirrored: boolean;
};

export type LiveActivityUpdateOptions = {
  climbName: string;
  climbDifficulty: string;
  angle: number;
  currentIndex: number;
  totalClimbs: number;
  hasNext: boolean;
  hasPrevious: boolean;
  climbUuid: string;
  queue: LiveActivityQueueItem[];
  widgetNavigationAllowed: boolean;
  isPartySession: boolean;
};

export type LiveActivityClimbUpdateOptions = Omit<LiveActivityUpdateOptions, 'queue'>;

export type WidgetQueueNavigateEvent = {
  action: 'next' | 'previous';
  currentIndex: number;
  correlationId: string;
};

type LiveActivityNativeModule = {
  isAvailable(): Promise<{ available: boolean }>;
  startSession(options: LiveActivityStartSessionOptions): Promise<void>;
  endSession(): Promise<void>;
  updateActivity(options: LiveActivityUpdateOptions): Promise<void>;
  updateActivityClimb(options: LiveActivityClimbUpdateOptions): Promise<void>;
  addListener(event: 'queueNavigate', listener: (payload: WidgetQueueNavigateEvent) => void): EventSubscription;
};

export const liveActivityNative = requireOptionalNativeModule<LiveActivityNativeModule>('LiveActivity');

// --- SessionPresence native module (Android) ---

// The Android counterpart to the iOS LiveActivity module: a foreground service +
// ongoing media-style notification that keeps the BLE connection alive in the
// background and surfaces Previous/Next session controls. It deliberately
// mirrors the LiveActivity method names + the queueNavigate event shape so the
// JS seam (live-activity-plugin) can drive either platform through one selector.
// requireOptionalNativeModule returns null on iOS (where 'LiveActivity'/'BoardBle'
// are the live modules) and in Expo Go / pre-module builds.
type SessionPresenceNativeModule = {
  isAvailable(): Promise<{ available: boolean }>;
  startSession(options: LiveActivityStartSessionOptions): Promise<void>;
  endSession(): Promise<void>;
  updateActivity(options: LiveActivityUpdateOptions): Promise<void>;
  updateActivityClimb(options: LiveActivityClimbUpdateOptions): Promise<void>;
  addListener(event: 'queueNavigate', listener: (payload: WidgetQueueNavigateEvent) => void): EventSubscription;
};

export const sessionPresenceNative = requireOptionalNativeModule<SessionPresenceNativeModule>('SessionPresence');
