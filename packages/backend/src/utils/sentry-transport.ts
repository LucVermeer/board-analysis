import TransportStream from 'winston-transport';
import * as Sentry from '@sentry/node';

const SPLAT = Symbol.for('splat');

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
 * Winston transport that forwards `error`-level logs carrying an Error instance
 * to Sentry via `captureException`. Other levels and message-only error logs
 * are ignored.
 *
 * Gated to NODE_ENV === 'production' to mirror the `Sentry.init({ enabled })`
 * gate in `instrument.ts` — keeps dev/test runs from emitting events.
 */
export class SentryWinstonTransport extends TransportStream {
  private readonly enabled: boolean;
  private readonly capture: CaptureExceptionFn;

  constructor(options: SentryWinstonTransportOptions = {}) {
    super({ ...options, level: 'error' });
    this.enabled = (options.nodeEnv ?? process.env.NODE_ENV) === 'production';
    this.capture = options.capture ?? Sentry.captureException;
  }

  log(info: unknown, next: () => void): void {
    setImmediate(() => this.emit('logged', info));

    if (!this.enabled) {
      next();
      return;
    }

    const typedInfo = info as LogInfo;
    if (typedInfo.level !== 'error') {
      next();
      return;
    }

    const errorInstance = extractError(typedInfo);
    if (!errorInstance) {
      next();
      return;
    }

    try {
      this.capture(errorInstance, {
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
