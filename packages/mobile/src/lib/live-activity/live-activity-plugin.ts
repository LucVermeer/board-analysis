import { Platform } from 'react-native';
import {
  liveActivityNative,
  type LiveActivityStartSessionOptions,
  type LiveActivityUpdateOptions,
  type LiveActivityClimbUpdateOptions,
  type WidgetQueueNavigateEvent,
} from '../../../modules/live-activity/src/index';

// Thin wrapper around the native LiveActivity Expo Module. All methods are
// no-ops (or return safe defaults) when the module is unavailable — on
// Android, in Expo Go, or in a preview build that predates the module.

export async function isLiveActivityAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !liveActivityNative) return false;
  try {
    const result = await liveActivityNative.isAvailable();
    return result.available;
  } catch {
    return false;
  }
}

export async function startLiveActivitySession(options: LiveActivityStartSessionOptions): Promise<void> {
  if (Platform.OS !== 'ios' || !liveActivityNative) return;
  await liveActivityNative.startSession(options);
}

export async function endLiveActivitySession(): Promise<void> {
  if (Platform.OS !== 'ios' || !liveActivityNative) return;
  await liveActivityNative.endSession();
}

export async function updateLiveActivity(options: LiveActivityUpdateOptions): Promise<void> {
  if (Platform.OS !== 'ios' || !liveActivityNative) return;
  await liveActivityNative.updateActivity(options);
}

export async function updateLiveActivityClimb(options: LiveActivityClimbUpdateOptions): Promise<void> {
  if (Platform.OS !== 'ios' || !liveActivityNative) return;
  await liveActivityNative.updateActivityClimb(options);
}

export function addWidgetQueueNavigateListener(callback: (event: WidgetQueueNavigateEvent) => void): () => void {
  if (Platform.OS !== 'ios' || !liveActivityNative) {
    return () => {};
  }
  const subscription = liveActivityNative.addListener('queueNavigate', callback);
  return () => subscription.remove();
}

export type { WidgetQueueNavigateEvent };
