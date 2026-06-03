import type { Grade } from '@boardsesh/shared-schema';
import type { GradeBound } from '@boardsesh/climb-filters';

type TFunc = (key: string, options?: Record<string, unknown>) => string;
type FormatGrade = (difficulty: string | null | undefined) => string | null;

/**
 * Human label for the grade pill in the search bar / sticky strip:
 * "Any grade" · "V6" · "V4–V8" · "V4+" · "Up to V8". Mirrors web's grade
 * summary so the two platforms read the same.
 */
export function formatGradePillLabel(
  bound: GradeBound,
  grades: readonly Grade[],
  formatGrade: FormatGrade,
  t: TFunc,
): string {
  const { minGradeId, maxGradeId } = bound;
  if (minGradeId == null && maxGradeId == null) return t('mobile.search.anyGrade');

  const label = (difficultyId: number): string => {
    const grade = grades.find((entry) => entry.difficultyId === difficultyId);
    return (grade ? (formatGrade(grade.name) ?? grade.name) : undefined) ?? '?';
  };

  if (minGradeId != null && maxGradeId != null) {
    if (minGradeId === maxGradeId) return label(minGradeId);
    return t('mobile.search.gradeRange', { min: label(minGradeId), max: label(maxGradeId) });
  }
  if (minGradeId != null) return t('mobile.search.gradeMin', { grade: label(minGradeId) });
  return t('mobile.search.gradeMax', { grade: label(maxGradeId as number) });
}
