import type { Grade } from '@boardsesh/shared-schema';

export function getGradeName(difficultyId: number, grades: Grade[]): string {
  const grade = grades.find((gradeEntry) => gradeEntry.difficultyId === difficultyId);
  return grade?.name ?? `#${difficultyId}`;
}
