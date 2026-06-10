import { describe, expect, it } from 'vitest';
import { deriveIsDriver, derivePreviewOnly } from '../driver-state';

describe('deriveIsDriver', () => {
  it('treats solo mode as locally controlled', () => {
    expect(deriveIsDriver({ isPersistentSessionActive: false, participantId: null, driverParticipantId: null })).toBe(
      true,
    );
    expect(
      deriveIsDriver({
        isPersistentSessionActive: false,
        participantId: 'participant-1',
        driverParticipantId: 'participant-2',
      }),
    ).toBe(true);
  });

  it('matches party control by participant id', () => {
    expect(
      deriveIsDriver({
        isPersistentSessionActive: true,
        participantId: 'participant-1',
        driverParticipantId: 'participant-1',
      }),
    ).toBe(true);
  });

  it('does not treat unclaimed or mismatched party state as local control', () => {
    expect(
      deriveIsDriver({
        isPersistentSessionActive: true,
        participantId: 'participant-1',
        driverParticipantId: 'participant-2',
      }),
    ).toBe(false);
    expect(
      deriveIsDriver({
        isPersistentSessionActive: true,
        participantId: 'participant-1',
        driverParticipantId: null,
      }),
    ).toBe(false);
    expect(
      deriveIsDriver({
        isPersistentSessionActive: true,
        participantId: null,
        driverParticipantId: null,
      }),
    ).toBe(false);
  });
});

describe('derivePreviewOnly', () => {
  it('never gates without a session', () => {
    expect(
      derivePreviewOnly({
        isSessionActive: false,
        participantId: 'participant-1',
        driverParticipantId: 'participant-2',
        sessionUserCount: 3,
      }),
    ).toBe(false);
  });

  it('leaves a solo occupant in full control even with no driver claimed', () => {
    expect(
      derivePreviewOnly({
        isSessionActive: true,
        participantId: 'participant-1',
        driverParticipantId: null,
        sessionUserCount: 1,
      }),
    ).toBe(false);
  });

  it('leaves an unseeded roster (offline restore, JOIN unresolved) in full control', () => {
    expect(
      derivePreviewOnly({
        isSessionActive: true,
        participantId: null,
        driverParticipantId: null,
        sessionUserCount: 0,
      }),
    ).toBe(false);
  });

  it('gates a party with a released driver until someone takes control', () => {
    expect(
      derivePreviewOnly({
        isSessionActive: true,
        participantId: 'participant-1',
        driverParticipantId: null,
        sessionUserCount: 2,
      }),
    ).toBe(true);
  });

  it('does not gate the party driver', () => {
    expect(
      derivePreviewOnly({
        isSessionActive: true,
        participantId: 'participant-1',
        driverParticipantId: 'participant-1',
        sessionUserCount: 2,
      }),
    ).toBe(false);
  });

  it('gates party non-drivers and participants without an id', () => {
    expect(
      derivePreviewOnly({
        isSessionActive: true,
        participantId: 'participant-1',
        driverParticipantId: 'participant-2',
        sessionUserCount: 2,
      }),
    ).toBe(true);
    expect(
      derivePreviewOnly({
        isSessionActive: true,
        participantId: null,
        driverParticipantId: 'participant-2',
        sessionUserCount: 2,
      }),
    ).toBe(true);
  });
});
