// Pure helpers extracted from InlineGradePicker so the auto-scroll math
// can be unit-tested without spinning up the React renderer.

export type ChipLayout = { x: number; width: number };

export type ComputeFocusOffsetInput = {
  viewportWidth: number;
  // Layout for the chip we want to center, if known from onLayout. Falls
  // back to (index * approxChipWidth, approxChipWidth) when null — the
  // approximation lets us still scroll on the very first paint, before the
  // chip has dispatched its own onLayout event.
  chipLayout: ChipLayout | null;
  index: number;
  approxChipWidth: number;
};

/**
 * Compute the ScrollView x offset that centers the focus chip horizontally
 * in the viewport. Returns null when the viewport width hasn't been
 * measured yet (auto-scroll can't be meaningful without it).
 */
export function computeFocusOffset({
  viewportWidth,
  chipLayout,
  index,
  approxChipWidth,
}: ComputeFocusOffsetInput): number | null {
  if (viewportWidth <= 0) return null;
  const chipX = chipLayout?.x ?? index * approxChipWidth;
  const chipWidth = chipLayout?.width ?? approxChipWidth;
  return Math.max(0, chipX - viewportWidth / 2 + chipWidth / 2);
}
