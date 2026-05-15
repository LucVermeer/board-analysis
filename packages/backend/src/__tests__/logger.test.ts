import { Writable } from 'node:stream';
import { describe, expect, it, afterEach } from 'vite-plus/test';
import { transports as winstonTransports, type Logger } from 'winston';
import { appendSplatFormat, createBackendLogger, instanceIdFormat, setInstanceIdProvider } from '../utils/logger';

const SPLAT = Symbol.for('splat');

type LoggerInfoForTest = Record<string | symbol, unknown> & {
  level: string;
  message: unknown;
};

type LoggerFormatForTest = {
  transform: (info: LoggerInfoForTest, options?: unknown) => LoggerInfoForTest | boolean;
};

type ParsedProductionLogEntry = {
  error?: {
    name?: string;
    message?: string;
    stack?: string;
  };
  instanceId?: string;
  level?: string;
  message?: string;
  pid?: number;
  service?: string;
  stack?: string;
  timestamp?: string;
};

function applyFormat(formatter: LoggerFormatForTest, info: LoggerInfoForTest): LoggerInfoForTest {
  const transformed = formatter.transform(info);
  if (typeof transformed === 'boolean') {
    throw new Error('Logger format unexpectedly dropped the log event');
  }
  return transformed;
}

function createCapturingLogger(options: { nodeEnv?: string; logLevel?: string; processId?: number } = {}): {
  capturedLines: string[];
  backendLogger: Logger;
} {
  const capturedLines: string[] = [];
  const captureStream = new Writable({
    write(chunk, _encoding, callback) {
      capturedLines.push(chunk.toString());
      callback();
    },
  });
  const streamTransport = new winstonTransports.Stream({ stream: captureStream });
  const backendLogger = createBackendLogger({ ...options, loggerTransports: [streamTransport] });
  return { capturedLines, backendLogger };
}

async function flushAndCloseLogger(backendLogger: Logger): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  backendLogger.close();
}

function parseProductionLogEntry(capturedLines: string[]): ParsedProductionLogEntry {
  const firstCapturedLine = capturedLines[0];
  if (!firstCapturedLine) {
    throw new Error('Expected logger to write a captured line');
  }
  return JSON.parse(firstCapturedLine) as ParsedProductionLogEntry;
}

describe('logger formats', () => {
  afterEach(() => {
    setInstanceIdProvider(null);
  });

  it('appends leftover splat args to the message and removes the splat symbol', () => {
    const info = {
      level: 'info',
      message: 'Queue update',
      [SPLAT]: ['for session', { sessionId: 'session-1' }],
    };

    const transformed = applyFormat(appendSplatFormat() as LoggerFormatForTest, info);

    expect(transformed.message).toBe("Queue update for session { sessionId: 'session-1' }");
    expect(Object.prototype.hasOwnProperty.call(transformed, SPLAT)).toBe(false);
  });

  it('preserves trailing Error details as structured metadata', () => {
    const error = new Error('boom');
    error.stack = 'Error: boom\n    at logger.test.ts:1:1';
    const info = {
      level: 'error',
      message: 'Failed to publish',
      [SPLAT]: [error],
    };

    const transformed = applyFormat(appendSplatFormat() as LoggerFormatForTest, info);

    expect(transformed.message).toBe(`Failed to publish ${error.stack}`);
    expect(transformed.error).toEqual({
      name: 'Error',
      message: 'boom',
      stack: error.stack,
    });
    expect(transformed.stack).toBe(error.stack);
  });

  it('drops an empty splat symbol without changing the message', () => {
    const info = {
      level: 'info',
      message: 'Startup complete',
      [SPLAT]: [],
    };

    const transformed = applyFormat(appendSplatFormat() as LoggerFormatForTest, info);

    expect(transformed.message).toBe('Startup complete');
    expect(Object.prototype.hasOwnProperty.call(transformed, SPLAT)).toBe(false);
  });

  it('adds the short instance id when a provider is configured', () => {
    setInstanceIdProvider(() => 'abcdef1234567890');
    const info = {
      level: 'info',
      message: 'Connected',
    };

    const transformed = applyFormat(instanceIdFormat() as LoggerFormatForTest, info);

    expect(transformed.instanceId).toBe('abcdef12');
  });
});

describe('backend logger pipeline', () => {
  afterEach(() => {
    setInstanceIdProvider(null);
  });

  it('omits instanceId without throwing before the provider is configured', async () => {
    setInstanceIdProvider(null);
    const { backendLogger, capturedLines } = createCapturingLogger({
      nodeEnv: 'production',
      processId: 12345,
    });

    expect(() => {
      backendLogger.info('Startup before pubsub');
    }).not.toThrow();
    await flushAndCloseLogger(backendLogger);

    const parsedLogEntry = parseProductionLogEntry(capturedLines);
    expect(parsedLogEntry.message).toBe('Startup before pubsub');
    expect(parsedLogEntry.instanceId).toBeUndefined();
  });

  it('respects LOG_LEVEL when composing the singleton-equivalent logger', async () => {
    const previousLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'warn';
    const { backendLogger, capturedLines } = createCapturingLogger({
      nodeEnv: 'production',
      processId: 12345,
    });

    try {
      backendLogger.info('Hidden info');
      backendLogger.warn('Visible warning');
      await flushAndCloseLogger(backendLogger);
    } finally {
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }

    expect(capturedLines).toHaveLength(1);
    const parsedLogEntry = parseProductionLogEntry(capturedLines);
    expect(parsedLogEntry.level).toBe('warn');
    expect(parsedLogEntry.message).toBe('Visible warning');
  });

  it('emits the production JSON shape with structured trailing Error details', async () => {
    setInstanceIdProvider(() => 'abcdef1234567890');
    const { backendLogger, capturedLines } = createCapturingLogger({
      logLevel: 'debug',
      nodeEnv: 'production',
      processId: 12345,
    });
    const loggedError = new Error('publish failed');
    loggedError.stack = 'Error: publish failed\n    at logger.test.ts:1:1';

    backendLogger.error('Failed to publish queue event:', loggedError);
    await flushAndCloseLogger(backendLogger);

    const parsedLogEntry = parseProductionLogEntry(capturedLines);
    expect(parsedLogEntry).toMatchObject({
      error: {
        name: 'Error',
        message: 'publish failed',
        stack: loggedError.stack,
      },
      instanceId: 'abcdef12',
      level: 'error',
      pid: 12345,
      service: 'backend',
      stack: loggedError.stack,
    });
    expect(parsedLogEntry.message).toBe(`Failed to publish queue event: publish failed ${loggedError.stack}`);
    expect(parsedLogEntry.timestamp).toEqual(expect.any(String));
  });
});
