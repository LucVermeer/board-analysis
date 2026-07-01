import type { RuntimeSessionUser } from './session-events';

type RosterIdentity = Pick<RuntimeSessionUser, 'id' | 'userId'>;

/**
 * Collapse a session roster to one entry per human. Authenticated users dedupe
 * by their stable `userId`; anonymous users (no `userId`) fall back to their
 * per-connection `id` so genuinely distinct anonymous participants aren't
 * merged. Order is preserved and the first entry seen for each identity wins.
 *
 * Use this anywhere a human-facing crew list or count is derived from the
 * roster (peerCount, partyMode, presence avatars). The roster can briefly carry
 * more than one entry for the same person — e.g. a reconnect that arrives before
 * the previous connection's `UserLeft`, or a logged-in user whose socket
 * momentarily authenticated anonymously — and counting the raw length turns a
 * lone climber into a false "party".
 *
 * NOT for id-based lookups: keep the raw roster when you need to `find` a
 * participant by connection/participant `id`, since dedupe drops later entries.
 */
export function dedupeSessionUsers<TUser extends RosterIdentity>(users: readonly TUser[]): TUser[] {
  const seen = new Set<string>();
  const deduped: TUser[] = [];
  for (const user of users) {
    const key = user.userId ?? user.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(user);
  }
  return deduped;
}

/** Count distinct humans in a session roster (see {@link dedupeSessionUsers}). */
export function countDistinctSessionUsers(users: readonly RosterIdentity[]): number {
  const seen = new Set<string>();
  for (const user of users) {
    seen.add(user.userId ?? user.id);
  }
  return seen.size;
}
