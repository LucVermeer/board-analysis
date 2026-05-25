import type { ClimbFilters } from './climb-filter-types';

export function getFilterKey(filters: ClimbFilters, searchText: string): string {
  const combined = { ...filters, name: searchText };
  return JSON.stringify(combined, Object.keys(combined).sort());
}
