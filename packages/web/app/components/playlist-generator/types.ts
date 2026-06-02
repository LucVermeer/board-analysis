// Generator types + constants live in @boardsesh/playlist-generator so mobile
// and web can share the workout-planning algorithm. Functions are re-exported
// from ./generation-utils; this barrel exposes only the value/type surface to
// avoid duplicate exports through the package index.
export type {
  BaseGeneratorOptions,
  ClimbBias,
  EffortLevel,
  GeneratorGrade,
  GeneratorGradeScale,
  GeneratorOptions,
  GradeFocusOptions,
  LadderOptions,
  PlannedClimbSlot,
  PyramidOptions,
  VolumeOptions,
  WarmUpType,
  WorkoutType,
  WorkoutTypeInfo,
} from '@boardsesh/playlist-generator';

export {
  CLIMB_BIAS_OPTIONS,
  DEFAULT_GRADE_FOCUS_OPTIONS,
  DEFAULT_LADDER_OPTIONS,
  DEFAULT_PYRAMID_OPTIONS,
  DEFAULT_VOLUME_OPTIONS,
  EFFORT_LEVELS,
  WARM_UP_CONFIG,
  WARM_UP_OPTIONS,
  WORKOUT_TYPES,
} from '@boardsesh/playlist-generator';
