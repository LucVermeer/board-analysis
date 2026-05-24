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
