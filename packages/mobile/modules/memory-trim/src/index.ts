import { requireOptionalNativeModule } from 'expo-modules-core';

// Side-effect-only Android module. Its Kotlin OnCreate registers a
// ComponentCallbacks2 that trims Glide's native image-memory cache when the app
// UI is hidden (see android/.../MemoryTrimModule.kt). There is no JS API to
// call — the module activates itself at native module-registry init, so nothing
// needs to import this to make it work.
//
// Exported only so the package has a valid entry point and callers can
// null-check that the module is linked into the running binary.
// requireOptionalNativeModule returns null (silently) on iOS (this module is
// Android-only), in Expo Go, or in a dev client built before this module
// existed.
export const memoryTrimNative = requireOptionalNativeModule('MemoryTrim');
