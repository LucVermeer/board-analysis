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
// Stale entries are removed as a side effect so the next call is a clean miss.
export const consumeFreshOAuthPending = async (): Promise<OAuthPendingMarker | null> => {
  const stored = await getPreference<OAuthPendingMarker>(KEY);
  if (!stored) return null;
  await removePreference(KEY);
  if (Date.now() - stored.attempted_at > MAX_AGE_MS) return null;
  return stored;
};
