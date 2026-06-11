// Catches uncaught JS errors that React error boundaries can't — specifically
// the ones thrown on the JS thread during microtask draining (Promise
// continuations, Reanimated worklet creation). The BLE-connect crash is exactly
// this shape: react-native-worklets fails to serialize a value to the UI runtime
// (`extractSerializableOrThrow` inside `makeShareableCloneRecursive`), the throw
// is uncaught, and React Native escalates it to a fatal `RCTFatal` abort.
//
// We wrap the global handler to (1) always log the full message + stack so a
// TestFlight reproduction is diagnosable from Console.app even when Sentry isn't
// delivering, and (2) recover from worklet-serialization fatals instead of
// aborting the whole app — a value that can't cross to the UI runtime should
// degrade the animation, not SIGABRT.

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsLike = {
  getGlobalHandler: () => GlobalErrorHandler;
  setGlobalHandler: (handler: GlobalErrorHandler) => void;
};

export type GlobalErrorCaptureDeps = {
  /** Forward to the crash backend (Sentry). No-op when Sentry is disabled. */
  report: (error: Error, context: { level: 'fatal' | 'error'; tags: Record<string, string> }) => void;
  /** Best-effort flush so a report survives a later hard crash. */
  flush?: () => Promise<unknown>;
  /** In dev we keep the red box (don't swallow) — it's more useful than recovery. */
  isDev: boolean;
};

// react-native-worklets / Reanimated serialization failures. The thrown message
// varies by version ("…cannot be sent to the UI runtime/thread", references to
// the (de)serialization helpers), so match generously across message + stack.
const WORKLET_SERIALIZATION_PATTERN =
  /cannot be (sent|serialized|cloned|copied)|UI (runtime|thread)|extractSerializable|makeShareable|makeSerializable|ValueUnpacker|\bworklet\b/i;

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

let installed = false;

/**
 * Wrap the React Native global error handler. Idempotent and safe to call when
 * `ErrorUtils` is unavailable (e.g. under the test runner) — it no-ops.
 */
export function installGlobalErrorCapture(deps: GlobalErrorCaptureDeps): void {
  if (installed) return;
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils) return;
  installed = true;

  const previousHandler = errorUtils.getGlobalHandler();
  // Guards against the reporting path itself throwing back into this handler.
  let reentrant = false;

  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const normalized = toError(error);
    const haystack = `${normalized.message ?? ''}\n${normalized.stack ?? ''}`;
    const isWorkletSerialization = WORKLET_SERIALIZATION_PATTERN.test(haystack);

    // Always surface the full error to the device log.
    console.error(
      `[global-error-capture] ${isFatal ? 'FATAL' : 'non-fatal'}` +
        `${isWorkletSerialization ? ' worklet-serialization' : ''}: ${normalized.message ?? ''}\n${normalized.stack ?? ''}`,
    );

    // Recover from worklet-serialization fatals rather than aborting the app.
    const shouldRecover = isWorkletSerialization && isFatal === true && !deps.isDev;

    if (shouldRecover && !reentrant) {
      reentrant = true;
      try {
        deps.report(normalized, {
          level: 'error',
          tags: { mechanism: 'global-error-capture', kind: 'worklet-serialization' },
        });
        void deps.flush?.();
      } catch {
        // Reporting must never become a secondary crash.
      } finally {
        reentrant = false;
      }
      return;
    }

    // Everything else falls through to the previous handler (Sentry's, then RN's
    // default), preserving normal fatal/red-box behaviour and Sentry capture.
    previousHandler(error, isFatal);
  });
}

/** Test-only: reset the install latch so each test starts clean. */
export function resetGlobalErrorCaptureForTests(): void {
  installed = false;
}
