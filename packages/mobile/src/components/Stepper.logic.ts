// Pure, node-testable clamp shared by both platform Stepper files. Keeping it here
// means the iOS and Android components can't drift on "what value gets reported",
// and it can be unit-tested without mounting a native @expo/ui tree.

/** Clamp `value` into the inclusive [min, max] range before it's reported. */
export function clampStepperValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// The gap between the label and the folded-in value in the iOS Stepper's label.
// SwiftUI `Stepper(label:)` exposes only a single label string (no separate value
// slot), so the value is appended to the label and a few spaces stand in for the
// "value column" the old custom control had. Spaces are the only separator a plain
// string affords here; the exact readout is the on-device go/no-go called out in the
// PR (#3270). Named + tested so the format is one obvious place, not a magic literal.
const STEPPER_LABEL_VALUE_GAP = '   ';

/**
 * Compose the iOS Stepper's visible label by folding the current value onto the end
 * of the label ("Number of climbs   5"). Used only by Stepper.ios.tsx; kept here
 * (pure) so it's unit-tested without mounting a native SwiftUI tree.
 */
export function composeStepperLabel(label: string, value: number): string {
  return `${label}${STEPPER_LABEL_VALUE_GAP}${value}`;
}
