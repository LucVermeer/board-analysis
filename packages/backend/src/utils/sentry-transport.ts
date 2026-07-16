import TransportStream from 'winston-transport';
import * as Sentry from '@sentry/node';
import { isLocalDevelopment, isTestEnvironment } from '@boardsesh/db/client/config';

// Mirrors the `Sentry.init({ enabled })` gate in instrument.ts: capture in any
// prod-like environment (Railway leaves NODE_ENV unset), but never in local dev
// or under the test runner.
//
// The optional `nodeEnv` seam lets tests assert the gate without mutating
// process.env; when supplied it fully determines the decision, so a test that
// runs with VITEST=1 can still exercise the "production" branch.
function isSentryLoggingEnabled(nodeEnvOverride?: string): boolean {
  if (nodeEnvOverride !== undefined) {
    return nodeEnvOverride !== 'development' && nodeEnvOverride !== 'test';
  }
  return !isLocalDevelopment() && !isTestEnvironment();
}

const SPLAT = Symbol.for('splat');
// Mirrors the `ERROR_INSTANCE` symbol set by `appendSplatFormat` in logger.ts.
// Defined via the global Symbol registry so the two modules agree on the key
// without an import cycle.
const ERROR_INSTANCE = Symbol.for('boardsesh.errorInstance');

type CaptureExceptionFn = (exception: unknown, hint?: Parameters<typeof Sentry.captureException>[1]) => unknown;

type SentryWinstonTransportOptions = ConstructorParameters<typeof TransportStream>[0] & {
  // Test-only seams. Production code should leave both unset and let the
  // constructor read NODE_ENV / call Sentry directly.
  nodeEnv?: string;
  capture?: CaptureExceptionFn;
};

type LogInfo = {
  level: string;
  message: unknown;
  instanceId?: unknown;
  error?: unknown;
  [key: symbol]: unknown;
};

function extractError(info: LogInfo): Error | null {
  // Primary path: appendSplatFormat in logger.ts stashes the live Error here.
  const preserved = (info as Record<symbol, unknown>)[ERROR_INSTANCE];
  if (preserved instanceof Error) return preserved;

  // Fallback paths for callers that construct a transport outside the
  // default createBackendLogger pipeline (e.g. unit tests, or a future
  // logger that doesn't use appendSplatFormat).
  const splatValue = (info as Record<symbol, unknown>)[SPLAT];
  if (Array.isArray(splatValue)) {
    for (const arg of splatValue) {
      if (arg instanceof Error) return arg;
    }
  }
  if (info.error instanceof Error) return info.error;
  return null;
}

/**
 * Winston transport that forwards `error`-level logs carrying an Error
 * instance to Sentry via `captureException`. Other levels and message-only
 * error logs are ignored.
 *
 * Gated to prod-like environments to mirror the `Sentry.init({ enabled })`
 * gate in `instrument.ts` — keeps dev/test runs from emitting events.
 */
export class SentryWinstonTransport extends TransportStream {
  // Public so callers (and tests) can verify the production gate without
  // mutating process.env or reaching into private state.
  public readonly enabled: boolean;
  private readonly capture?: CaptureExceptionFn;

  constructor(options: SentryWinstonTransportOptions = {}) {
    super({ ...options, level: 'error' });
    this.enabled = isSentryLoggingEnabled(options.nodeEnv);
    this.capture = options.capture;
  }

  log(info: unknown, next: () => void): void {
    setImmediate(() => this.emit('logged', info));

    if (!this.enabled) {
      next();
      return;
    }

    // No level guard here — the parent TransportStream is constructed with
    // `level: 'error'`, so winston's pipeline filters non-error events
    // before this method is called.
    const typedInfo = info as LogInfo;
    const errorInstance = extractError(typedInfo);
    if (!errorInstance) {
      next();
      return;
    }

    // Read `Sentry.captureException` at call time (rather than caching it in
    // the constructor) so test suites can replace it with `vi.spyOn` after the
    // transport has been instantiated by `createBackendLogger`.
    const captureFn = this.capture ?? Sentry.captureException;

    try {
      captureFn(errorInstance, {
        tags: { source: 'winston-logger' },
        extra: {
          logMessage: String(typedInfo.message),
          ...(typeof typedInfo.instanceId === 'string' ? { instanceId: typedInfo.instanceId } : {}),
        },
      });
    } catch {
      // A failure inside the Sentry SDK must never break the logger pipeline.
    }

    next();
  }
}
