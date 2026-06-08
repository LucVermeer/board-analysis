// Colour derivation for the docked Material queue control bar. The bar background
// is the current climb's grade colour, but raw grade colours don't all carry white
// text or stay distinct from the tab bar: white on the bright yellows/oranges (V0
// #FFD400 ≈ 1.3:1) is unreadable, and the darkest purples vanish into the dark tab
// bar. `deriveQueueBarBackground` applies a two-sided adaptive clamp — darken bright
// grades until white text clears WCAG AA, then lift the very darkest just enough to
// separate from the dark tab bar without breaking white legibility.

import { blendOpaque } from '../../theme/color-math';
import { contrastRatio } from '../grade/grade-chip-colors';

/** White name + grade text on the coloured bar (the whole point of darkening). */
export const QUEUE_BAR_TEXT_COLOR = '#FFFFFF';

/** AA target for white text on the bar background. */
const WHITE_AA_RATIO = 4.5;

/** Worst-case dark tab-bar surface (Material dark `elevatedSurface`). */
const DARK_TAB_BAR = '#2A2142';
/** Minimum separation between the bar and the dark tab bar. */
const TAB_SEPARATION_RATIO = 1.3;

/**
 * Derive an opaque bar background from a grade colour so white text stays legible
 * (≥4.5:1) across the whole V0–V17 range and the bar reads distinct from the dark
 * tab bar. Bright grades darken over black; the darkest grades lift over white.
 */
export function deriveQueueBarBackground(gradeColor: string): string {
  let background = gradeColor;

  // Step 1 — darken until white text clears AA (fires only for the bright grades).
  for (let blackAmount = 0; blackAmount <= 1; blackAmount += 0.01) {
    background = blendOpaque('#000000', gradeColor, blackAmount);
    if ((contrastRatio('#FFFFFF', background) ?? 0) >= WHITE_AA_RATIO) break;
  }

  // Step 2 — lift the darkest grades until they separate from the dark tab bar,
  // never sacrificing white legibility (fires only for V15–V17).
  for (let whiteAmount = 0; whiteAmount <= 1; whiteAmount += 0.01) {
    if ((contrastRatio(background, DARK_TAB_BAR) ?? Infinity) >= TAB_SEPARATION_RATIO) break;
    const lifted = blendOpaque('#FFFFFF', background, whiteAmount);
    if ((contrastRatio('#FFFFFF', lifted) ?? 0) < WHITE_AA_RATIO) break;
    background = lifted;
  }

  return background;
}
