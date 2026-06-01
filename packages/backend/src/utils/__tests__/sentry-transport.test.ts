import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Logger } from 'winston';
import { createBackendLogger } from '../logger';
import { SentryWinstonTransport } from '../sentry-transport';

const SPLAT = Symbol.for('splat');
const ERROR_INSTANCE = Symbol.for('boardsesh.errorInstance');

function makeTransport(nodeEnv: string, capture: ReturnType<typeof vi.fn>): SentryWinstonTransport {
  return new SentryWinstonTransport({ nodeEnv, capture: capture as unknown as (e: unknown, h?: unknown) => unknown });
}

function runTransport(
  transport: SentryWinstonTransport,
  info: Record<string | symbol, unknown> & { level: string; message: unknown },
): Promise<void> {
  return new Promise<void>((resolve) => {
    transport.log(info, () => resolve());
  });
}

describe('SentryWinstonTransport', () => {
  let captureExceptionMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    captureExceptionMock = vi.fn();
  });

  it('captures an Error preserved on info[ERROR_INSTANCE] by appendSplatFormat', async () => {
    // This is the primary path in real production: appendSplatFormat runs
    // *before* any transport, deletes the SPLAT symbol, flattens info.error
    // into { name, message, stack }, and stashes the live Error reference
    // on info[ERROR_INSTANCE] for downstream consumers like this transport.
    const transport = makeTransport('production', captureExceptionMock);
    const cause = new Error('publish failed');

    await runTransport(transport, {
      level: 'error',
      message: 'Failed to publish queue event: Error: publish failed',
      error: { name: 'Error', message: 'publish failed', stack: cause.stack },
      stack: cause.stack,
      [ERROR_INSTANCE]: cause,
      instanceId: 'abcd1234',
    });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(cause, {
      tags: { source: 'winston-logger' },
      extra: {
        logMessage: 'Failed to publish queue event: Error: publish failed',
        instanceId: 'abcd1234',
      },
    });
  });

  it('falls back to scanning info[SPLAT] when ERROR_INSTANCE is absent', async () => {
    const transport = makeTransport('production', captureExceptionMock);
    const cause = new Error('raw splat');

    await runTransport(transport, {
      level: 'error',
      message: 'Direct construction',
      [SPLAT]: [cause],
    });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(cause, expect.any(Object));
  });

  it('falls back to info.error when it holds a live Error instance', async () => {
    const transport = makeTransport('production', captureExceptionMock);
    const cause = new Error('promoted');

    await runTransport(transport, {
      level: 'error',
      message: 'Boom',
      error: cause,
    });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(cause, expect.any(Object));
  });

  it('skips when info.error is a flattened plain object with no live Error nearby', async () => {
    // Guards against a regression in appendSplatFormat where the live Error
    // reference is lost: we must NOT fabricate a synthetic Error from the
    // flattened object, since Sentry needs a real stack trace.
    const transport = makeTransport('production', captureExceptionMock);

    await runTransport(transport, {
      level: 'error',
      message: 'Lost the Error',
      error: { name: 'Error', message: 'flattened', stack: 'fake stack' },
    });

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('skips error-level logs with no Error attached', async () => {
    const transport = makeTransport('production', captureExceptionMock);

    await runTransport(transport, {
      level: 'error',
      message: '[Auth] requireSession failed: connectionId=conn-1, sessionId=sess-1',
    });

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('no-ops outside production', async () => {
    const transport = makeTransport('development', captureExceptionMock);

    await runTransport(transport, {
      level: 'error',
      message: 'Failed',
      [ERROR_INSTANCE]: new Error('dev-only'),
    });

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('swallows errors thrown by capture without breaking the pipeline', async () => {
    captureExceptionMock.mockImplementationOnce(() => {
      throw new Error('sentry internal failure');
    });
    const transport = makeTransport('production', captureExceptionMock);

    await expect(
      runTransport(transport, {
        level: 'error',
        message: 'Resilient',
        [ERROR_INSTANCE]: new Error('underlying'),
      }),
    ).resolves.toBeUndefined();

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });
});

describe('createBackendLogger default transports', () => {
  it('includes a SentryWinstonTransport scoped to error level', () => {
    const backendLogger = createBackendLogger({ nodeEnv: 'production' });
    try {
      const sentryTransport = backendLogger.transports.find(
        (transport): transport is SentryWinstonTransport => transport instanceof SentryWinstonTransport,
      );

      expect(sentryTransport).toBeDefined();
      expect(sentryTransport?.level).toBe('error');
    } finally {
      backendLogger.close();
    }
  });

  it('omits the SentryWinstonTransport when the caller provides custom transports', () => {
    const backendLogger = createBackendLogger({ nodeEnv: 'production', loggerTransports: [] });
    try {
      const sentryTransport = backendLogger.transports.find((transport) => transport instanceof SentryWinstonTransport);
      expect(sentryTransport).toBeUndefined();
    } finally {
      backendLogger.close();
    }
  });

  it('propagates the nodeEnv option to the SentryWinstonTransport so production gating tracks the logger', () => {
    // Regression guard for a bug where createBackendLogger constructed
    // `new SentryWinstonTransport()` with no args, so the transport read
    // process.env.NODE_ENV directly and ignored the caller-supplied nodeEnv.
    // A logger created with nodeEnv: 'production' while env=test would then
    // have a disabled transport, silently dropping captures.
    const backendLogger = createBackendLogger({ nodeEnv: 'production' });
    try {
      const sentryTransport = backendLogger.transports.find(
        (transport): transport is SentryWinstonTransport => transport instanceof SentryWinstonTransport,
      );
      expect(sentryTransport?.enabled).toBe(true);
    } finally {
      backendLogger.close();
    }

    const devLogger = createBackendLogger({ nodeEnv: 'development' });
    try {
      const sentryTransport = devLogger.transports.find(
        (transport): transport is SentryWinstonTransport => transport instanceof SentryWinstonTransport,
      );
      expect(sentryTransport?.enabled).toBe(false);
    } finally {
      devLogger.close();
    }
  });

  it('forwards a real logger.error(message, error) call through appendSplatFormat to capture', async () => {
    // End-to-end coverage of the appendSplatFormat → SentryWinstonTransport
    // contract: appendSplatFormat deletes info[SPLAT] and flattens info.error
    // to a plain { name, message, stack } object. The transport must still
    // recover the live Error via the preserved ERROR_INSTANCE symbol —
    // otherwise Sentry receives nothing in production.
    const capture = vi.fn();
    const transport = new SentryWinstonTransport({
      nodeEnv: 'production',
      capture: capture as unknown as (e: unknown, h?: unknown) => unknown,
    });
    const backendLogger: Logger = createBackendLogger({
      nodeEnv: 'production',
      loggerTransports: [transport],
    });

    try {
      const cause = new Error('pipeline failure');
      backendLogger.error('[Server] Failed to initialize EventBroker:', cause);
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture.mock.calls[0]![0]).toBe(cause);
      expect(capture.mock.calls[0]![1]).toMatchObject({
        tags: { source: 'winston-logger' },
        extra: expect.objectContaining({
          logMessage: expect.stringContaining('[Server] Failed to initialize EventBroker:'),
        }),
      });
    } finally {
      backendLogger.close();
    }
  });
});
