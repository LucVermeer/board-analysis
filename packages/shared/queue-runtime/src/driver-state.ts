/**
 * Wall-driver derivation shared by web and mobile.
 *
 * Session driver ids are stable session participant ids. They are not
 * necessarily database user ids and should never be compared to a connection id
 * or feed participant user id without first mapping through the session roster.
 */
export function deriveIsDriver(args: {
  isPersistentSessionActive: boolean;
  participantId: string | null;
  driverParticipantId: string | null;
}): boolean {
  if (!args.isPersistentSessionActive) return true;
  return args.participantId !== null && args.driverParticipantId === args.participantId;
}

/**
 * Whether queue mutations should be gated to a local preview instead of
 * touching the shared session queue.
 *
 * Preview-only is a party concept: it requires at least one OTHER live
 * participant. A solo occupant always keeps full control of their own queue —
 * including a roster of 0, which happens before the JOIN resolves (e.g. an
 * offline cold-start restore that never reaches the server). The flip side of
 * that choice: a joiner whose JOIN hasn't resolved yet can mutate the party
 * queue for the sub-second window before the roster seeds.
 *
 * In a roster of 2+, a released driver (driverParticipantId null) leaves
 * everyone preview-only until someone takes wall control.
 */
export function derivePreviewOnly(args: {
  isSessionActive: boolean;
  participantId: string | null;
  driverParticipantId: string | null;
  /** Live roster size, including self. */
  sessionUserCount: number;
}): boolean {
  if (!args.isSessionActive) return false;
  if (args.sessionUserCount <= 1) return false;
  return !deriveIsDriver({
    isPersistentSessionActive: true,
    participantId: args.participantId,
    driverParticipantId: args.driverParticipantId,
  });
}
