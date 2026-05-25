import * as SecureStore from 'expo-secure-store';
import type { ClimbFilters } from '../components/ClimbFilterSheet';

export type RecentFilter = {
  id: string;
  label: string;
  filters: ClimbFilters;
  searchText: string;
  timestamp: number;
};

const RECENT_FILTERS_KEY = 'boardsesh_recent_filters';
const MAX_ITEMS = 10;

export function getFilterKey(filters: ClimbFilters, searchText: string): string {
  const combined = { ...filters, name: searchText };
  return JSON.stringify(combined, Object.keys(combined).sort());
}

export async function getRecentFilters(): Promise<RecentFilter[]> {
  try {
    const value = await SecureStore.getItemAsync(RECENT_FILTERS_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

export async function addRecentFilter(label: string, filters: ClimbFilters, searchText: string): Promise<void> {
  try {
    const existing = await getRecentFilters();
    const filterKey = getFilterKey(filters, searchText);

    const deduplicated = existing.filter((entry) => getFilterKey(entry.filters, entry.searchText) !== filterKey);

    const newEntry: RecentFilter = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label,
      filters,
      searchText,
      timestamp: Date.now(),
    };

    const updated = [newEntry, ...deduplicated].slice(0, MAX_ITEMS);
    await SecureStore.setItemAsync(RECENT_FILTERS_KEY, JSON.stringify(updated));
  } catch {
    // Storage failure is non-critical
  }
}

export async function clearRecentFilters(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(RECENT_FILTERS_KEY);
  } catch {
    // Storage failure is non-critical
  }
}
