import { describe, it, expect } from 'vitest';
import { V_GRADE_COLORS, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { contrastRatio } from '../../grade/grade-chip-colors';
import { deriveQueueBarBackground, QUEUE_BAR_TEXT_COLOR } from '../queue-bar-colors';

const HEX = /^#[0-9a-f]{6}$/i;
const allGradeColors = [...Object.values(V_GRADE_COLORS), DEFAULT_GRADE_COLOR];

describe('deriveQueueBarBackground', () => {
  it('returns an opaque 6-digit hex for every grade', () => {
    for (const gradeColor of allGradeColors) {
      expect(deriveQueueBarBackground(gradeColor)).toMatch(HEX);
    }
  });

  it('keeps white text legible (>= 4.5:1) across V0–V17 and the gray default', () => {
    for (const gradeColor of allGradeColors) {
      const background = deriveQueueBarBackground(gradeColor);
      const ratio = contrastRatio(QUEUE_BAR_TEXT_COLOR, background) ?? 0;
      expect(ratio, `white on bar derived from ${gradeColor} (${background})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('separates the darkest grades from the dark tab bar', () => {
    // V17 is the worst case — raw it is near-invisible against the dark tab surface.
    const v17Background = deriveQueueBarBackground(V_GRADE_COLORS.V17);
    expect(contrastRatio(v17Background, '#2A2142') ?? 0).toBeGreaterThanOrEqual(1.3);
  });

  it('also stays distinct from the white (light-mode) tab bar across the range', () => {
    // The lift step anchors on the dark tab surface, but the white-text clamp means
    // every derived background also separates comfortably from a white tab bar —
    // guards the light path against a future palette change.
    const whiteTabBar = '#FFFFFF'; // materialSurfaces.light.elevatedSurface
    for (const gradeColor of allGradeColors) {
      const background = deriveQueueBarBackground(gradeColor);
      expect(
        contrastRatio(background, whiteTabBar) ?? 0,
        `bar from ${gradeColor} (${background}) vs white tab bar`,
      ).toBeGreaterThanOrEqual(1.3);
    }
  });

  it('darkens bright grades (white fails on the raw colour, passes on the bar)', () => {
    const rawYellow = V_GRADE_COLORS.V0;
    expect(contrastRatio('#FFFFFF', rawYellow) ?? 0).toBeLessThan(4.5);
    expect(contrastRatio('#FFFFFF', deriveQueueBarBackground(rawYellow)) ?? 0).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves mid/dark grades that already pass essentially untouched', () => {
    // V8 raspberry already clears white AA, so step 1 should not darken it.
    expect(deriveQueueBarBackground(V_GRADE_COLORS.V8).toLowerCase()).toBe(V_GRADE_COLORS.V8.toLowerCase());
  });
});
