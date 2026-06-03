import React from 'react';
import { Svg, Line } from 'react-native-svg';
import { useTheme } from '../../providers/theme-provider';

type AngleGlyphProps = {
  angle: number;
  size?: number;
};

/**
 * Tiny static (non-animated) board-angle icon for list rows.
 *
 * Mirrors the {@link AngleBoardDiagram} concept in miniature: a short dashed
 * vertical reference plus a solid board edge that pivots from the shared base
 * point, tilted `angle` degrees away from vertical (overhung). Purely
 * decorative — accessibility tools skip it, and the numeric angle is conveyed
 * by the row's own label.
 */
export function AngleGlyph({ angle, size = 22 }: AngleGlyphProps): React.JSX.Element {
  const { systemColors, brandColors } = useTheme();

  // Pivot near the bottom-left. Board angles run 0–70°; at 70° a centred pivot
  // with a long arm would push the board edge off the right of the box, so the
  // pivot sits left of centre and the arm is short enough that the worst-case
  // reach (sin(70°)·armLength) stays inside `size`.
  const pivotX = size * 0.32;
  const pivotY = size * 0.88;
  const armLength = size * 0.62;

  // The vertical reference points straight up from the pivot.
  const verticalEndY = pivotY - armLength;

  // Board edge: 0° = straight up (vertical wall), larger = tilted back. SVG y
  // grows downward, so subtracting the cos term moves the tip up the canvas.
  const radians = (angle * Math.PI) / 180;
  const boardEndX = pivotX + Math.sin(radians) * armLength;
  const boardEndY = pivotY - Math.cos(radians) * armLength;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Line
        x1={pivotX}
        y1={pivotY}
        x2={pivotX}
        y2={verticalEndY}
        stroke={systemColors.separator}
        strokeWidth={1}
        strokeDasharray="2 2"
        strokeLinecap="round"
      />
      <Line
        x1={pivotX}
        y1={pivotY}
        x2={boardEndX}
        y2={boardEndY}
        stroke={brandColors.tint}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}
