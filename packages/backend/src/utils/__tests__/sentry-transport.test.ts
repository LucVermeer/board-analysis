import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createBackendLogger } from '../logger';
import { SentryWinstonTransport } from '../sentry-transport';

const SPLAT = Symbol.for('splat');

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

  it('captures error-level logs that carry a trailing Error', async () => {
    const transport = makeTransport('production', captureExceptionMock);
    const cause = new Error('publish failed');

    await runTransport(transport, {
      level: 'error',
      message: 'Failed to publish queue event:',
      [SPLAT]: [cause],
      instanceId: 'abcd1234',
    });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(cause, {
      tags: { source: 'winston-logger' },
      extra: {
        logMessage: 'Failed to publish queue event:',
        instanceId: 'abcd1234',
      },
    });
  });

  it('captures Errors promoted onto info.error by appendSplatFormat', async () => {
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
      [SPLAT]: [new Error('dev-only')],
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
        [SPLAT]: [new Error('underlying')],
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
      const sentryTransport = backendLogger.transports.find(
        (transport) => transport instanceof SentryWinstonTransport,
      );
      expect(sentryTransport).toBeUndefined();
    } finally {
      backendLogger.close();
    }
  });
});
