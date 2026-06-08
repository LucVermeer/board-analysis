package com.boardsesh.liveactivity

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Foreground service (type connectedDevice) that keeps the react-native-ble-plx
 * connection alive while Boardsesh is backgrounded, and shows an ongoing
 * media-style notification with Previous/Next controls. The Android counterpart
 * to the iOS Live Activity. Started/updated/stopped by SessionPresenceModule via
 * intents; its action buttons broadcast to BoardSessionActionReceiver.
 */
class BoardSessionService : Service() {

    private var channelName: String = "Active climbing session"
    private var channelDescription: String = ""
    private var contentTitleFallback: String = "Climbing session"
    private var previousLabel: String = "Previous"
    private var nextLabel: String = "Next"

    private var climbName: String? = null
    private var subtitle: String? = null
    private var hasNext: Boolean = false
    private var hasPrevious: Boolean = false
    private var currentIndex: Int = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Apply intent state first — these reads are cheap and can't throw, so
        // they never jeopardise the 5 s startForeground() deadline.
        when (intent?.action) {
            ACTION_START -> {
                channelName = intent.getStringExtra(EXTRA_CHANNEL_NAME) ?: channelName
                channelDescription = intent.getStringExtra(EXTRA_CHANNEL_DESC) ?: channelDescription
                contentTitleFallback = intent.getStringExtra(EXTRA_TITLE_FALLBACK) ?: contentTitleFallback
                previousLabel = intent.getStringExtra(EXTRA_PREV_LABEL) ?: previousLabel
                nextLabel = intent.getStringExtra(EXTRA_NEXT_LABEL) ?: nextLabel
            }
            ACTION_UPDATE -> {
                climbName = intent.getStringExtra(EXTRA_CLIMB_NAME) ?: climbName
                subtitle = intent.getStringExtra(EXTRA_SUBTITLE) ?: subtitle
                hasNext = intent.getBooleanExtra(EXTRA_HAS_NEXT, hasNext)
                hasPrevious = intent.getBooleanExtra(EXTRA_HAS_PREVIOUS, hasPrevious)
                currentIndex = intent.getIntExtra(EXTRA_CURRENT_INDEX, currentIndex)
            }
        }

        // Promote to the foreground on EVERY entry, including ACTION_STOP and the
        // null-intent restart the OS hands us — the system may be holding a start
        // token from startForegroundService() and will crash the process with
        // ForegroundServiceDidNotStartInTimeException if we don't call
        // startForeground() in time.
        val promoted = startInForeground()

        if (intent?.action == ACTION_STOP || !promoted) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        // START_NOT_STICKY: do NOT let the OS recreate the service in the
        // background after a kill. A null-intent restart while the process is
        // frozen/cold-starting can't promote within the 5 s window, which is a
        // prime source of the timeout crash. The JS useLiveActivity effect
        // re-starts the session when the app is reopened.
        return START_NOT_STICKY
    }

    /**
     * Promotes the service to the foreground. Returns true on success. Everything
     * that could throw or be slow (channel creation, resource/icon load, pending
     * intents) is guarded so startForeground() is always reached: build failures
     * fall back to a minimal notification, and a rejected connectedDevice type
     * (missing BLUETOOTH_CONNECT on API 34+) falls back to a typeless FGS rather
     * than leaving the start contract unsatisfied.
     */
    private fun startInForeground(): Boolean {
        val notification = try {
            ensureChannel()
            buildNotification()
        } catch (error: Exception) {
            Log.w(TAG, "buildNotification failed, using fallback: ${error.message}")
            buildFallbackNotification()
        }
        // connectedDevice requires API 30+; older devices get a plain FGS.
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        } else {
            0
        }
        if (tryStartForeground(notification, type)) return true
        // The typed promotion was rejected (commonly a missing BLUETOOTH_CONNECT
        // grant on API 34+). Retry as a typeless FGS so we still satisfy the
        // start contract instead of timing out.
        if (type != 0 && tryStartForeground(notification, 0)) return true
        return false
    }

    private fun tryStartForeground(notification: Notification, type: Int): Boolean {
        return try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
            true
        } catch (error: Exception) {
            Log.w(TAG, "startForeground(type=$type) failed: ${error.message}")
            false
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_LOW).apply {
            description = channelDescription
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_boardsesh_notification)
            .setContentTitle(climbName ?: contentTitleFallback)
            .setContentText(subtitle ?: "")
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setContentIntent(launchAppIntent())

        val compactActions = mutableListOf<Int>()
        var actionIndex = 0
        if (hasPrevious) {
            builder.addAction(
                android.R.drawable.ic_media_previous,
                previousLabel,
                actionPendingIntent(ACTION_NAV_PREVIOUS, REQ_PREVIOUS),
            )
            compactActions.add(actionIndex)
            actionIndex++
        }
        if (hasNext) {
            builder.addAction(
                android.R.drawable.ic_media_next,
                nextLabel,
                actionPendingIntent(ACTION_NAV_NEXT, REQ_NEXT),
            )
            compactActions.add(actionIndex)
        }

        builder.setStyle(
            androidx.media.app.NotificationCompat.MediaStyle().setShowActionsInCompactView(*compactActions.toIntArray()),
        )
        return builder.build()
    }

    // Minimal, dependency-free notification used when buildNotification() throws.
    // Only touches the small icon, a title and the channel — nothing that loads
    // extra resources or creates pending intents — so it can satisfy the
    // startForeground() contract even when the rich build fails.
    private fun buildFallbackNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_boardsesh_notification)
            .setContentTitle(climbName ?: contentTitleFallback)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .build()
    }

    private fun launchAppIntent(): PendingIntent? {
        val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
        return PendingIntent.getActivity(this, REQ_CONTENT, launch, pendingFlags())
    }

    private fun actionPendingIntent(navAction: String, requestCode: Int): PendingIntent {
        val intent = Intent(this, BoardSessionActionReceiver::class.java).apply {
            action = navAction
            putExtra(EXTRA_CURRENT_INDEX, currentIndex)
            putExtra(EXTRA_CORRELATION_ID, java.util.UUID.randomUUID().toString())
        }
        return PendingIntent.getBroadcast(this, requestCode, intent, pendingFlags())
    }

    private fun pendingFlags(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
    }

    companion object {
        const val CHANNEL_ID = "boardsesh_session"
        const val NOTIFICATION_ID = 4711
        private const val TAG = "BoardSession"

        const val ACTION_START = "com.boardsesh.liveactivity.action.START"
        const val ACTION_UPDATE = "com.boardsesh.liveactivity.action.UPDATE"
        const val ACTION_STOP = "com.boardsesh.liveactivity.action.STOP"
        const val ACTION_NAV_PREVIOUS = "com.boardsesh.liveactivity.action.NAV_PREVIOUS"
        const val ACTION_NAV_NEXT = "com.boardsesh.liveactivity.action.NAV_NEXT"

        const val EXTRA_CHANNEL_NAME = "channelName"
        const val EXTRA_CHANNEL_DESC = "channelDescription"
        const val EXTRA_TITLE_FALLBACK = "contentTitleFallback"
        const val EXTRA_PREV_LABEL = "previousLabel"
        const val EXTRA_NEXT_LABEL = "nextLabel"
        const val EXTRA_CLIMB_NAME = "climbName"
        const val EXTRA_SUBTITLE = "subtitle"
        const val EXTRA_HAS_NEXT = "hasNext"
        const val EXTRA_HAS_PREVIOUS = "hasPrevious"
        const val EXTRA_CURRENT_INDEX = "currentIndex"
        const val EXTRA_CORRELATION_ID = "correlationId"

        private const val REQ_PREVIOUS = 0
        private const val REQ_NEXT = 1
        private const val REQ_CONTENT = 2
    }
}
