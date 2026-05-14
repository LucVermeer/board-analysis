import util from 'node:util';
import { createLogger, format, transports } from 'winston';

type InstanceIdProvider = () => string | null;

let instanceIdProvider: InstanceIdProvider | null = null;

export function setInstanceIdProvider(provider: InstanceIdProvider): void {
  instanceIdProvider = provider;
}

const SPLAT = Symbol.for('splat');

type LoggerInfoRecord = Record<string | symbol, unknown>;

type ErrorDetails = {
  name: string;
  message: string;
  stack?: string;
};

function errorDetails(error: Error): ErrorDetails {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

// Winston's `Logger.log()` merges the first trailing arg into `info` only when
// it's an object — strings and other primitives are stashed under
// `info[Symbol.for('splat')]` and the default `format.splat()` only consumes
// them when the message has `%s`-style tokens. The old console patch we're
// replacing always emitted every trailing arg, so this format renders leftover
// splat entries while preserving trailing Error details as structured fields.
const appendSplatFormat = format((info) => {
  const infoRecord = info as LoggerInfoRecord;
  const splatValue = infoRecord[SPLAT];
  if (!Array.isArray(splatValue)) return info;

  delete infoRecord[SPLAT];
  if (splatValue.length === 0) return info;

  const rendered = splatValue
    .map((arg) => {
      if (arg instanceof Error) {
        infoRecord.error ??= errorDetails(arg);
        infoRecord.stack ??= arg.stack;
        return arg.stack ?? `${arg.name}: ${arg.message}`;
      }
      if (typeof arg === 'string') return arg;
      return util.inspect(arg, { depth: 4, breakLength: Infinity });
    })
    .join(' ');
  info.message = `${String(info.message)} ${rendered}`;
  return info;
});

const instanceIdFormat = format((info) => {
  const id = instanceIdProvider?.();
  if (id) info.instanceId = id.slice(0, 8);
  return info;
});

const isProduction = process.env.NODE_ENV === 'production';

const devPrintf = format.printf((info) => {
  const { level, message, instanceId, ...metadata } = info as Record<string, unknown> & {
    level: string;
    message: unknown;
  };
  const rest = Object.fromEntries(
    Object.entries(metadata).filter(([key]) => key !== 'service' && key !== 'pid' && key !== 'timestamp'),
  );
  const tag = typeof instanceId === 'string' && instanceId ? `[i:${instanceId}] ` : '';
  const meta = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
  return `${tag}[${level}] ${String(message)}${meta}`;
});

export const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  exitOnError: false,
  defaultMeta: { service: 'backend', pid: process.pid },
  format: isProduction
    ? format.combine(
        instanceIdFormat(),
        format.timestamp(),
        format.errors({ stack: true }),
        appendSplatFormat(),
        format.json(),
      )
    : format.combine(instanceIdFormat(), appendSplatFormat(), format.colorize(), devPrintf),
  transports: [new transports.Console({ stderrLevels: ['error', 'warn'] })],
});
