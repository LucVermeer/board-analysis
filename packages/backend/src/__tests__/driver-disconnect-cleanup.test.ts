/**
 * Tests for the room manager's driver-cleanup-on-disconnect path
 * (docs/queue-control-bar-pivot.md Phase 2). When the participant currently
 * holding the wall driver role leaves the session — either via explicit
 * `leaveSession` or via the grace-timer eviction after a transient
 * disconnect — the driver is cleared from Redis and `DriverChanged{null}`
 * is broadcast so peers' Queue Control Bar UI flips out of the
 * "{name} is driving" state.
 *
 * The clear-and-broadcast happens through the private
 * `releaseDriverIfMatches` helper. We exercise it through the public
 * `clearSessionDriverIf` interface (which the helper wraps) and through a
 * cast for the broadcast assertion, since the room-manager singleton is
 * stateful and a full disconnect simulation pulls in too many collaborators
 * for a focused unit test.
 *
 * Covered scenarios:
 *  - clearSessionDriverIf returns true when the caller matches; false
 *    otherwise (race guard against a stale release from a non-driver).
 *  - releaseDriverIfMatches publishes DriverChanged{null} exactly once
 *    when the departing participant was the driver.
 *  - releaseDriverIfMatches publishes nothing when a non-driver leaves
 *    (UserLeft fires separately in production).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { roomManager } from '../services/room-manager';
import { pubsub } from '../pubsub/index';

// `releaseDriverIfMatches` is private at the TypeScript level (compile-time
// access modifier) but not at runtime. Cast through unknown so the test can
// invoke it directly — it's the unit of work we want to assert.
type DriverCleanupHook = (sessionId: string, participantId: string) => Promise<void>;
const releaseDriverIfMatches = (
  roomManager as unknown as { releaseDriverIfMatches: DriverCleanupHook }
).releaseDriverIfMatches.bind(roomManager);

let publishSpy: ReturnType<typeof vi.spyOn>;

describe('room manager driver cleanup on disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Spy on the singleton pubsub directly rather than module-mocking — the
    // room manager grabs the `pubsub` reference at import time, so a module
    // mock can race the singleton instantiation; spying on the existing
    // method avoids that ordering hazard.
    publishSpy = vi.spyOn(pubsub, 'publishSessionEvent').mockImplementation(() => {});
    // Reset the singleton's in-memory state so each test starts clean. We're
    // running without a Redis-backed distributed state here, so the
    // in-memory shadow alone backs the driver getter/setter.
    roomManager.reset();
  });

  afterEach(() => {
    publishSpy.mockRestore();
    roomManager.reset();
  });

  it('clearSessionDriverIf clears the driver only when the participantId matches', async () => {
    await roomManager.setSessionDriverAndReturnPrevious('session-a', 'participant-driver');
    // Sanity check: driver is set.
    expect(await roomManager.getSessionDriverParticipantId('session-a')).toBe('participant-driver');

    // Non-matching: no clear, returns false.
    const nonMatchResult = await roomManager.clearSessionDriverIf('session-a', 'participant-other');
    expect(nonMatchResult).toBe(false);
    expect(await roomManager.getSessionDriverParticipantId('session-a')).toBe('participant-driver');

    // Matching: clear, returns true.
    const matchResult = await roomManager.clearSessionDriverIf('session-a', 'participant-driver');
    expect(matchResult).toBe(true);
    expect(await roomManager.getSessionDriverParticipantId('session-a')).toBeNull();
  });

  it('releaseDriverIfMatches publishes DriverChanged{null} when the departing participant was the driver', async () => {
    await roomManager.setSessionDriverAndReturnPrevious('session-a', 'participant-driver');
    publishSpy.mockClear();

    await releaseDriverIfMatches('session-a', 'participant-driver');

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalledWith('session-a', {
      __typename: 'DriverChanged',
      driverParticipantId: null,
    });
    // And the driver state is actually cleared.
    expect(await roomManager.getSessionDriverParticipantId('session-a')).toBeNull();
  });

  it('releaseDriverIfMatches does NOT publish when a non-driver participant leaves', async () => {
    // Driver is participant-A. Participant-B's departure must not fire
    // DriverChanged — that would falsely surface "wall unclaimed" to peers
    // while A is still happily driving.
    await roomManager.setSessionDriverAndReturnPrevious('session-a', 'participant-A');
    publishSpy.mockClear();

    await releaseDriverIfMatches('session-a', 'participant-B');

    expect(publishSpy).not.toHaveBeenCalled();
    // Driver stays.
    expect(await roomManager.getSessionDriverParticipantId('session-a')).toBe('participant-A');
  });

  it('releaseDriverIfMatches is a no-op when no driver is set', async () => {
    // Brand-new session, nobody has pressed the lightbulb. A leaver here
    // should not generate a spurious DriverChanged.
    publishSpy.mockClear();

    await releaseDriverIfMatches('session-new', 'participant-1');

    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('successive driver replacements through setSessionDriverAndReturnPrevious chain the previous values atomically', async () => {
    // Models the takeControl yank flow in single-instance mode. The atomic
    // swap returns the prior holder so the resolver can decide whether to
    // publish DriverChanged (only on transitions).
    const first = await roomManager.setSessionDriverAndReturnPrevious('session-a', 'driver-1');
    expect(first).toBeNull();

    const second = await roomManager.setSessionDriverAndReturnPrevious('session-a', 'driver-2');
    expect(second).toBe('driver-1');

    const third = await roomManager.setSessionDriverAndReturnPrevious('session-a', 'driver-2');
    expect(third).toBe('driver-2'); // Self-reclaim: previous equals new.

    expect(await roomManager.getSessionDriverParticipantId('session-a')).toBe('driver-2');
  });
});
