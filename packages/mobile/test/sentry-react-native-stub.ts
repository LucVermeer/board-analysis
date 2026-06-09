// Vitest stub for `@sentry/react-native`.
//
// The real package's entry pulls in React Native internals (react-native's
// `Libraries/Promise.js`, which imports `promise/setimmediate/es6-extensions`
// without a file extension) that fail to resolve under vitest's node ESM
// environment, breaking every suite that transitively imports `src/lib/sentry`
// (via the queue provider, the root layout, PreSessionView, etc.).
//
// Sentry is disabled in tests anyway — `isSentryEnabled` is false without a DSN
// — so this lightweight stub just needs to satisfy the static imports.
//
// Wired via the `@sentry/react-native` alias in packages/mobile/vite.config.ts.

export function init(): void {}

export function captureException(): void {}

export function wrap<T>(component: T): T {
  return component;
}
