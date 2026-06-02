export type AscentStatusValue = 'flash' | 'send' | 'attempt';

export type NormalizeAscentStatusInput = {
  status?: AscentStatusValue | null;
  isAscent?: boolean | null;
  tries?: number | null;
};

const STATUS_PRIORITY: AscentStatusValue[] = ['flash', 'send', 'attempt'];

export function normalizeAscentStatus({
  status,
  isAscent = false,
  tries,
}: NormalizeAscentStatusInput): AscentStatusValue {
  if (status === 'flash' || status === 'send' || status === 'attempt') {
    return status;
  }

  if (isAscent) {
    return tries === 1 ? 'flash' : 'send';
  }

  return 'attempt';
}

export function pickHighestAscentStatus(statuses: Iterable<AscentStatusValue>): AscentStatusValue | null {
  const candidates = new Set(statuses);

  for (const status of STATUS_PRIORITY) {
    if (candidates.has(status)) {
      return status;
    }
  }

  return null;
}

/**
 * Pick the badge status for a climb from the aggregate counts on its GraphQL
 * row. Mirrors the priority used by web's `pickHighestAscentStatus`.
 *
 * Inputs are tolerant of null/undefined so callers can pass the raw climb
 * fields without pre-coercing them.
 */
export function ascentStatusFromCounts({
  userAscents,
  userFlashes,
  userAttempts,
}: {
  userAscents?: number | null;
  userFlashes?: number | null;
  userAttempts?: number | null;
}): AscentStatusValue | null {
  if ((userFlashes ?? 0) > 0) return 'flash';
  if ((userAscents ?? 0) > 0) return 'send';
  if ((userAttempts ?? 0) > 0) return 'attempt';
  return null;
}
