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
  // decreaseLabel/increaseLabel are the per-button accessibility labels for the
  // Android −/+ controls. They're intentionally REQUIRED (not optional) even though
  // iOS ignores them — the native SwiftUI Stepper supplies its own adjustable trait
  // and announcement, so it doesn't need them. Requiring them guards against a silent
  // Android a11y regression: a call site can't ship an unlabelled stepper. The sole
  // consumer (GeneratorPickerCard) always passes translated values, so requiring them
  // costs nothing in practice.
  /** Accessibility label for the decrement control (Android −/+ buttons; unused on iOS). */
  decreaseLabel: string;
  /** Accessibility label for the increment control (Android −/+ buttons; unused on iOS). */
  increaseLabel: string;
};
