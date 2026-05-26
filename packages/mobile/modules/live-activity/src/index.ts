import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

// --- BoardBle native module ---

export type NativeBleScanEvent = {
  device: { deviceId: string; name: string };
  localName: string;
  rssi: number;
};

export type NativeBleDisconnectEvent = {
  deviceId: string;
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
  startScan(services?: string[]): Promise<void>;
  stopScan(): Promise<void>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  write(value: string): Promise<void>;
  cancelWrites(): Promise<void>;
  configureBoard(options: NativeBleConfigureBoardOptions): Promise<void>;
  addListener(event: 'scanResult', listener: (payload: NativeBleScanEvent) => void): EventSubscription;
  addListener(event: 'disconnected', listener: (payload: NativeBleDisconnectEvent) => void): EventSubscription;
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
