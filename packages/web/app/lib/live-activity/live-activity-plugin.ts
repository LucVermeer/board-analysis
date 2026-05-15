import { isNativeApp, getPlatform } from '../ble/capacitor-utils';

type LiveActivityStartOptions = {
  sessionId: string;
  serverUrl: string;
  wsUrl?: string;
  /**
   * Fully-qualified HTTP GraphQL endpoint on the backend (e.g.
   * `https://ws.boardsesh.com/graphql`). The native plugin POSTs the
   * `registerActivityPushToken` mutation here. We pass an explicit URL because
   * `serverUrl` is the web origin (`https://www.boardsesh.com`), which has no
   * `/graphql` route and would 404.
   *
   * Required-but-nullable on purpose: every caller must consciously decide what
   * to put here. Allowing the key to be omitted entirely would let a future
   * caller silently re-introduce the wrong-host registration bug.
   */
  graphqlUrl: string | undefined;
  authToken?: string;
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
};

type LiveActivityUpdateOptions = {
  climbName: string;
  climbDifficulty: string;
  angle: number;
  currentIndex: number;
  totalClimbs: number;
  hasNext: boolean;
  hasPrevious: boolean;
  climbUuid: string;
  queue: Array<{
    uuid: string;
    climbUuid: string;
    climbName: string;
    difficulty: string;
    angle: number;
    frames: string;
    setterUsername: string;
    mirrored: boolean;
  }>;
};

/** Lightweight update options for climb navigation (no queue array). */
type LiveActivityClimbUpdateOptions = {
  climbName: string;
  climbDifficulty: string;
  angle: number;
  currentIndex: number;
  totalClimbs: number;
  hasNext: boolean;
  hasPrevious: boolean;
  climbUuid: string;
};

type LiveActivityPlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  startSession(options: LiveActivityStartOptions): Promise<void>;
  endSession(): Promise<void>;
  updateActivity(options: LiveActivityUpdateOptions): Promise<void>;
  /** Lightweight climb-only update — no queue serialization. */
  updateActivityClimb(options: LiveActivityClimbUpdateOptions): Promise<void>;
};

function getPlugin(): LiveActivityPlugin | null {
  if (!isNativeApp() || getPlatform() !== 'ios') return null;
  const plugins = window.Capacitor?.Plugins;
  if (!plugins) return null;
  return (plugins.LiveActivity as LiveActivityPlugin | undefined) ?? null;
}

export async function isLiveActivityAvailable(): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) return false;
  try {
    const { available } = await plugin.isAvailable();
    return available;
  } catch {
    return false;
  }
}

export async function startLiveActivitySession(options: LiveActivityStartOptions): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  try {
    await plugin.startSession(options);
  } catch (e) {
    console.warn('[LiveActivity] Failed to start session:', e);
  }
}

export async function endLiveActivitySession(): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  try {
    await plugin.endSession();
  } catch (e) {
    console.warn('[LiveActivity] Failed to end session:', e);
  }
}

export async function updateLiveActivity(options: LiveActivityUpdateOptions): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  try {
    await plugin.updateActivity(options);
  } catch (e) {
    console.warn('[LiveActivity] Failed to update activity:', e);
  }
}

/** Lightweight climb-only update — skips queue serialization across the bridge. */
export async function updateLiveActivityClimb(options: LiveActivityClimbUpdateOptions): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  try {
    await plugin.updateActivityClimb(options);
  } catch (e) {
    console.warn('[LiveActivity] Failed to update activity climb:', e);
  }
}

export type { LiveActivityStartOptions, LiveActivityUpdateOptions, LiveActivityClimbUpdateOptions, LiveActivityPlugin };
