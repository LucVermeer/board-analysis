// Vitest stub for `@react-native-community/netinfo`.
//
// The real package is a native module that can't load under vitest's node env.
// Any suite that transitively imports the query provider (which wires NetInfo
// into React Query's onlineManager at module load) would otherwise fail to load
// before a single test runs. This stub reports a connected, no-op listener.
//
// Suites that assert connectivity behaviour register their own
// `vi.mock('@react-native-community/netinfo', ...)`, which takes precedence over
// this alias. Wired via the `@react-native-community/netinfo` alias in
// packages/mobile/vite.config.ts.

type NetInfoState = { isConnected: boolean | null };
type NetInfoListener = (state: NetInfoState) => void;

const NetInfo = {
  addEventListener(_listener: NetInfoListener): () => void {
    return () => {};
  },
  fetch(): Promise<NetInfoState> {
    return Promise.resolve({ isConnected: true });
  },
};

export default NetInfo;
