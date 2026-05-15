import { logger } from '../../../utils/logger';
const SLOW_MUTATION_THRESHOLD_MS = 200;

export function logMutationMetrics(
  operation: string,
  durationMs: number,
  sessionId: string,
  extra?: Record<string, unknown>,
) {
  const rounded = Math.round(durationMs);
  const payload = {
    type: 'mutation_metrics',
    operation,
    durationMs: rounded,
    sessionId,
    slow: rounded > SLOW_MUTATION_THRESHOLD_MS,
    ...extra,
  };

  if (rounded > SLOW_MUTATION_THRESHOLD_MS) {
    logger.warn(`[MutationMetrics] SLOW ${operation}: ${rounded}ms`, JSON.stringify(payload));
  } else if (process.env.NODE_ENV === 'development') {
    logger.info(`[MutationMetrics] ${operation}: ${rounded}ms`, JSON.stringify(payload));
  }
}
