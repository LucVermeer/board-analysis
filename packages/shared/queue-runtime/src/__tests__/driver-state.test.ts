import { describe, expect, it } from 'vitest';
import { deriveIsDriver } from '../driver-state';

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
