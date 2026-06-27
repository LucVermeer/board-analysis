import { useEffect, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  MutationCache,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { reportHandledError } from '../lib/error-reporting';

// React Query assumes a browser's `navigator.onLine` to know when it's online;
// React Native has no such signal, so without this it treats the app as
// permanently online and `refetchOnReconnect` never fires. Bridge NetInfo's
// connectivity into React Query so queries pause offline and refetch when the
// connection returns. NetInfo is a native module, so this only reaches devices
// via the next native build — the fingerprint runtimeVersion policy gates the
// OTA accordingly. Registered at module load (a process-wide singleton); the
// setup runs once and NetInfo manages its own listener lifecycle.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected ?? true);
  }),
);

// Bridge RN's foreground/background lifecycle into React Query's focus signal so
// `refetchOnWindowFocus` works on native (where there's no window focus event).
function handleAppStateChange(status: AppStateStatus): void {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

// The serialized failing request, trimmed for triage. queryKey/mutationKey are
// the React Query identity (e.g. ['searchClimbs', params]); pulling them into
// PostHog lets us group `$exception`s by what failed without leaking payloads.
function toReportableKey(key: unknown): string {
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

// Pure reporters (exported for tests). reportHandledError drops cancellations
// and downgrades offline noise, so these stay signal-rich.
export function reportQueryFailure(error: unknown, queryKey: unknown, queryHash: string): void {
  reportHandledError(error, {
    tags: { source: 'react-query', kind: 'query' },
    extra: { queryKey: toReportableKey(queryKey), queryHash },
  });
}

export function reportMutationFailure(error: unknown, mutationKey: unknown): void {
  reportHandledError(error, {
    tags: { source: 'react-query', kind: 'mutation' },
    extra: { mutationKey: mutationKey === undefined ? null : toReportableKey(mutationKey) },
  });
}

// Every query/mutation failure flows through the cache onError once retries (see
// defaultOptions.retry) are exhausted — a single chokepoint so API / GraphQL /
// REST errors land in PostHog without instrumenting each call site.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => reportQueryFailure(error, query.queryKey, query.queryHash),
    }),
    mutationCache: new MutationCache({
      // Signature is (error, variables, onMutateResult, mutation, context); the
      // mutation is the 4th arg — that's all we need.
      onError: (error, _variables, _onMutateResult, mutation) =>
        reportMutationFailure(error, mutation.options.mutationKey),
    }),
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: 2,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
