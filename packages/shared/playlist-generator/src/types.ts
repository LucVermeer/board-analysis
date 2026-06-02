// Playlist Generator Types and Constants
// Pure TS, no React. Web and mobile both consume from here.

export type WorkoutType = 'volume' | 'pyramid' | 'ladder' | 'gradeFocus';

export type WarmUpType = 'standard' | 'extended' | 'none';

export type EffortLevel = 'moderate' | 'challenging' | 'veryDifficult' | 'maxEffort';

export type ClimbBias = 'unfamiliar' | 'attempted' | 'any';

export type BaseGeneratorOptions = {
  warmUp: WarmUpType;
  targetGrade: number;
  climbBias: ClimbBias;
  minAscents: number;
  minRating: number;
  onlyTallClimbs: boolean;
};

export type VolumeOptions = {
  type: 'volume';
  mainSetClimbs: number;
  mainSetVariability: number;
} & BaseGeneratorOptions;

export type PyramidOptions = {
  type: 'pyramid';
  numberOfSteps: number;
  climbsPerStep: number;
} & BaseGeneratorOptions;

export type LadderOptions = {
  type: 'ladder';
  numberOfSteps: number;
  climbsPerStep: number;
} & BaseGeneratorOptions;

export type GradeFocusOptions = {
  type: 'gradeFocus';
  numberOfClimbs: number;
} & BaseGeneratorOptions;

export type GeneratorOptions = VolumeOptions | PyramidOptions | LadderOptions | GradeFocusOptions;

export type WorkoutTypeInfo = {
  type: WorkoutType;
  name: string;
  description: string;
  icon: 'volume' | 'pyramid' | 'ladder' | 'focus';
};

export const WORKOUT_TYPES: WorkoutTypeInfo[] = [
  { type: 'volume', name: 'Volume', description: 'Generate a high-volume workout.', icon: 'volume' },
  { type: 'pyramid', name: 'Pyramid', description: 'Work up to a max grade and back down again.', icon: 'pyramid' },
  { type: 'ladder', name: 'Ladder', description: 'Work up through the grades in steps.', icon: 'ladder' },
  { type: 'gradeFocus', name: 'Grade Focus', description: 'Pick a grade and go!', icon: 'focus' },
];

export const WARM_UP_OPTIONS: { value: WarmUpType; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'extended', label: 'Extended' },
  { value: 'none', label: 'None' },
];

export const EFFORT_LEVELS: { value: EffortLevel; label: string }[] = [
  { value: 'moderate', label: 'Moderate' },
  { value: 'challenging', label: 'Challenging' },
  { value: 'veryDifficult', label: 'Very Difficult' },
  { value: 'maxEffort', label: 'Max Effort' },
];

export const CLIMB_BIAS_OPTIONS: { value: ClimbBias; label: string }[] = [
  { value: 'unfamiliar', label: 'Unfamiliar' },
  { value: 'attempted', label: 'Attempted' },
  { value: 'any', label: 'Any' },
];

export const DEFAULT_VOLUME_OPTIONS: Omit<VolumeOptions, 'targetGrade'> = {
  type: 'volume',
  warmUp: 'standard',
  mainSetClimbs: 20,
  mainSetVariability: 0,
  climbBias: 'unfamiliar',
  minAscents: 5,
  minRating: 2,
  onlyTallClimbs: false,
};

export const DEFAULT_PYRAMID_OPTIONS: Omit<PyramidOptions, 'targetGrade'> = {
  type: 'pyramid',
  warmUp: 'standard',
  numberOfSteps: 5,
  climbsPerStep: 1,
  climbBias: 'unfamiliar',
  minAscents: 5,
  minRating: 2,
  onlyTallClimbs: false,
};

export const DEFAULT_LADDER_OPTIONS: Omit<LadderOptions, 'targetGrade'> = {
  type: 'ladder',
  warmUp: 'standard',
  numberOfSteps: 5,
  climbsPerStep: 2,
  climbBias: 'unfamiliar',
  minAscents: 5,
  minRating: 2,
  onlyTallClimbs: false,
};

export const DEFAULT_GRADE_FOCUS_OPTIONS: Omit<GradeFocusOptions, 'targetGrade'> = {
  type: 'gradeFocus',
  warmUp: 'standard',
  numberOfClimbs: 15,
  climbBias: 'unfamiliar',
  minAscents: 5,
  minRating: 2,
  onlyTallClimbs: false,
};

export const WARM_UP_CONFIG = {
  standard: { grades: 4, climbsPerGrade: 1 },
  extended: { grades: 6, climbsPerGrade: 2 },
  none: { grades: 0, climbsPerGrade: 0 },
};

export type PlannedClimbSlot = {
  grade: number;
  section: 'warmUp' | 'increasing' | 'peak' | 'decreasing' | 'main';
  index: number;
};

// Minimal grade scale shape the generator needs. Matches the rows returned by
// `getGradesForBoard` from @boardsesh/board-config (a wider type with the extra
// fields is also assignable).
export type GeneratorGrade = { difficulty_id: number };
export type GeneratorGradeScale = readonly GeneratorGrade[];
