package expo.modules.memorytrim

import android.app.Application
import android.content.ComponentCallbacks2
import android.content.res.Configuration
import android.os.Handler
import android.os.Looper
import com.bumptech.glide.Glide
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android-only, side-effect-only module. It has no JS-callable API: on native
 * module-registry init (app launch) its OnCreate registers a
 * [ComponentCallbacks2] on the application, so the Android framework calls back
 * on memory pressure. This is the "next lever" from docs/react-native-performance.md
 * rule 7 — JS Image.clearMemoryCache() can't move Glide's native bitmap cache /
 * pool.
 *
 * Glide self-registers its own ComponentCallbacks2 (Glide.get() calls
 * registerComponentCallbacks on the application), so foreground pressure levels
 * (< UI_HIDDEN) and the BACKGROUND(40)+ full clear are already handled by stock
 * Glide. The one gap this module fills: at TRIM_MEMORY_UI_HIDDEN(20)..39 stock
 * Glide only trims its memory cache to HALF, keeping the other half plus the
 * bitmap/array pools alive while the app is backgrounded. We full-clear at
 * UI_HIDDEN instead, so board-art bitmaps are released the moment the UI hides
 * rather than when the system escalates to BACKGROUND.
 */
class MemoryTrimModule : Module() {
    // Held so OnDestroy can unregister the exact same instance we registered.
    private var registeredApplication: Application? = null
    private var memoryCallbacks: ComponentCallbacks2? = null

    override fun definition() = ModuleDefinition {
        Name("MemoryTrim")

        OnCreate {
            val application = appContext.reactContext?.applicationContext as? Application
                ?: return@OnCreate

            val callbacks = object : ComponentCallbacks2 {
                override fun onConfigurationChanged(newConfig: Configuration) {
                    // Not a memory signal — nothing to trim.
                }

                @Deprecated("Deprecated in Android 14 (API 34); still delivered on older devices.")
                override fun onLowMemory() {
                    // Legacy critical-memory signal on older devices. Stock Glide's own
                    // callback also full-clears here; required override, kept consistent.
                    clearGlideMemoryOnMain(application)
                }

                override fun onTrimMemory(level: Int) {
                    if (level >= ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN) {
                        // UI hidden (backgrounded): the bitmap cache is dead weight —
                        // drop all of it now instead of Glide's stock half-trim.
                        clearGlideMemoryOnMain(application)
                    }
                    // Foreground levels (< UI_HIDDEN): stock Glide's self-registered
                    // callback already calls trimMemory(level); doing it here too would
                    // just double-trim.
                }
            }

            application.registerComponentCallbacks(callbacks)
            registeredApplication = application
            memoryCallbacks = callbacks
        }

        OnDestroy {
            memoryCallbacks?.let { registeredApplication?.unregisterComponentCallbacks(it) }
            memoryCallbacks = null
            registeredApplication = null
        }
    }

    /**
     * Glide.clearMemory() asserts it runs on the main thread. onTrimMemory /
     * onLowMemory are already delivered on the main thread, but hop to the main
     * looper defensively so any future call site can't trip the assertion.
     */
    private fun clearGlideMemoryOnMain(application: Application) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            Glide.get(application).clearMemory()
        } else {
            Handler(Looper.getMainLooper()).post {
                Glide.get(application).clearMemory()
            }
        }
    }
}
