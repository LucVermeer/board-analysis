export type ClimbFilters = {
  minGrade?: number;
  maxGrade?: number;
  minAscents?: number;
  minRating?: number;
  sortBy: string;
  sortOrder: string;
};

export const DEFAULT_FILTERS: ClimbFilters = {
  sortBy: 'popular',
  sortOrder: 'desc',
};
