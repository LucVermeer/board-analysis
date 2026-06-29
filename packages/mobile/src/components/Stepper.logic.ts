// Pure, node-testable clamp shared by both platform Stepper files. Keeping it here
// means the iOS and Android components can't drift on "what value gets reported",
// and it can be unit-tested without mounting a native @expo/ui tree.

/** Clamp `value` into the inclusive [min, max] range before it's reported. */
export function clampStepperValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
