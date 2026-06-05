import { describe, it, expect } from 'vite-plus/test';
import { deriveIsDriver } from '@boardsesh/queue-runtime';

/**
 * Driver-state derivation for the queue-control-bar pivot
 * (docs/queue-control-bar-pivot.md). The same helper backs both
 * QueueContext and the queue-bridge-context — verify the rules here once.
 */
describe('deriveIsDriver', () => {
  it('is always true in solo (no active party session)', () => {
    // Solo has no driver concept; the local user implicitly drives the wall.
    expect(deriveIsDriver({ isPersistentSessionActive: false, participantId: null, driverParticipantId: null })).toBe(
      true,
    );
    expect(
      deriveIsDriver({
        isPersistentSessionActive: false,
        participantId: 'participant-1',
        // Even a stale driver id is irrelevant in solo — no party means no
        // remote driver could be holding the wall.
        driverParticipantId: 'someone-else',
      }),
    ).toBe(true);
  });

  it('is true in party when the local participantId matches driverParticipantId', () => {
    expect(
      deriveIsDriver({
        isPersistentSessionActive: true,
        participantId: 'participant-1',
        driverParticipantId: 'participant-1',
      }),
    ).toBe(true);
  });

  it('is false in party when someone else holds the driver role', () => {
    expect(
      deriveIsDriver({
        isPersistentSessionActive: true,
        participantId: 'participant-1',
        driverParticipantId: 'participant-2',
      }),
    ).toBe(false);
  });

  it('is false in party when the wall is unclaimed (driverParticipantId is null)', () => {
    // Brand-new party session, nobody has pressed the lightbulb yet. The
    // local user isn't the driver until they explicitly take control.
    expect(
      deriveIsDriver({
        isPersistentSessionActive: true,
        participantId: 'participant-1',
        driverParticipantId: null,
      }),
    ).toBe(false);
  });

  it('is false in party when the local participantId is null', () => {
    // Defensive: during the brief window between activating a session and the
    // joinSession response landing, participantId can momentarily be null.
    // Treat as "not driving" rather than coincidentally matching a null
    // driver id.
    expect(
      deriveIsDriver({
        isPersistentSessionActive: true,
        participantId: null,
        driverParticipantId: null,
      }),
    ).toBe(false);
    expect(
      deriveIsDriver({
        isPersistentSessionActive: true,
        participantId: null,
        driverParticipantId: 'participant-1',
      }),
    ).toBe(false);
  });

  it('handles authenticated-user participant ids (UUIDs) the same way as anonymous (connection ids)', () => {
    // The derivation is opaque to the format of the participantId. Just confirm
    // that any non-empty string flow works — the production code uses UUIDs
    // for authenticated users and connection ids for anonymous, but both look
    // the same to this function.
    expect(
      deriveIsDriver({
        isPersistentSessionActive: true,
        participantId: 'a1b2c3d4-e5f6-7890-1234-abcdef012345',
        driverParticipantId: 'a1b2c3d4-e5f6-7890-1234-abcdef012345',
      }),
    ).toBe(true);
  });
});
