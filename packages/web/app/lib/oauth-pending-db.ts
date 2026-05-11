import { getPreference, setPreference, removePreference } from './user-preferences-db';

const KEY = 'oauth:pending';

// 5-minute TTL — anything older is treated as a stale marker from an abandoned
// OAuth round-trip. Long enough for slow providers, short enough that an
// unrelated re-login can't borrow the marker.
const MAX_AGE_MS = 5 * 60 * 1000;

export type OAuthPendingMarker = {
  provider: string;
  flow: 'web' | 'native';
  attempted_at: number;
};

export const setOAuthPending = async (marker: OAuthPendingMarker): Promise<void> => {
  await setPreference(KEY, marker);
};

// Returns the marker if it exists and is still fresh, otherwise null.
// Order: read → assess freshness from the in-memory value → best-effort delete →
// return. Doing the delete after the freshness check (and swallowing its errors)
// guarantees we never lose a fresh marker just because the delete leg fails —
// the Login Succeeded event for the OAuth round-trip is too valuable to drop on
// a transient IDB hiccup.
export const consumeFreshOAuthPending = async (): Promise<OAuthPendingMarker | null> => {
  const stored = await getPreference<OAuthPendingMarker>(KEY);
  if (!stored) return null;
  const isFresh = Date.now() - stored.attempted_at <= MAX_AGE_MS;
  try {
    await removePreference(KEY);
  } catch {
    // removePreference already swallows its own errors, but defend the
    // contract: this function must not throw out of consumers' .then chains.
  }
  return isFresh ? stored : null;
};
