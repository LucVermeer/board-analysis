// Test stub for the platform-split LogbookChipRow. Its iOS implementation renders
// native @expo/ui SwiftUI views that can't mount under Vitest's node env, and
// Vitest doesn't resolve `.ios`/`.android` platform extensions, so any suite that
// transitively imports the logbook tab redirects here via a vite alias. Component
// tests that assert chip behaviour register their own vi.mock, which takes
// precedence over this alias. (The inline LogbookFacetRail has its own stub.)

export function LogbookChipRow(): null {
  return null;
}
