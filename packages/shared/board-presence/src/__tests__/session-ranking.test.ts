import { describe, it, expect } from 'vitest';
import type { BoardPresenceClimb } from '@boardsesh/shared-schema';
import { rankSessionClimbers } from '../session-ranking';

const NOW = new Date('2026-07-15T18:00:00.000Z');

function makeClimb(overrides: Partial<BoardPresenceClimb> & { seq: number }): BoardPresenceClimb {
  const { seq, climbUuid, sentAt, ...rest } = overrides;
  return {
    climbUuid: climbUuid ?? `climb-${seq}`,
    sentAt: sentAt ?? NOW.toISOString(),
    seq,
    ...rest,
  };
}

describe('rankSessionClimbers', () => {
  it('returns an empty leaderboard for empty input', () => {
    expect(rankSessionClimbers([], { now: NOW })).toEqual([]);
  });

  it('filters out entries older than the session window', () => {
    const history: BoardPresenceClimb[] = [
      makeClimb({
        seq: 1,
        sentByUserId: 'user-in-window',
        sentByDisplayName: 'In Window',
        sentAt: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
      }),
      makeClimb({
        seq: 2,
        sentByUserId: 'user-out-of-window',
        sentByDisplayName: 'Out Of Window',
        sentAt: new Date(NOW.getTime() - 200 * 60_000).toISOString(),
      }),
    ];

    const ranked = rankSessionClimbers(history, { now: NOW, windowMinutes: 180 });

    expect(ranked).toHaveLength(1);
    expect(ranked[0].userId).toBe('user-in-window');
  });

  it('respects a custom windowMinutes', () => {
    const history: BoardPresenceClimb[] = [
      makeClimb({
        seq: 1,
        sentByUserId: 'user-1',
        sentByDisplayName: 'Climber One',
        sentAt: new Date(NOW.getTime() - 45 * 60_000).toISOString(),
      }),
    ];

    expect(rankSessionClimbers(history, { now: NOW, windowMinutes: 30 })).toEqual([]);
    expect(rankSessionClimbers(history, { now: NOW, windowMinutes: 60 })).toHaveLength(1);
  });

  it('counts distinct climbs, not total sends — relighting the same climb twice counts once', () => {
    const history: BoardPresenceClimb[] = [
      makeClimb({
        seq: 1,
        climbUuid: 'climb-a',
        sentByUserId: 'user-1',
        sentByDisplayName: 'Climber One',
        sentAt: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
      }),
      makeClimb({
        seq: 2,
        climbUuid: 'climb-a',
        sentByUserId: 'user-1',
        sentByDisplayName: 'Climber One',
        sentAt: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
      }),
    ];

    const ranked = rankSessionClimbers(history, { now: NOW });

    expect(ranked).toHaveLength(1);
    expect(ranked[0].sendCount).toBe(1);
  });

  it('ranks by distinct-climb count descending', () => {
    const history: BoardPresenceClimb[] = [
      makeClimb({ seq: 1, climbUuid: 'climb-a', sentByUserId: 'user-1', sentByDisplayName: 'Low Sender' }),
      makeClimb({ seq: 2, climbUuid: 'climb-a', sentByUserId: 'user-2', sentByDisplayName: 'High Sender' }),
      makeClimb({ seq: 3, climbUuid: 'climb-b', sentByUserId: 'user-2', sentByDisplayName: 'High Sender' }),
      makeClimb({ seq: 4, climbUuid: 'climb-c', sentByUserId: 'user-2', sentByDisplayName: 'High Sender' }),
    ];

    const ranked = rankSessionClimbers(history, { now: NOW });

    expect(ranked.map((climber) => climber.userId)).toEqual(['user-2', 'user-1']);
    expect(ranked[0].sendCount).toBe(3);
    expect(ranked[1].sendCount).toBe(1);
  });

  it('tie-breaks equal send counts by most recent sentAt descending', () => {
    const history: BoardPresenceClimb[] = [
      makeClimb({
        seq: 1,
        climbUuid: 'climb-a',
        sentByUserId: 'user-earlier',
        sentByDisplayName: 'Earlier',
        sentAt: new Date(NOW.getTime() - 90 * 60_000).toISOString(),
      }),
      makeClimb({
        seq: 2,
        climbUuid: 'climb-b',
        sentByUserId: 'user-later',
        sentByDisplayName: 'Later',
        sentAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
      }),
    ];

    const ranked = rankSessionClimbers(history, { now: NOW });

    expect(ranked.map((climber) => climber.userId)).toEqual(['user-later', 'user-earlier']);
  });

  it('groups anonymous entries (no userId) by display name', () => {
    const history: BoardPresenceClimb[] = [
      makeClimb({ seq: 1, climbUuid: 'climb-a', sentByDisplayName: 'Guest Climber' }),
      makeClimb({ seq: 2, climbUuid: 'climb-b', sentByDisplayName: 'Guest Climber' }),
    ];

    const ranked = rankSessionClimbers(history, { now: NOW });

    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ userId: null, displayName: 'Guest Climber', sendCount: 2 });
  });

  it('skips entries with neither sentByUserId nor sentByDisplayName', () => {
    const history: BoardPresenceClimb[] = [
      makeClimb({ seq: 1, climbUuid: 'climb-a' }),
      makeClimb({ seq: 2, climbUuid: 'climb-b', sentByUserId: 'user-1', sentByDisplayName: 'Real Climber' }),
    ];

    const ranked = rankSessionClimbers(history, { now: NOW });

    expect(ranked).toHaveLength(1);
    expect(ranked[0].userId).toBe('user-1');
  });

  it('carries avatarUrl through and defaults to null when absent', () => {
    const history: BoardPresenceClimb[] = [
      makeClimb({
        seq: 1,
        climbUuid: 'climb-a',
        sentByUserId: 'user-1',
        sentByDisplayName: 'Climber One',
        sentByAvatarUrl: 'https://example.com/avatar.png',
      }),
      makeClimb({ seq: 2, climbUuid: 'climb-b', sentByDisplayName: 'No Avatar' }),
    ];

    const ranked = rankSessionClimbers(history, { now: NOW });

    const withAvatar = ranked.find((climber) => climber.userId === 'user-1');
    const withoutAvatar = ranked.find((climber) => climber.displayName === 'No Avatar');

    expect(withAvatar?.avatarUrl).toBe('https://example.com/avatar.png');
    expect(withoutAvatar?.avatarUrl).toBeNull();
  });
});
