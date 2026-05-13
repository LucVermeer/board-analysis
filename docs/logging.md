# Backend Logging

The backend uses [winston](https://github.com/winstonjs/winston) for structured logging. There is one singleton logger at `packages/backend/src/utils/logger.ts`; all backend code calls `logger.info` / `logger.warn` / `logger.error` rather than `console.*`. The lint rule `no-console` is set to `error` for `packages/backend/src/**/*.ts` (configured under `lint.overrides` in the root `vite.config.ts`), so reintroducing `console.*` fails CI. Test files keep the global allow list for `warn`/`error`/`info` since test infra uses console for orchestration.

## Output formats

The logger picks its format from `NODE_ENV`:

- **Development** (`NODE_ENV !== 'production'`): one line per event, colorized, in the shape
  `[i:abcd1234] [info] message {…fields}`. The leading `[i:abcd1234]` tag is the first 8 chars of the pubsub instance UUID — the same prefix style the previous `installInstanceLogTag` console-patch produced, so existing grep workflows keep working. When the backend runs without Redis (local-only mode) there is no instance id and the prefix is omitted.
- **Production**: JSON, one object per line. Each event includes `level`, `message`, `timestamp`, `service: "backend"`, `pid`, and (when set) `instanceId`. JSON is the lowest-common-denominator format that works on Railway, plain Docker, and any successor host — staying portable is a goal from `CLAUDE.md`.

`console.error` and `console.warn` events go to `stderr`; `info` / `debug` go to `stdout`. This matches the stream semantics the patched console used to provide.

## Configuration

- `LOG_LEVEL` — minimum level emitted (`error`, `warn`, `info`, `debug`). Defaults to `info`. Set in env to raise verbosity for a single subsystem investigation without a deploy.
- `NODE_ENV` — selects dev vs prod format as described above.

The logger never reads any Railway-specific env var. If you need to ship logs somewhere else, point the host's log aggregator at the backend's stdout/stderr.

## Instance ID wiring

The `instanceId` field comes from `pubsub.getInstanceId()`, which is itself populated from the Redis adapter's `uuidv4()` at Redis-connect time. The logger module knows nothing about pubsub directly — `server.ts` calls `setInstanceIdProvider(() => pubsub.getInstanceId())` immediately after `await pubsub.initialize()`. The provider is read at log time, so:

- Log calls before pubsub init have no `instanceId` — usually only the very first `instrument.ts` / Sentry startup is in that window.
- Log calls after pubsub init read the current id.
- In local-only / no-Redis mode the provider returns `null` and the prefix / field is omitted.

This indirection also keeps the logger module free of project imports, so `pubsub`, `redis-adapter`, and friends can import the logger without creating a cycle.

## Spying on the logger in tests

After the migration the previous `vi.spyOn(console, 'error')` calls no longer capture anything (winston writes via `process.stdout.write`, not `console.*`). To suppress / assert log output in a test:

```ts
import { logger } from '../utils/logger';

const errSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
// …run code under test…
expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('expected message'));
errSpy.mockRestore();
```

The `() => logger` return matches winston's method signature (each level method returns the logger instance for chaining).

## Why winston (and not Pino / native console / pretty-printed wrapper)

- The previous global `console.*` patch (`installInstanceLogTag`) leaked the instance prefix into every third-party library's output. Replacing it with a structured logger gives us per-call control without monkey-patching.
- Winston was chosen over Pino for its mature format-combine API — the `instanceIdFormat` step uses a closure to read the provider at log time, which avoids the alternative of mutating `defaultMeta` from `server.ts` and depending on import-evaluation order.
- The dev format intentionally mirrors the old console-patch output (`[i:abcd1234] ` prefix) so grep / tail workflows don't change.

## Out of scope

- A request-id propagation layer is a separate concern (separate issue).
- Per-subsystem log-level matrices (e.g. promote `pubsub` to `debug` while leaving `events` at `info`) are not wired — set `LOG_LEVEL=debug` globally if you need that, or add a `child()` logger per subsystem when the need is real.
- Sentry breadcrumbs auto-generated from `console.*` no longer fire for backend log calls (we routed off console). Backend events that need Sentry visibility should call `Sentry.captureException` / `Sentry.captureMessage` directly rather than relying on the breadcrumb fallback.
