import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import type { PartyProfile, PartyProfileStorage } from '@boardsesh/party-profile';

const PARTY_PROFILE_KEY = 'boardsesh_party_profile';

export const partyProfileStorage: PartyProfileStorage = {
  async get(): Promise<PartyProfile | null> {
    try {
      const raw = await SecureStore.getItemAsync(PARTY_PROFILE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { id?: unknown };
      if (typeof parsed.id !== 'string' || parsed.id.length === 0) return null;
      return { id: parsed.id };
    } catch {
      return null;
    }
  },
  async set(profile: PartyProfile): Promise<void> {
    await SecureStore.setItemAsync(PARTY_PROFILE_KEY, JSON.stringify(profile));
  },
};

// Synchronous get-or-create, backed by expo-secure-store's JSI sync API rather
// than the async one above. Exists solely for analytics-bootstrap.ts, which
// resolves the party-profile UUID at module-eval time so posthog-client.ts can
// bootstrap the PostHog SDK's anonymous id with it before the SDK's
// app-lifecycle autocapture fires — see analytics-bootstrap.ts for why that
// ordering matters. Reads and writes the same key as partyProfileStorage, so
// the two never disagree: this runs once at bundle-eval time, strictly before
// PartyProfileProvider's async effect can fire, so there's no write race
// between them. Never throws — a locked keychain or unavailable JSI just
// yields `null`, and the caller falls back to today's behavior (PostHog's own
// anonymous id).
export function getOrCreatePartyProfileIdSync(generateId: () => string = randomUUID): string | null {
  try {
    const raw = SecureStore.getItem(PARTY_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: unknown };
      if (typeof parsed.id === 'string' && parsed.id.length > 0) return parsed.id;
    }
    const created: PartyProfile = { id: generateId() };
    SecureStore.setItem(PARTY_PROFILE_KEY, JSON.stringify(created));
    return created.id;
  } catch {
    return null;
  }
}
