/**
 * Sortable rank for a grade label so chart X-axes read easy to hard. Extracts
 * the V-number when present, else maps a font grade; unknown labels sort last.
 */
export function gradeSortValue(gradeLabel: string): number {
  const vMatch = gradeLabel.match(/V(\d+)/i);
  if (vMatch) return Number(vMatch[1]);
  const fontMatch = gradeLabel.match(/(\d)([abc])(\+?)/i);
  if (fontMatch) {
    const number = Number(fontMatch[1]);
    const letter = fontMatch[2].toLowerCase().charCodeAt(0) - 96;
    return 100 + number * 10 + letter * 2 + (fontMatch[3] ? 1 : 0);
  }
  return Number.MAX_SAFE_INTEGER;
}
