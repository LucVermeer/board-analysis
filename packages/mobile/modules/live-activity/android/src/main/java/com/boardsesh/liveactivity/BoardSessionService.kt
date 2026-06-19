package com.boardsesh.liveactivity

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.util.LruCache
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * Foreground service (type connectedDevice) that keeps the react-native-ble-plx
 * connection alive while Boardsesh is backgrounded, and shows an ongoing
 * Material 3 notification with the current climb's render, queue position, a
 * lightbulb, and Previous/Next controls. The Android counterpart to the iOS Live
 * Activity. Started/updated/stopped by SessionPresenceModule via intents; its
 * action buttons broadcast to BoardSessionActionReceiver.
 *
 * The notification is a [NotificationCompat.DecoratedCustomViewStyle]: custom
 * RemoteViews own the content (portrait climb thumbnail + climb info), while the
 * system renders the chrome and the Previous/lightbulb/Next action buttons (so
 * they pick up Material You theming and hiding one is just "don't add it"). The
 * lightbulb + control visibility follow the tri-state [boardConnection] —
 * connectedByMe shows the lit bulb + Previous/Next; heldByPeer/disconnected show
 * only the outline bulb (tap to reconnect) and, for heldByPeer, "<name> is on
 * the wall".
 */
class BoardSessionService : Service() {

    private var channelName: String = "Active climbing session"
    private var channelDescription: String = ""
    // True once ACTION_START delivered a localized channel name. Other entries
    // (UPDATE/STOP/null-intent restart on a cold process) still carry the
    // English defaults above and must never rename an existing channel.
    private var channelNameLocalized: Boolean = false
    private var contentTitleFallback: String = "Climbing session"
    private var previousLabel: String = "Previous"
    private var nextLabel: String = "Next"
    private var relightLabel: String = "Relight wall"
    private var reconnectLabel: String = "Connect to board"
    private var onWallTemplate: String = "{{name}} is on the wall"

    private var climbName: String? = null
    private var subtitle: String? = null
    private var hasNext: Boolean = false
    private var hasPrevious: Boolean = false
    private var currentIndex: Int = 0
    private var totalClimbs: Int = 0
    private var climbUuid: String? = null
    private var boardConnection: String = CONNECTION_CONNECTED_BY_ME
    private var holderDisplayName: String? = null

    // Board config (set on ACTION_START) → board-render thumbnail URL.
    private var serverUrl: String = ""
    private var boardName: String = ""
    private var layoutId: Int = 0
    private var sizeId: Int = 0
    private var setIds: String = ""

    // climbUuid → render frames, refreshed from the full updateActivity payload so
    // a lightweight updateActivityClimb (empty queue) can still resolve the
    // current climb's thumbnail.
    private val queueFrames: MutableMap<String, String> = HashMap()

    // The render URL whose bitmap the notification is currently displaying; the
    // async fetch only applies its result if this still matches (stale guard).
    @Volatile
    private var currentImageKey: String? = null

    @Volatile
    private var foregrounded: Boolean = false

    private val mainHandler: Handler by lazy { Handler(Looper.getMainLooper()) }

    // Injectable seams (mirror SessionPresenceController.startForegroundService) so
    // a Robolectric test can drive the async image path on the calling thread.
    internal var imageExecutor: Executor = sharedImageExecutor
    internal var postToMain: (Runnable) -> Unit = { mainHandler.post(it) }
    internal var imageFetcher: (String) -> Bitmap? = { url -> fetchBitmap(url) }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Apply intent state first (cheap, can't throw) so it never eats into the
        // 5 s startForeground() deadline.
        when (intent?.action) {
            ACTION_START -> {
                intent.getStringExtra(EXTRA_CHANNEL_NAME)?.let {
                    channelName = it
                    channelNameLocalized = true
                }
                channelDescription = intent.getStringExtra(EXTRA_CHANNEL_DESC) ?: channelDescription
                contentTitleFallback = intent.getStringExtra(EXTRA_TITLE_FALLBACK) ?: contentTitleFallback
                previousLabel = intent.getStringExtra(EXTRA_PREV_LABEL) ?: previousLabel
                nextLabel = intent.getStringExtra(EXTRA_NEXT_LABEL) ?: nextLabel
                relightLabel = intent.getStringExtra(EXTRA_RELIGHT_LABEL) ?: relightLabel
                reconnectLabel = intent.getStringExtra(EXTRA_RECONNECT_LABEL) ?: reconnectLabel
                onWallTemplate = intent.getStringExtra(EXTRA_ON_WALL_TEMPLATE) ?: onWallTemplate
                serverUrl = intent.getStringExtra(EXTRA_SERVER_URL) ?: serverUrl
                boardName = intent.getStringExtra(EXTRA_BOARD_NAME) ?: boardName
                layoutId = intent.getIntExtra(EXTRA_LAYOUT_ID, layoutId)
                sizeId = intent.getIntExtra(EXTRA_SIZE_ID, sizeId)
                setIds = intent.getStringExtra(EXTRA_SET_IDS) ?: setIds
                boardConnection = intent.getStringExtra(EXTRA_BOARD_CONNECTION) ?: boardConnection
                holderDisplayName = intent.getStringExtra(EXTRA_HOLDER_NAME)
            }
            ACTION_UPDATE -> {
                climbName = intent.getStringExtra(EXTRA_CLIMB_NAME) ?: climbName
                subtitle = intent.getStringExtra(EXTRA_SUBTITLE) ?: subtitle
                hasNext = intent.getBooleanExtra(EXTRA_HAS_NEXT, hasNext)
                hasPrevious = intent.getBooleanExtra(EXTRA_HAS_PREVIOUS, hasPrevious)
                currentIndex = intent.getIntExtra(EXTRA_CURRENT_INDEX, currentIndex)
                totalClimbs = intent.getIntExtra(EXTRA_TOTAL_CLIMBS, totalClimbs)
                climbUuid = intent.getStringExtra(EXTRA_CLIMB_UUID) ?: climbUuid
                boardConnection = intent.getStringExtra(EXTRA_BOARD_CONNECTION) ?: boardConnection
                // Absent extra ⇒ no peer holder ⇒ clear (the controller only sends
                // it for heldByPeer).
                holderDisplayName = intent.getStringExtra(EXTRA_HOLDER_NAME)
                applyQueueFrames(intent)
            }
        }

        // Promote on EVERY entry, including ACTION_STOP and the null-intent
        // restart: the system may hold a start token from startForegroundService()
        // and crashes with ForegroundServiceDidNotStartInTimeException if we don't
        // call startForeground() in time.
        val promoted = startInForeground()

        if (intent?.action == ACTION_STOP || !promoted) {
            foregrounded = false
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        foregrounded = true
        // Network never runs before promotion: the notification was already built
        // (with the cached bitmap or a placeholder) and posted above.
        maybeFetchImage()

        // START_NOT_STICKY: don't let the OS recreate the service in the background
        // after a kill — a null-intent restart on a frozen/cold-starting process
        // can't promote within 5 s. The JS useLiveActivity effect re-starts the
        // session when the app reopens.
        return START_NOT_STICKY
    }

    private fun applyQueueFrames(intent: Intent) {
        val uuids = intent.getStringArrayListExtra(EXTRA_QUEUE_UUIDS)
        val frameList = intent.getStringArrayListExtra(EXTRA_QUEUE_FRAMES)
        // Empty/absent on the lightweight updateActivityClimb path — keep the
        // cache from the last full update.
        if (uuids == null || frameList == null || uuids.size != frameList.size) return
        queueFrames.clear()
        for (i in uuids.indices) {
            queueFrames[uuids[i]] = frameList[i]
        }
    }

    // Promotes the service to the foreground; returns true on success. Channel
    // creation is best-effort and independent of notification building so the
    // fallback notification still has a channel to post to if buildNotification()
    // throws.
    private fun startInForeground(): Boolean {
        try {
            ensureChannel()
        } catch (error: Exception) {
            Log.w(TAG, "ensureChannel failed: ${error.message}")
        }
        val notification = try {
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
        // On API < 34 a typeless FGS is a valid promotion, so retry to satisfy the
        // contract. On API 34+ type 0 throws MissingForegroundServiceTypeException
        // for a typed service, so the caller gates the start on BLUETOOTH_CONNECT.
        if (type != 0 && Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
            tryStartForeground(notification, 0)
        ) {
            return true
        }
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
        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null) {
            // Re-create only when ACTION_START delivered a fresh localized name
            // that differs — createNotificationChannel on an existing id updates
            // name/description, so a device-locale change doesn't leave the old
            // language in system Settings forever.
            if (!channelNameLocalized || existing.name?.toString() == channelName) return
        }
        val channel = NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_LOW).apply {
            description = channelDescription
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_boardsesh_notification)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(buildContentView(R.layout.notification_session_collapsed))
            .setCustomBigContentView(buildContentView(R.layout.notification_session_expanded))
            .setColor(ContextCompat.getColor(this, R.color.session_accent))
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setContentIntent(launchAppIntent())

        // Controls follow ownership: only the driver (connectedByMe) gets
        // Previous/Next; everyone else gets just the outline bulb to (re)connect.
        if (boardConnection == CONNECTION_CONNECTED_BY_ME) {
            if (hasPrevious) {
                builder.addAction(R.drawable.ic_skip_previous, previousLabel, actionPendingIntent(ACTION_NAV_PREVIOUS, REQ_PREVIOUS))
            }
            builder.addAction(R.drawable.ic_lightbulb_filled, relightLabel, bulbPendingIntent())
            if (hasNext) {
                builder.addAction(R.drawable.ic_skip_next, nextLabel, actionPendingIntent(ACTION_NAV_NEXT, REQ_NEXT))
            }
        } else {
            builder.addAction(R.drawable.ic_lightbulb_outline, reconnectLabel, bulbPendingIntent())
        }
        return builder.build()
    }

    private fun buildContentView(layoutId: Int): RemoteViews {
        val views = RemoteViews(packageName, layoutId)
        views.setTextViewText(R.id.session_title, climbName ?: contentTitleFallback)

        val positionText = if (totalClimbs > 0) "${currentIndex + 1} / $totalClimbs" else ""
        val subtitleText = subtitle?.takeIf { it.isNotBlank() } ?: ""

        if (layoutId == R.layout.notification_session_expanded) {
            views.setTextViewText(R.id.session_subtitle, subtitleText)
            views.setTextViewText(R.id.session_position, positionText)
            val holder = holderDisplayName
            val holderLine = if (boardConnection == CONNECTION_HELD_BY_PEER && !holder.isNullOrBlank()) {
                onWallTemplate.replace("{{name}}", holder)
            } else {
                null
            }
            if (holderLine != null) {
                views.setViewVisibility(R.id.session_holder, android.view.View.VISIBLE)
                views.setTextViewText(R.id.session_holder, holderLine)
            } else {
                views.setViewVisibility(R.id.session_holder, android.view.View.GONE)
            }
        } else {
            // Collapsed: fold position into the subtitle line to fit one row.
            val collapsedSubtitle = listOf(subtitleText, positionText).filter { it.isNotBlank() }.joinToString(" · ")
            views.setTextViewText(R.id.session_subtitle, collapsedSubtitle)
        }

        val bitmap = currentBitmap()
        if (bitmap != null) {
            views.setImageViewBitmap(R.id.session_image, bitmap)
        }
        return views
    }

    // Minimal notification for when buildNotification() throws: no RemoteViews,
    // bitmaps, or extra pending intents, so it can still satisfy the
    // startForeground() contract.
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
        // The JS bridge navigates to the ABSOLUTE queue[currentIndex] (it ignores
        // the action), so send the TARGET index — currentIndex ∓ 1 — not the
        // current one, or both buttons would re-select the current climb (a no-op).
        // An out-of-range target (e.g. Next on the last climb) is dropped by the
        // bridge's range guard.
        val targetIndex = when (navAction) {
            ACTION_NAV_PREVIOUS -> currentIndex - 1
            ACTION_NAV_NEXT -> currentIndex + 1
            else -> currentIndex
        }
        val intent = Intent(this, BoardSessionActionReceiver::class.java).apply {
            action = navAction
            putExtra(EXTRA_CURRENT_INDEX, targetIndex)
            putExtra(EXTRA_CORRELATION_ID, UUID.randomUUID().toString())
        }
        return PendingIntent.getBroadcast(this, requestCode, intent, pendingFlags())
    }

    // The lightbulb carries the current ownership so the receiver can choose
    // reassert (connectedByMe) vs reconnect; the notification is rebuilt on every
    // update, so the extra is always current.
    private fun bulbPendingIntent(): PendingIntent {
        val intent = Intent(this, BoardSessionActionReceiver::class.java).apply {
            action = ACTION_BULB
            putExtra(EXTRA_BOARD_CONNECTION, boardConnection)
            putExtra(EXTRA_CORRELATION_ID, UUID.randomUUID().toString())
        }
        return PendingIntent.getBroadcast(this, REQ_BULB, intent, pendingFlags())
    }

    private fun pendingFlags(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
    }

    // --- Climb thumbnail ---

    // The board-render URL for the current climb, or null when board config or the
    // climb's frames aren't known yet. Mirrors the iOS SharedConstants builder.
    private fun currentRenderUrl(): String? {
        val uuid = climbUuid ?: return null
        val frames = queueFrames[uuid] ?: return null
        if (serverUrl.isBlank() || boardName.isBlank() || setIds.isBlank() || frames.isBlank()) return null
        return Uri.parse("$serverUrl/api/internal/board-render").buildUpon()
            .appendQueryParameter("board_name", boardName)
            .appendQueryParameter("layout_id", layoutId.toString())
            .appendQueryParameter("size_id", sizeId.toString())
            .appendQueryParameter("set_ids", setIds)
            .appendQueryParameter("frames", frames)
            .appendQueryParameter("thumbnail", "1")
            .appendQueryParameter("include_background", "1")
            .build()
            .toString()
    }

    private fun currentBitmap(): Bitmap? = currentRenderUrl()?.let { bitmapCache.get(it) }

    // Fetches the current climb's thumbnail off the main thread (after promotion),
    // then re-posts the notification with it. Never blocks startForeground().
    private fun maybeFetchImage() {
        val url = currentRenderUrl() ?: return
        currentImageKey = url
        if (bitmapCache.get(url) != null) return
        if (!inFlight.add(url)) return
        imageExecutor.execute {
            val bitmap = try {
                imageFetcher(url)
            } catch (error: Exception) {
                Log.w(TAG, "thumbnail fetch failed: ${error.message}")
                null
            } finally {
                inFlight.remove(url)
            }
            if (bitmap == null) return@execute
            bitmapCache.put(url, bitmap)
            postToMain {
                // Stale guard: the climb may have moved on (or the session ended)
                // while the fetch was in flight.
                if (currentImageKey != url || !foregrounded) return@postToMain
                try {
                    getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, buildNotification())
                } catch (error: Exception) {
                    Log.w(TAG, "thumbnail re-post failed: ${error.message}")
                }
            }
        }
    }

    private fun fetchBitmap(url: String): Bitmap? {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = HTTP_TIMEOUT_MS
            readTimeout = HTTP_TIMEOUT_MS
            instanceFollowRedirects = true
            requestMethod = "GET"
        }
        return try {
            connection.connect()
            if (connection.responseCode !in 200..299) return null
            val decoded = connection.inputStream.use { BitmapFactory.decodeStream(it) } ?: return null
            roundCorners(downscale(decoded))
        } finally {
            connection.disconnect()
        }
    }

    // Cap the long side so a non-thumbnail response can't blow the ~1 MB RemoteViews
    // Binder transaction limit (200 px webp ≈ 200 KB; this is a safety net).
    private fun downscale(src: Bitmap): Bitmap {
        val longSide = maxOf(src.width, src.height)
        if (longSide <= MAX_IMAGE_DIMEN) return src
        val scale = MAX_IMAGE_DIMEN.toFloat() / longSide
        return Bitmap.createScaledBitmap(src, (src.width * scale).toInt(), (src.height * scale).toInt(), true)
    }

    private fun roundCorners(src: Bitmap): Bitmap {
        val radius = IMAGE_CORNER_DP * resources.displayMetrics.density
        val output = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val rect = RectF(0f, 0f, src.width.toFloat(), src.height.toFloat())
        canvas.drawRoundRect(rect, radius, radius, paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        canvas.drawBitmap(src, 0f, 0f, paint)
        return output
    }

    companion object {
        const val CHANNEL_ID = "boardsesh_session"
        const val NOTIFICATION_ID = 4711
        private const val TAG = "BoardSession"

        private const val HTTP_TIMEOUT_MS = 8000
        private const val MAX_IMAGE_DIMEN = 256
        private const val IMAGE_CORNER_DP = 8f
        private const val BITMAP_CACHE_ENTRIES = 8

        const val ACTION_START = "com.boardsesh.liveactivity.action.START"
        const val ACTION_UPDATE = "com.boardsesh.liveactivity.action.UPDATE"
        const val ACTION_STOP = "com.boardsesh.liveactivity.action.STOP"
        const val ACTION_NAV_PREVIOUS = "com.boardsesh.liveactivity.action.NAV_PREVIOUS"
        const val ACTION_NAV_NEXT = "com.boardsesh.liveactivity.action.NAV_NEXT"
        const val ACTION_BULB = "com.boardsesh.liveactivity.action.BULB"

        const val EXTRA_CHANNEL_NAME = "channelName"
        const val EXTRA_CHANNEL_DESC = "channelDescription"
        const val EXTRA_TITLE_FALLBACK = "contentTitleFallback"
        const val EXTRA_PREV_LABEL = "previousLabel"
        const val EXTRA_NEXT_LABEL = "nextLabel"
        const val EXTRA_RELIGHT_LABEL = "relightLabel"
        const val EXTRA_RECONNECT_LABEL = "reconnectLabel"
        const val EXTRA_ON_WALL_TEMPLATE = "onWallTemplate"
        const val EXTRA_CLIMB_NAME = "climbName"
        const val EXTRA_SUBTITLE = "subtitle"
        const val EXTRA_HAS_NEXT = "hasNext"
        const val EXTRA_HAS_PREVIOUS = "hasPrevious"
        const val EXTRA_CURRENT_INDEX = "currentIndex"
        const val EXTRA_TOTAL_CLIMBS = "totalClimbs"
        const val EXTRA_CLIMB_UUID = "climbUuid"
        const val EXTRA_BOARD_CONNECTION = "boardConnection"
        const val EXTRA_HOLDER_NAME = "holderDisplayName"
        const val EXTRA_CORRELATION_ID = "correlationId"
        const val EXTRA_SERVER_URL = "serverUrl"
        const val EXTRA_BOARD_NAME = "boardName"
        const val EXTRA_LAYOUT_ID = "layoutId"
        const val EXTRA_SIZE_ID = "sizeId"
        const val EXTRA_SET_IDS = "setIds"
        const val EXTRA_QUEUE_UUIDS = "queueUuids"
        const val EXTRA_QUEUE_FRAMES = "queueFrames"

        const val CONNECTION_CONNECTED_BY_ME = "connectedByMe"
        const val CONNECTION_HELD_BY_PEER = "heldByPeer"
        const val CONNECTION_DISCONNECTED = "disconnected"

        private const val REQ_PREVIOUS = 0
        private const val REQ_NEXT = 1
        private const val REQ_CONTENT = 2
        private const val REQ_BULB = 3

        // Process-static so a rapid stop/start keeps thumbnails warm (mirrors the
        // iOS ThumbnailFetcher's persistent cache intent) and so a single worker
        // thread serves every service instance instead of leaking one per restart.
        private val bitmapCache = LruCache<String, Bitmap>(BITMAP_CACHE_ENTRIES)
        private val inFlight: MutableSet<String> = ConcurrentHashMap.newKeySet()
        private val sharedImageExecutor: Executor = Executors.newSingleThreadExecutor()

        // The cache + in-flight set are process-static; clear them between tests so
        // one test's warmed thumbnail can't turn another's expected fetch into a
        // cache hit.
        internal fun resetImageStateForTest() {
            bitmapCache.evictAll()
            inFlight.clear()
        }
    }
}
