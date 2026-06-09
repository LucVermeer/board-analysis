package com.boardsesh.liveactivity

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
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

    // Whether a session is logically active (startSession called, endSession not
    // yet). Set synchronously here rather than reading the service's running
    // state, so the initial update that fires right after startSession isn't
    // dropped by a race with the service's async onStartCommand.
    @Volatile
    private var sessionActive = false

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
            // On API 34+ a connectedDevice FGS can't promote without
            // BLUETOOTH_CONNECT, so skip the start rather than create a
            // startForeground() contract we can't satisfy. The FGS only keeps the
            // BLE link alive, so without the permission there's nothing to keep.
            if (!canRunConnectedDeviceService(context)) return@AsyncFunction
            sessionActive = true
            val strings = options.androidNotification
            val intent = Intent(context, BoardSessionService::class.java).apply {
                action = BoardSessionService.ACTION_START
                putExtra(BoardSessionService.EXTRA_CHANNEL_NAME, strings?.channelName ?: "Active climbing session")
                putExtra(BoardSessionService.EXTRA_CHANNEL_DESC, strings?.channelDescription ?: "")
                putExtra(BoardSessionService.EXTRA_TITLE_FALLBACK, strings?.contentTitleFallback ?: "Climbing session")
                putExtra(BoardSessionService.EXTRA_PREV_LABEL, strings?.previousLabel ?: "Previous")
                putExtra(BoardSessionService.EXTRA_NEXT_LABEL, strings?.nextLabel ?: "Next")
            }
            launchService(context, intent)
        }

        AsyncFunction("updateActivity") { options: SessionUpdateOptions -> pushUpdate(options) }
        AsyncFunction("updateActivityClimb") { options: SessionUpdateOptions -> pushUpdate(options) }

        AsyncFunction("endSession") {
            // Note: no bare `return@AsyncFunction` + stopService() — stopService
            // returns Boolean, which would clash with the Unit early-return. Use
            // a null-check so the lambda stays Unit-typed.
            sessionActive = false
            val context = appContext.reactContext?.applicationContext
            if (context != null) {
                context.stopService(Intent(context, BoardSessionService::class.java))
            }
        }
    }

    // Below API 34 the connectedDevice type isn't permission-gated at
    // startForeground() time, so the service can always start.
    private fun canRunConnectedDeviceService(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
        return ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED
    }

    // startForegroundService() throws ForegroundServiceStartNotAllowedException on
    // API 31+ when the app is backgrounded. Clear sessionActive on failure so
    // later updates don't keep retrying a service that never started.
    private fun launchService(context: Context, intent: Intent) {
        try {
            ContextCompat.startForegroundService(context, intent)
        } catch (error: Exception) {
            Log.w(TAG, "startForegroundService failed: ${error.message}")
            sessionActive = false
        }
    }

    private fun pushUpdate(options: SessionUpdateOptions) {
        val context = appContext.reactContext?.applicationContext ?: return
        // Only update inside an active session window. startSession() owns
        // promotion; a stray update would issue startForegroundService() just to
        // refresh, risking ForegroundServiceDidNotStartInTimeException.
        if (!sessionActive) return
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
        launchService(context, intent)
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
        private const val TAG = "BoardSession"

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
