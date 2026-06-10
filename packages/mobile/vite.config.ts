import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // React Native / Metro inject __DEV__ at runtime. Vitest evaluates in node,
  // where the symbol is undefined — replacing it here lets src/ files use
  // `if (__DEV__) { ... }` without guarding for the test environment.
  define: {
    __DEV__: 'true',
  },
  test: {
    name: 'mobile',
    globals: true,
    environment: 'node',
    alias: {
      // The real `posthog-react-native` entry re-exports RN-native components
      // (PostHogProvider/PostHogMaskView) whose untransformed source throws a
      // `SyntaxError` under vitest's node env, breaking every suite that imports
      // `src/lib/analytics`. Analytics is a no-op in tests (isAnalyticsEnabled is
      // false), so a lightweight stub satisfies the static imports safely.
      'posthog-react-native': fileURLToPath(new URL('./test/posthog-react-native-stub.ts', import.meta.url)),
      // react-native-paper's real entry throws a SyntaxError under vitest's node
      // env (untransformed RN-native source + react-native-vector-icons). Stub it
      // so any suite can import a Paper-backed primitive; component tests that
      // assert Paper props register their own vi.mock which takes precedence.
      'react-native-paper': fileURLToPath(new URL('./test/react-native-paper-stub.tsx', import.meta.url)),
      // @sentry/react-native's real entry pulls in react-native's Promise.js,
      // which imports `promise/setimmediate/es6-extensions` (no extension) and
      // fails to resolve under vitest's node ESM env — breaking every suite that
      // transitively imports `src/lib/sentry`. Sentry is disabled in tests, so a
      // lightweight stub satisfies the static imports.
      '@sentry/react-native': fileURLToPath(new URL('./test/sentry-react-native-stub.ts', import.meta.url)),
      // @react-native-async-storage/async-storage's ESM entry imports
      // `./createAsyncStorage` without a file extension, which fails to resolve
      // under vitest's node ESM env — breaking any suite that transitively loads
      // a storage-backed module (the active-board store via the bluetooth
      // provider, the preference store, etc.) even when it never touches
      // storage. A tiny in-memory stub satisfies the static imports; suites that
      // assert storage behaviour register their own vi.mock, which takes
      // precedence.
      '@react-native-async-storage/async-storage': fileURLToPath(
        new URL('./test/async-storage-stub.ts', import.meta.url),
      ),
    },
    // .tsx test files can opt into a jsdom environment per file via the
    // `// @vitest-environment jsdom` pragma — needed to render React
    // providers in tests. Pure-logic tests stay node-env (faster).
    // app/** covers Expo Router layout/screen tests (e.g. (tabs)/__tests__/).
    include: ['src/**/*.test.{ts,tsx}', 'app/**/*.test.{ts,tsx}'],
  },
});
