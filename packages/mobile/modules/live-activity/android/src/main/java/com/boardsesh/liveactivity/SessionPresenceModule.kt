package com.boardsesh.liveactivity

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
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
 * Android counterpart to the iOS LiveActivity module. Owns the lifecycle of the
 * BoardSessionService (a connectedDevice foreground service) and bridges the
 * notification's Previous/Next taps back into JS as `queueNavigate` events — the
 * exact same event contract the iOS widget uses, so the shared JS seam needs no
 * per-platform branching.
 */
class SessionPresenceModule : Module() {

    private val pendingEvents = ConcurrentLinkedQueue<Map<String, Any?>>()

    @Volatile
    private var hasListeners = false

    override fun definition() = ModuleDefinition {
        Name("SessionPresence")

        Events("queueNavigate")

        OnCreate { instance = WeakReference(this@SessionPresenceModule) }
        OnDestroy {
            instance = null
            pendingEvents.clear()
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
            val context = appContext.reactContext?.applicationContext ?: return@AsyncFunction
            val strings = options.androidNotification
            val intent = Intent(context, BoardSessionService::class.java).apply {
                action = BoardSessionService.ACTION_START
                putExtra(BoardSessionService.EXTRA_CHANNEL_NAME, strings?.channelName ?: "Active climbing session")
                putExtra(BoardSessionService.EXTRA_CHANNEL_DESC, strings?.channelDescription ?: "")
                putExtra(BoardSessionService.EXTRA_TITLE_FALLBACK, strings?.contentTitleFallback ?: "Climbing session")
                putExtra(BoardSessionService.EXTRA_PREV_LABEL, strings?.previousLabel ?: "Previous")
                putExtra(BoardSessionService.EXTRA_NEXT_LABEL, strings?.nextLabel ?: "Next")
            }
            ContextCompat.startForegroundService(context, intent)
        }

        AsyncFunction("updateActivity") { options: SessionUpdateOptions -> pushUpdate(options) }
        AsyncFunction("updateActivityClimb") { options: SessionUpdateOptions -> pushUpdate(options) }

        AsyncFunction("endSession") {
            // Note: no bare `return@AsyncFunction` + stopService() — stopService
            // returns Boolean, which would clash with the Unit early-return. Use
            // a null-check so the lambda stays Unit-typed.
            val context = appContext.reactContext?.applicationContext
            if (context != null) {
                context.stopService(Intent(context, BoardSessionService::class.java))
            }
        }
    }

    private fun pushUpdate(options: SessionUpdateOptions) {
        val context = appContext.reactContext?.applicationContext ?: return
        val subtitle = buildString {
            append(options.climbDifficulty)
            if (options.angle > 0) {
                if (isNotEmpty()) append(" · ")
                append("${options.angle}°")
            }
        }
        val intent = Intent(context, BoardSessionService::class.java).apply {
            action = BoardSessionService.ACTION_UPDATE
            putExtra(BoardSessionService.EXTRA_CLIMB_NAME, options.climbName)
            putExtra(BoardSessionService.EXTRA_SUBTITLE, subtitle)
            putExtra(BoardSessionService.EXTRA_HAS_NEXT, options.hasNext)
            putExtra(BoardSessionService.EXTRA_HAS_PREVIOUS, options.hasPrevious)
            putExtra(BoardSessionService.EXTRA_CURRENT_INDEX, options.currentIndex)
        }
        ContextCompat.startForegroundService(context, intent)
    }

    private fun emit(event: Map<String, Any?>) {
        if (hasListeners) {
            sendEvent("queueNavigate", event)
        } else {
            if (pendingEvents.size >= MAX_BUFFERED_EVENTS) pendingEvents.poll()
            pendingEvents.add(event)
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

        @Volatile
        private var instance: WeakReference<SessionPresenceModule>? = null

        /**
         * Called by BoardSessionActionReceiver when a Previous/Next notification
         * action is tapped. Routes to the live module (buffering if JS isn't
         * listening yet); if the JS process is gone, brings the app to the
         * foreground so the user can act.
         */
        fun dispatchQueueNavigate(context: Context, action: String, currentIndex: Int, correlationId: String) {
            val module = instance?.get()
            val event = mapOf(
                "action" to action,
                "currentIndex" to currentIndex,
                "correlationId" to correlationId,
            )
            if (module != null) {
                module.emit(event)
            } else {
                context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(launch)
                }
            }
        }
    }
}
