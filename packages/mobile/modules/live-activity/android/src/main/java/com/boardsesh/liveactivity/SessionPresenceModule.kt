package com.boardsesh.liveactivity

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.lang.ref.WeakReference
import java.util.concurrent.ConcurrentLinkedQueue

// Localized notification strings forwarded from JS (LiveActivityStartSessionOptions
// .androidNotification). iOS ignores these; on Android they drive the channel +
// the Previous/Next action labels so the ongoing notification respects locale.
class AndroidNotificationStrings : Record {
    @Field var channelName: String = "Active climbing session"
    @Field var channelDescription: String = ""
    @Field var contentTitleFallback: String = "Climbing session"
    @Field var previousLabel: String = "Previous"
    @Field var nextLabel: String = "Next"
}

class StartSessionOptions : Record {
    @Field var androidNotification: AndroidNotificationStrings? = null
}

// Mirrors the scalar fields of LiveActivityUpdateOptions the notification needs.
// The `queue` array and other iOS-only fields are simply not declared, so Expo
// drops them during deserialization.
class SessionUpdateOptions : Record {
    @Field var climbName: String = ""
    @Field var climbDifficulty: String = ""
    @Field var angle: Int = 0
    @Field var currentIndex: Int = 0
    @Field var totalClimbs: Int = 0
    @Field var hasNext: Boolean = false
    @Field var hasPrevious: Boolean = false
}

/**
 * Android counterpart to the iOS LiveActivity module. Thin Expo adapter over
 * [SessionPresenceController] (which owns the BoardSessionService lifecycle and
 * the sessionActive flag) and the `queueNavigate` event bridge — the exact same
 * event contract the iOS widget uses, so the shared JS seam needs no per-platform
 * branching.
 */
class SessionPresenceModule : Module() {

    @Volatile
    private var hasListeners = false

    // Created lazily on the first session call so it can capture the application
    // context. The lifecycle/sessionActive logic lives in the controller so it
    // can be unit-tested without the Expo runtime. @Volatile + @Synchronized init
    // so two concurrent async invocations can't each build a controller and have
    // the second clobber state (e.g. sessionActive) the first already set.
    @Volatile
    private var controller: SessionPresenceController? = null

    // startSession needs a controller; if Expo's weak reactContext is gone,
    // surface it to JS (the hook's .catch resets) rather than no-op into an
    // inconsistent "JS thinks active, native isn't" state. The controller tests
    // cover native rejection after a Context exists; the hook tests cover the JS
    // reset/retry contract for any rejected native start.
    @Synchronized
    private fun requireController(): SessionPresenceController {
        controller?.let { return it }
        val context = appContext.reactContext?.applicationContext ?: throw ReactContextUnavailableException()
        return SessionPresenceController(context).also { controller = it }
    }

    override fun definition() = ModuleDefinition {
        Name("SessionPresence")

        Events("queueNavigate")

        OnCreate { instance = WeakReference(this@SessionPresenceModule) }
        OnDestroy {
            // Guard against a reload race where the replacement module's
            // OnCreate ran before this instance's OnDestroy. pendingEvents is
            // deliberately NOT cleared: it is process-static so a navigate
            // tapped during the React-host gap replays once JS reattaches.
            if (instance?.get() === this@SessionPresenceModule) {
                instance = null
            }
        }

        // Buffer navigate events that arrive before JS attaches a listener (e.g.
        // a notification tap during a brief bridge gap); flush on (re)subscribe.
        OnStartObserving {
            hasListeners = true
            flushPending()
        }
        OnStopObserving { hasListeners = false }

        // The foreground service can always run to keep BLE alive; whether its
        // notification is visible depends on POST_NOTIFICATIONS, which is a
        // separate concern. So report available whenever the module is linked.
        AsyncFunction("isAvailable") { mapOf("available" to true) }

        AsyncFunction("startSession") { options: StartSessionOptions ->
            requireController().startSession(options.androidNotification)
        }

        // Updates are no-ops until a session is started (controller null). Routed
        // through the controller's sessionActive guard once it exists.
        AsyncFunction("updateActivity") { options: SessionUpdateOptions -> controller?.updateActivity(options) }
        AsyncFunction("updateActivityClimb") { options: SessionUpdateOptions -> controller?.updateActivity(options) }

        // No-op (not a throw) when no session was ever started: there's nothing to
        // tear down, and the JS hook has already cleared its own state. Kept
        // deliberately lenient unlike startSession's error-surfacing contract.
        AsyncFunction("endSession") { controller?.endSession() }
    }

    private fun emit(event: Map<String, Any?>) {
        if (hasListeners) {
            sendEvent("queueNavigate", event)
        } else {
            buffer(event)
        }
    }

    private fun flushPending() {
        while (hasListeners) {
            val event = pendingEvents.poll() ?: break
            sendEvent("queueNavigate", event)
        }
    }

    companion object {
        private const val MAX_BUFFERED_EVENTS = 32

        // Process-static (not per-instance) so a navigate tapped while the
        // React host is being torn down or recreated survives the module
        // instance and replays once the next instance's JS listener attaches.
        private val pendingEvents = ConcurrentLinkedQueue<Map<String, Any?>>()

        @Volatile
        private var instance: WeakReference<SessionPresenceModule>? = null

        private fun buffer(event: Map<String, Any?>) {
            if (pendingEvents.size >= MAX_BUFFERED_EVENTS) pendingEvents.poll()
            pendingEvents.add(event)
        }

        /**
         * Called by BoardSessionActionReceiver when a Previous/Next notification
         * action is tapped. Routes to the live module (buffering if JS isn't
         * listening yet); with no live module the event is buffered for replay
         * on reattach. The old fallback — startActivity from the receiver — was
         * a notification trampoline, which Android 12+ blocks for targetSdk
         * 31+: the launch silently no-oped and the tap was lost entirely.
         */
        fun dispatchQueueNavigate(action: String, currentIndex: Int, correlationId: String) {
            val event = mapOf(
                "action" to action,
                "currentIndex" to currentIndex,
                "correlationId" to correlationId,
            )
            val module = instance?.get()
            if (module != null) {
                module.emit(event)
            } else {
                buffer(event)
            }
        }
    }
}
