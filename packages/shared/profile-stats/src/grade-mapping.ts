import { BOULDER_GRADES } from '@boardsesh/board-config';
import { type GradeDisplayFormat } from '@boardsesh/play-view';

// Maps difficulty IDs to V-grades (e.g. 16 → "V3", 17 → "V3"). Multiple Font
// grades collapse into the same V-grade, which is what we want for chart
// aggregation and display labels.
export const difficultyMapping: Record<number, string> = Object.fromEntries(
  BOULDER_GRADES.map((g) => [g.difficulty_id, g.v_grade]),
);

// Font grade mapping: difficulty_id → uppercase Font grade (e.g. 16 → "6A").
const fontGradeDifficultyMapping: Record<number, string> = Object.fromEntries(
  BOULDER_GRADES.map((g) => [g.difficulty_id, g.font_grade.toUpperCase()]),
);

/** Difficulty-id → grade-label mapping for the requested display format. */
export const getDifficultyMapping = (format: GradeDisplayFormat): Record<number, string> => {
  return format === 'font' ? fontGradeDifficultyMapping : difficultyMapping;
};

// Reverse mapping from grade string → numeric difficulty, for sorting.
const buildGradeOrder = (mapping: Record<number, string>): Map<string, number> => {
  const order = new Map<string, number>();
  for (const [numStr, grade] of Object.entries(mapping)) {
    const num = parseInt(numStr, 10);
    // For grades that map to the same string (e.g. V0 from 10, 11, 12), keep
    // the lowest number.
    if (!order.has(grade) || num < (order.get(grade) ?? Infinity)) {
      order.set(grade, num);
    }
  }
  return order;
};

const vGradeOrder = buildGradeOrder(difficultyMapping);
const fontGradeOrderMap = buildGradeOrder(fontGradeDifficultyMapping);

/** Sort grade strings by their numeric difficulty value. */
export const sortGrades = (grades: string[], format: GradeDisplayFormat): string[] => {
  const gradeOrder = format === 'font' ? fontGradeOrderMap : vGradeOrder;
  return [...grades].sort((a, b) => {
    const orderA = gradeOrder.get(a) ?? 999;
    const orderB = gradeOrder.get(b) ?? 999;
    return orderA - orderB;
  });
};
