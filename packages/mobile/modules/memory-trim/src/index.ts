import { requireOptionalNativeModule } from 'expo-modules-core';

// Side-effect-only Android module. Its Kotlin OnCreate registers a
// ComponentCallbacks2 that trims Glide's native image-memory cache when the app
// UI is hidden (see android/.../MemoryTrimModule.kt). There is no JS API to
// call, but expo-modules-core creates native modules LAZILY on first JS access
// — verified on-device: without this require the Kotlin OnCreate never runs and
// no trim callback is registered. The app must import this entry point once at
// startup (app/_layout.tsx does) to activate the module.
// requireOptionalNativeModule returns null (silently) on iOS (this module is
// Android-only), in Expo Go, or in a dev client built before this module
// existed.
export const memoryTrimNative = requireOptionalNativeModule('MemoryTrim');
