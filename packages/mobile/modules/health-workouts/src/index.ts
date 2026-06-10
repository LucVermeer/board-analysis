import { requireOptionalNativeModule } from 'expo-modules-core';

export type SaveWorkoutOptions = {
  sessionId: string;
  startDate: string;
  endDate: string;
  totalSends: number;
  totalAttempts: number;
  hardestGrade?: string;
  boardType: string;
  lapTimestamps: string[];
};

export type HealthWorkoutsNativeModule = {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ granted: boolean }>;
  saveWorkout(options: SaveWorkoutOptions): Promise<{ workoutId: string }>;
};

// requireOptionalNativeModule returns null in Expo Go, on Android (this module
// is iOS-only), and in any binary built before the module was linked. Callers
// must check for null before invoking — see src/lib/integrations/apple-health.ts.
export const healthWorkoutsNative: HealthWorkoutsNativeModule | null =
  requireOptionalNativeModule<HealthWorkoutsNativeModule>('HealthWorkouts');
