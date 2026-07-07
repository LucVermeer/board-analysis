package expo.modules.memorytrim

import android.content.ComponentCallbacks2

/**
 * Decides which onTrimMemory levels this module full-clears Glide for.
 *
 * Stock Glide self-registers its own ComponentCallbacks2 (Glide.get() calls
 * registerComponentCallbacks on the application) and already handles:
 * - foreground pressure (< UI_HIDDEN): proportional trimMemory(level)
 * - BACKGROUND(40)+: full clearMemory()
 * - onLowMemory: full clearMemory()
 *
 * The one gap is TRIM_MEMORY_UI_HIDDEN(20)..39, where stock Glide only trims
 * its memory cache to HALF, keeping the other half plus the bitmap/array pools
 * alive while the app is backgrounded. Only that window needs our full clear;
 * everything else would double-trim what Glide already does.
 */
object MemoryTrimPolicy {
    fun shouldFullClear(level: Int): Boolean =
        level >= ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN &&
            level < ComponentCallbacks2.TRIM_MEMORY_BACKGROUND
}
