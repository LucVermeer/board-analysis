// Test stub for LogbookFacetRail — the iOS-glass chip row's inline grade/angle/
// date rail. It pulls in Reanimated + the native date picker, neither of which
// mounts under Vitest's react-native mock, so any suite that transitively imports
// the logbook tab redirects here via a vite alias. Component tests that assert the
// rail (logbook-tab-chips) register their own vi.mock, which takes precedence.

export function LogbookFacetRail(): null {
  return null;
}
