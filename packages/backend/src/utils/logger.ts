import util from 'node:util';
import { createLogger, format, transports } from 'winston';

type InstanceIdProvider = () => string | null;

let instanceIdProvider: InstanceIdProvider | null = null;

export function setInstanceIdProvider(provider: InstanceIdProvider): void {
  instanceIdProvider = provider;
}

const SPLAT = Symbol.for('splat');

// Winston's `Logger.log()` merges the first trailing arg into `info` only when
// it's an object — strings and other primitives are stashed under
// `info[Symbol.for('splat')]` and the default `format.splat()` only consumes
// them when the message has `%s`-style tokens. The old console patch we're
// replacing always emitted every trailing arg, so this format concatenates
// any leftover splat entries onto the message and clears the symbol so the
// JSON / printf renderers don't leak it.
const appendSplatFormat = format((info) => {
  const splatValue = (info as unknown as Record<symbol, unknown>)[SPLAT];
  if (!Array.isArray(splatValue) || splatValue.length === 0) return info;

  const rendered = splatValue
    .map((arg) => {
      if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
      if (typeof arg === 'string') return arg;
      return util.inspect(arg, { depth: 4, breakLength: Infinity });
    })
    .join(' ');
  info.message = `${String(info.message)} ${rendered}`;
  delete (info as unknown as Record<symbol, unknown>)[SPLAT];
  return info;
});

const instanceIdFormat = format((info) => {
  const id = instanceIdProvider?.();
  if (id) info.instanceId = id.slice(0, 8);
  return info;
});

const isProduction = process.env.NODE_ENV === 'production';

const devPrintf = format.printf((info) => {
  const { level, message, instanceId, service, pid, timestamp, ...rest } = info as Record<string, unknown> & {
    level: string;
    message: unknown;
  };
  void service;
  void pid;
  void timestamp;
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
