package com.boardsesh.liveactivity

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException

// startSession can't satisfy the connectedDevice startForeground() contract on
// API 34+ without BLUETOOTH_CONNECT. Thrown (not silently swallowed) so the JS
// promise rejects and useLiveActivity resets isActiveRef instead of believing the
// session started.
internal class MissingBluetoothPermissionException :
    CodedException("BLUETOOTH_CONNECT is required to start a climbing session on Android 14+")

// startSession needs a Context to build the service intent. Thrown rather than
// returning silently so a missing react context surfaces to JS as a rejection.
internal class ReactContextUnavailableException :
    CodedException("React context unavailable; cannot start a climbing session")

// Startup startForegroundService failures mean the native session never activated.
// Reject startSession so JS clears its active ref and can retry later.
internal class SessionForegroundServiceStartException(cause: Throwable) :
    CodedException("Unable to start the climbing session foreground service", cause)

/**
 * Owns the BoardSessionService lifecycle and the logical `sessionActive` flag,
 * deliberately free of the Expo runtime so the lifecycle can be unit-tested.
 * SessionPresenceModule is the thin adapter that constructs this from appContext
 * and routes the async-function calls here.
 *
 * Two delivery seams, both injectable so a test can drive the
 * ForegroundServiceStartNotAllowedException / BackgroundServiceStartNotAllowedException
 * paths without a live service:
 *  - `startForegroundService` — the initial START promotion and the ACTION_STOP
 *    teardown. These genuinely (re)arm the service's foreground state.
 *  - `startService` — every subsequent UPDATE. The service is already promoted by
 *    startSession(), so a plain startService delivers the new state WITHOUT arming
 *    a fresh startForeground() deadline. Each startForegroundService() call sets
 *    fgRequired/fgWaiting on the ServiceRecord and schedules the foreground-start
 *    timeout — even when the service is already foreground — so routing the
 *    high-frequency update path through startForegroundService made every
 *    climb/queue change race a congested or backgrounding main thread and could
 *    trip ForegroundServiceDidNotStartInTimeException (#3188). startService never
 *    schedules that timeout, so it can't. A running FGS keeps the process
 *    foreground-exempt, so startService is also allowed from the background.
 */
internal class SessionPresenceController(
    private val context: Context,
    private val startForegroundService: (Context, Intent) -> Unit = { ctx, intent ->
        ContextCompat.startForegroundService(ctx, intent)
    },
    private val startService: (Context, Intent) -> Unit = { ctx, intent ->
        ctx.startService(intent)
    },
) {
    // Whether a session is logically active (startSession called, endSession not
    // yet). Set synchronously here rather than reading the service's running
    // state, so the initial update that fires right after startSession isn't
    // dropped by a race with the service's async onStartCommand.
    @Volatile
    var sessionActive = false
        private set

    fun startSession(options: StartSessionOptions?) {
        // On API 34+ a connectedDevice FGS can't promote without
        // BLUETOOTH_CONNECT, so skip the start rather than create a
        // startForeground() contract we can't satisfy. The FGS only keeps the
        // BLE link alive, so without the permission there's nothing to keep.
        if (!canRunConnectedDeviceService(context)) throw MissingBluetoothPermissionException()
        sessionActive = true
        val strings = options?.androidNotification
        val intent = Intent(context, BoardSessionService::class.java).apply {
            action = BoardSessionService.ACTION_START
            putExtra(BoardSessionService.EXTRA_CHANNEL_NAME, strings?.channelName ?: "Active climbing session")
            putExtra(BoardSessionService.EXTRA_CHANNEL_DESC, strings?.channelDescription ?: "")
            putExtra(BoardSessionService.EXTRA_TITLE_FALLBACK, strings?.contentTitleFallback ?: "Climbing session")
            putExtra(BoardSessionService.EXTRA_PREV_LABEL, strings?.previousLabel ?: "Previous")
            putExtra(BoardSessionService.EXTRA_NEXT_LABEL, strings?.nextLabel ?: "Next")
            putExtra(BoardSessionService.EXTRA_RELIGHT_LABEL, strings?.relightLabel ?: "Relight wall")
            putExtra(BoardSessionService.EXTRA_RECONNECT_LABEL, strings?.reconnectLabel ?: "Connect to board")
            putExtra(BoardSessionService.EXTRA_ON_WALL_TEMPLATE, strings?.onWallTemplate ?: "{{name}} is on the wall")
            // Initial lightbulb / controls state before the first climb update.
            putExtra(
                BoardSessionService.EXTRA_BOARD_CONNECTION,
                options?.boardConnection ?: BoardSessionService.CONNECTION_CONNECTED_BY_ME,
            )
            options?.holderDisplayName?.let { putExtra(BoardSessionService.EXTRA_HOLDER_NAME, it) }
        }
        // Startup path: a failed initial promotion means the service never
        // started, so clear sessionActive to stop futile update retries and
        // reject startSession so JS resets its active ref and can retry later.
        launchForegroundService(intent)
    }

    fun updateActivity(options: SessionUpdateOptions) {
        // Only update inside an active session window. startSession() owns the
        // foreground promotion; a stray update on a never-started service would
        // deliver to nothing.
        if (!sessionActive) return
        val subtitle = buildString {
            append(options.climbDifficulty)
            if (options.angle >= 0) {
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
            putExtra(BoardSessionService.EXTRA_TOTAL_CLIMBS, options.totalClimbs)
            putExtra(BoardSessionService.EXTRA_BOARD_CONNECTION, options.boardConnection)
            options.holderDisplayName?.let { putExtra(BoardSessionService.EXTRA_HOLDER_NAME, it) }
            // On-device thumbnail: the BoardRenderer overlay PNG + the bundled board
            // background layers, composited by the service (no backend fetch).
            options.androidThumbnailOverlayPath?.let { putExtra(BoardSessionService.EXTRA_OVERLAY_PATH, it) }
            if (options.androidThumbnailBackgroundPaths.isNotEmpty()) {
                putStringArrayListExtra(
                    BoardSessionService.EXTRA_BACKGROUND_PATHS,
                    ArrayList(options.androidThumbnailBackgroundPaths),
                )
            }
        }
        // Update path: the service is already promoted, so deliver via
        // startService — NOT startForegroundService, which would re-arm a
        // startForeground() deadline on every climb/queue change (see the class
        // doc). A failed re-delivery (BackgroundServiceStartNotAllowedException —
        // service already gone and the process no longer foreground-exempt) is
        // non-fatal: keep sessionActive so the next update, once foregrounded,
        // refreshes the notification. Clearing it here would permanently freeze
        // the notification mid-session.
        try {
            startService(context, intent)
        } catch (error: Exception) {
            val errorName = error.javaClass.simpleName.ifBlank { error.javaClass.name }
            Log.w(TAG, "updateActivity startService failed ($errorName): ${error.message}")
        }
    }

    fun endSession() {
        val hadActiveSession = sessionActive
        sessionActive = false
        val stopIntent = Intent(context, BoardSessionService::class.java).apply {
            action = BoardSessionService.ACTION_STOP
        }
        if (!hadActiveSession) {
            // No session window, so no startForegroundService() token can be
            // outstanding; a plain stopService is a safe no-op teardown.
            context.stopService(stopIntent)
            return
        }
        // Tear down through the service's own ACTION_STOP path rather than
        // stopService(): if the start token from startSession() is still
        // pending (onStartCommand hasn't run yet), stopService() bypasses
        // onStartCommand and leaves that token dangling — Android 12-14 can
        // then kill the process with ForegroundServiceDidNotStartInTimeException.
        // ACTION_STOP promotes first, satisfying every outstanding token, then
        // stops itself (BoardSessionService.onStartCommand).
        try {
            startForegroundService(context, stopIntent)
        } catch (error: Exception) {
            // Nothing promotable (service already gone and app backgrounded):
            // there is no dangling token in that state either, so falling back
            // to a plain stopService is safe.
            val errorName = error.javaClass.simpleName.ifBlank { error.javaClass.name }
            Log.w(TAG, "ACTION_STOP startForegroundService failed ($errorName), falling back to stopService: ${error.message}")
            context.stopService(stopIntent)
        }
    }

    // The initial START promotion. startForegroundService() throws
    // ForegroundServiceStartNotAllowedException on API 31+ when the app is
    // backgrounded; a failure here is terminal (the service never started), so
    // clear the flag and reject startSession so JS resets its active ref.
    private fun launchForegroundService(intent: Intent) {
        try {
            startForegroundService(context, intent)
        } catch (error: Exception) {
            val errorName = error.javaClass.simpleName.ifBlank { error.javaClass.name }
            Log.w(TAG, "startForegroundService failed ($errorName): ${error.message}", error)
            sessionActive = false
            throw SessionForegroundServiceStartException(error)
        }
    }

    // Below API 34 the connectedDevice type isn't permission-gated at
    // startForeground() time, so the service can always start.
    private fun canRunConnectedDeviceService(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
        return ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED
    }

    companion object {
        private const val TAG = "BoardSession"
    }
}
