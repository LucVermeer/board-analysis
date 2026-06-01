// Mobile's KeyValueStorage adapter, backed by expo-secure-store. SecureStore
// is the established convention for app preferences (see board-store,
// recent-filter-store, party-profile storage); using it here keeps every
// user-scoped preference in the same backing store rather than scattering
// some across AsyncStorage.

import * as SecureStore from 'expo-secure-store';
import type { KeyValueStorage } from '@boardsesh/preferences';

export const secureStorePreferences: KeyValueStorage = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await SecureStore.getItemAsync(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // A malformed payload means a previous write was interrupted or a
      // foreign writer touched the key. Treat as absent so the caller falls
      // back to its default; the next write will overwrite the bad blob.
      return null;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  },
  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
};
