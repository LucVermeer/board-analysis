import { describe, expect, it } from 'vitest';
import { countDistinctSessionUsers, dedupeSessionUsers } from '../session-roster';

type Roster = { id: string; userId?: string | null };

describe('session-roster dedupe', () => {
  it('collapses multiple entries for one authenticated user by userId', () => {
    // The exact production shape: one logged-in person whose reconnects landed
    // as separate connection-keyed entries, all carrying the same userId.
    const roster: Roster[] = [
      { id: 'conn-1', userId: 'user-A' },
      { id: 'conn-2', userId: 'user-A' },
      { id: 'conn-3', userId: 'user-A' },
    ];
    expect(countDistinctSessionUsers(roster)).toBe(1);
    expect(dedupeSessionUsers(roster)).toEqual([{ id: 'conn-1', userId: 'user-A' }]);
  });

  it('keeps distinct anonymous participants separate via their connection id', () => {
    const roster: Roster[] = [{ id: 'anon-1', userId: null }, { id: 'anon-2', userId: null }, { id: 'anon-3' }];
    expect(countDistinctSessionUsers(roster)).toBe(3);
    expect(dedupeSessionUsers(roster)).toHaveLength(3);
  });

  it('counts a real mixed party once per human', () => {
    const roster: Roster[] = [
      { id: 'user-A', userId: 'user-A' },
      { id: 'conn-x', userId: 'user-A' }, // duplicate of user-A
      { id: 'user-B', userId: 'user-B' },
      { id: 'anon-1', userId: null },
    ];
    expect(countDistinctSessionUsers(roster)).toBe(3);
    expect(dedupeSessionUsers(roster).map((user) => user.id)).toEqual(['user-A', 'user-B', 'anon-1']);
  });

  it('preserves order and returns the first entry seen for each identity', () => {
    // First-in-array wins, regardless of what the connection ids imply.
    const roster: Roster[] = [
      { id: 'conn-1', userId: 'user-A' },
      { id: 'conn-2', userId: 'user-A' },
    ];
    expect(dedupeSessionUsers(roster)).toEqual([{ id: 'conn-1', userId: 'user-A' }]);
  });

  it('handles the empty roster', () => {
    expect(countDistinctSessionUsers([])).toBe(0);
    expect(dedupeSessionUsers([])).toEqual([]);
  });
});
