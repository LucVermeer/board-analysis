/**
 * Pure coordinate-field parsing for the gym editor, kept out of the component so
 * it's unit-testable without loading React Native.
 */

export const LATITUDE_RANGE = { min: -90, max: 90 } as const;
export const LONGITUDE_RANGE = { min: -180, max: 180 } as const;

/**
 * Parse a coordinate text field. A blank field is a deliberate clear (`null`, no
 * error). Otherwise the text must be a finite number within [min, max]; a
 * decimal comma — common on es/fr keyboards, where `Number('48,85')` is `NaN` —
 * is normalized to a dot first. Any non-empty, unparseable, or out-of-range text
 * is an error so the form can block submit; otherwise a typo would send `null`
 * and silently wipe the gym's saved location.
 */
export function parseCoordinate(text: string, min: number, max: number): { value: number | null; error: boolean } {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { value: null, error: false };
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return { value: null, error: true };
  return { value: parsed, error: false };
}
