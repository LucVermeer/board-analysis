// Non-secret typed key-value store backed by AsyncStorage — the React Native
// community standard for non-encrypted persistent preferences. Use this for
// UI preferences, last-selected values, feature gates, etc.
//
// **Use `expo-secure-store` instead** for auth tokens, refresh tokens, and
// anything else that should be encrypted at rest. SecureStore is hardware-
// backed on iOS (Keychain) and Android (Keystore) and has a 2 KB per-value
// limit. AsyncStorage has no encryption and a larger per-value limit.
//
// Web's analogue is `packages/web/app/lib/user-preferences-db.ts`
// (IndexedDB-backed). This wrapper exposes a comparable JSON-typed API so
// the two platforms can drift less.

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Read a JSON-serialized preference. Returns null when the key is missing, the
 *  stored payload fails to parse, or the store itself can't be read. */
export async function getPreference<T>(key: string): Promise<T | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(key);
  } catch {
    // AsyncStorage.getItem can REJECT (not just resolve null) when the OS denies
    // the read — iOS denies the backing-file read on a background launch before
    // first unlock ("Failed to get values for keys"). Treat an unreadable store as
    // "no value" so a locked read falls back to the caller's default instead of
    // floating an unhandled rejection into error tracking (#3610). Single
    // chokepoint: every preference consumer is protected without its own catch.
    return null;
  }
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Write a JSON-serializable preference. Overwrites any existing value. */
export async function setPreference<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

/** Remove a preference. No-op when the key is absent. */
export async function removePreference(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
