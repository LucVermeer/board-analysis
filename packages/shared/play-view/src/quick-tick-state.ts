export type TickStatus = 'flash' | 'send' | 'attempt';

export type QuickTickState = {
  quality: number | null;
  difficulty: number | undefined;
  attemptCount: number;
};

export function createInitialTickState(): QuickTickState {
  return {
    quality: null,
    difficulty: undefined,
    attemptCount: 1,
  };
}

export function deriveAscentType(hasPriorHistory: boolean, attemptCount: number): 'flash' | 'send' {
  return !hasPriorHistory && attemptCount === 1 ? 'flash' : 'send';
}

export function getMinAttempts(status: TickStatus): number {
  if (status === 'send') return 2;
  return 1;
}

export function clampAttempts(attemptCount: number, status: TickStatus): number {
  const min = getMinAttempts(status);
  return Math.max(min, attemptCount);
}
