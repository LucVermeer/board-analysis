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
