/**
 * Wall-driver derivation for the queue-control-bar pivot
 * (docs/queue-control-bar-pivot.md).
 *
 * Encapsulates the rules:
 *  - Solo (no active party session): the local user always drives the wall —
 *    there's nothing else with a connection to it. Returns true regardless of
 *    the other inputs.
 *  - Party: the local user drives when their stable participant id matches
 *    the session's `driverParticipantId`. The comparison MUST use participant
 *    id (which is the same convention `SessionUser.id` follows) — not the
 *    connection-level `clientId`, because authenticated users have a database
 *    UUID as their participantId while their clientId stays as the WS
 *    connection id.
 *
 * Pulled out as a pure function so the same derivation backs both
 * `QueueContext` and `queue-bridge-context`, and so the rule is unit-testable
 * in isolation.
 */
export function deriveIsDriver(args: {
  isPersistentSessionActive: boolean;
  participantId: string | null;
  driverParticipantId: string | null;
}): boolean {
  if (!args.isPersistentSessionActive) return true;
  return args.participantId !== null && args.driverParticipantId === args.participantId;
}
