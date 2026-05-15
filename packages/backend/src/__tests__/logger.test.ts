import { describe, expect, it, afterEach } from 'vite-plus/test';
import { appendSplatFormat, instanceIdFormat, setInstanceIdProvider } from '../utils/logger';

const SPLAT = Symbol.for('splat');

type LoggerInfoForTest = Record<string | symbol, unknown> & {
  level: string;
  message: unknown;
};

type LoggerFormatForTest = {
  transform: (info: LoggerInfoForTest, options?: unknown) => LoggerInfoForTest | boolean;
};

function applyFormat(formatter: LoggerFormatForTest, info: LoggerInfoForTest): LoggerInfoForTest {
  const transformed = formatter.transform(info);
  if (typeof transformed === 'boolean') {
    throw new Error('Logger format unexpectedly dropped the log event');
  }
  return transformed;
}

describe('logger formats', () => {
  afterEach(() => {
    setInstanceIdProvider(() => null);
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
