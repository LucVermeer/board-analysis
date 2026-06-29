// Shared props for the platform-split Stepper. The implementation is split across
// Stepper.ios.tsx (native @expo/ui SwiftUI Stepper) and Stepper.android.tsx (the
// custom −/+ pill — Jetpack Compose has no Stepper). The split keeps each platform's
// @expo/ui native tree — which resolves native views at module load — off the other
// platform's bundle. The public API is identical to the previous react-native
// implementation, so every consumer (GeneratorPickerCard) is unchanged.

export type StepperProps = {
  /** Primary line on the left of the row. */
  label: string;
  /** Current value. */
  value: number;
  /** Minimum allowed value (inclusive). */
  min: number;
  /** Maximum allowed value (inclusive). */
  max: number;
  /** Fired with the next (clamped) value when the stepper changes. */
  onChange: (nextValue: number) => void;
  /** Accessibility label for the decrement control (used by the Android −/+ buttons). */
  decreaseLabel: string;
  /** Accessibility label for the increment control (used by the Android −/+ buttons). */
  increaseLabel: string;
};
