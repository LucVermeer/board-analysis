import { Platform } from 'react-native';
import {
  liveActivityNative,
  sessionPresenceNative,
  type LiveActivityStartSessionOptions,
  type LiveActivityUpdateOptions,
  type LiveActivityClimbUpdateOptions,
  type WidgetQueueNavigateEvent,
} from '../../../modules/live-activity/src/index';

// Platform-agnostic wrapper around the "session presence" native surface:
// iOS ActivityKit (LiveActivity module) or the Android foreground service
// (SessionPresence module). Both modules expose the SAME method names and the
// SAME queueNavigate event shape, so a single Platform-keyed selector routes
// every call. Each platform sees exactly one non-null module; the other is null
// (and so is everything in Expo Go / a preview build predating the modules), in
// which case every method is a safe no-op.
const sessionModule =
  Platform.OS === 'ios' ? liveActivityNative : Platform.OS === 'android' ? sessionPresenceNative : null;

export async function isLiveActivityAvailable(): Promise<boolean> {
  if (!sessionModule) return false;
  try {
    const result = await sessionModule.isAvailable();
    return result.available;
  } catch {
    return false;
  }
}

export async function startLiveActivitySession(options: LiveActivityStartSessionOptions): Promise<void> {
  if (!sessionModule) return;
  await sessionModule.startSession(options);
}

export async function endLiveActivitySession(): Promise<void> {
  if (!sessionModule) return;
  await sessionModule.endSession();
}

export async function updateLiveActivity(options: LiveActivityUpdateOptions): Promise<void> {
  if (!sessionModule) return;
  await sessionModule.updateActivity(options);
}

export async function updateLiveActivityClimb(options: LiveActivityClimbUpdateOptions): Promise<void> {
  if (!sessionModule) return;
  await sessionModule.updateActivityClimb(options);
}

export function addWidgetQueueNavigateListener(callback: (event: WidgetQueueNavigateEvent) => void): () => void {
  if (!sessionModule) {
    return () => {};
  }
  const subscription = sessionModule.addListener('queueNavigate', callback);
  return () => subscription.remove();
}

export type { WidgetQueueNavigateEvent };
