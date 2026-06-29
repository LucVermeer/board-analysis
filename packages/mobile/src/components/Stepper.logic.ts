// Pure, node-testable helpers for the custom Stepper. Keeping the clamp and the
// hold-repeat timing here means the component stays declarative and these rules can
// be unit-tested without mounting a React tree.

/** Clamp `value` into the inclusive [min, max] range before it's reported. */
export function clampStepperValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Press-and-hold-to-repeat timing. A tap fires one step immediately; holding the
// −/+ button waits HOLD_INITIAL_DELAY_MS before the first repeat, then each repeat
// fires sooner (nextHoldDelay) until it floors at HOLD_MIN_DELAY_MS — the classic
// accelerating stepper feel UIStepper gives for free. Tuned so the 1–50 row is
// quick to drag without overshooting on a tap.
export const HOLD_INITIAL_DELAY_MS = 400;
export const HOLD_MIN_DELAY_MS = 50;
const HOLD_ACCELERATION = 0.8;

/** The next (shorter) repeat interval while a step button is held. */
export function nextHoldDelay(currentDelay: number): number {
  return Math.max(HOLD_MIN_DELAY_MS, Math.round(currentDelay * HOLD_ACCELERATION));
}
