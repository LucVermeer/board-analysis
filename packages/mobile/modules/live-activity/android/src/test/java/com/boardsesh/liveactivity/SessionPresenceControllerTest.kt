package com.boardsesh.liveactivity

import android.Manifest
import android.app.Application
import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * Lifecycle of the logical `sessionActive` flag — the source of the
 * "notification freezes mid-session" and "JS thinks the session started when it
 * didn't" bugs. The controller takes injectable startForegroundService /
 * startService seams so the ForegroundServiceStartNotAllowedException and
 * BackgroundServiceStartNotAllowedException paths are drivable without a live
 * service.
 */
@RunWith(RobolectricTestRunner::class)
class SessionPresenceControllerTest {

    private val application: Application = ApplicationProvider.getApplicationContext()

    // Records both delivery seams into one ordered list so intent-content
    // assertions don't care which seam carried a given action. Tests that assert
    // the delivery MECHANISM (START/STOP via startForegroundService, UPDATE via
    // startService) inject the seams separately instead.
    private fun recordingController(): Pair<SessionPresenceController, MutableList<Intent>> {
        val launchedIntents = mutableListOf<Intent>()
        val record: (Context, Intent) -> Unit = { _, intent -> launchedIntents.add(intent) }
        val controller = SessionPresenceController(
            application,
            startForegroundService = record,
            startService = record,
        )
        return controller to launchedIntents
    }

    // Stands in for ForegroundServiceStartNotAllowedException (API 31+); the catch
    // handles plain Exception, so the type doesn't matter for the flag logic.
    private fun fgsNotAllowed(): Exception = IllegalStateException("ForegroundServiceStartNotAllowedException")

    // Stands in for BackgroundServiceStartNotAllowedException (API 31+), thrown by
    // startService when the process is no longer foreground-exempt.
    private fun bgServiceNotAllowed(): Exception = IllegalStateException("BackgroundServiceStartNotAllowedException")

    private fun updateOptions(): SessionUpdateOptions = SessionUpdateOptions().apply {
        climbName = "Test Climb"
        climbDifficulty = "V5"
        angle = 40
    }

    @Test
    @Config(sdk = [30])
    fun `startSession activates and dispatches a START intent`() {
        val (controller, launchedIntents) = recordingController()

        controller.startSession(null)

        assertTrue(controller.sessionActive)
        assertEquals(1, launchedIntents.size)
        assertEquals(BoardSessionService.ACTION_START, launchedIntents.single().action)
    }

    @Test
    @Config(sdk = [34])
    fun `startSession without BLUETOOTH_CONNECT on API 34 throws and stays inactive`() {
        shadowOf(application).denyPermissions(Manifest.permission.BLUETOOTH_CONNECT)
        val (controller, launchedIntents) = recordingController()

        assertThrows(MissingBluetoothPermissionException::class.java) {
            controller.startSession(null)
        }

        assertFalse(controller.sessionActive)
        assertTrue(launchedIntents.isEmpty())
    }

    @Test
    @Config(sdk = [34])
    fun `startSession with BLUETOOTH_CONNECT on API 34 activates`() {
        shadowOf(application).grantPermissions(Manifest.permission.BLUETOOTH_CONNECT)
        val (controller, launchedIntents) = recordingController()

        controller.startSession(null)

        assertTrue(controller.sessionActive)
        assertEquals(1, launchedIntents.size)
    }

    @Test
    @Config(sdk = [31])
    fun `startup-path launch failure clears sessionActive and rejects startSession`() {
        val startupFailure = fgsNotAllowed()
        val controller = SessionPresenceController(
            application,
            startForegroundService = { _, _ -> throw startupFailure },
        )

        val thrown = assertThrows(SessionForegroundServiceStartException::class.java) {
            controller.startSession(null)
        }

        // The initial promotion never landed, so later updates must not keep
        // retrying a service that never started. JS also needs the rejection so
        // its active ref resets and a later foregrounded start can retry.
        assertFalse(controller.sessionActive)
        assertSame(startupFailure, thrown.cause)
    }

    @Test
    @Config(sdk = [31])
    fun `updateActivity delivers via startService, never startForegroundService`() {
        val fgsIntents = mutableListOf<Intent>()
        val serviceIntents = mutableListOf<Intent>()
        val controller = SessionPresenceController(
            application,
            startForegroundService = { _, intent -> fgsIntents.add(intent) },
            startService = { _, intent -> serviceIntents.add(intent) },
        )

        controller.startSession(null)
        controller.updateActivity(updateOptions())

        // START promotes via startForegroundService (the one legitimate FGS
        // start). The UPDATE must go through startService so it never re-arms a
        // startForeground() deadline — the accumulation of those per-update
        // deadlines was the ForegroundServiceDidNotStartInTimeException in #3188.
        assertEquals(listOf(BoardSessionService.ACTION_START), fgsIntents.map { it.action })
        assertEquals(listOf(BoardSessionService.ACTION_UPDATE), serviceIntents.map { it.action })
    }

    @Test
    @Config(sdk = [31])
    fun `update-path startService failure keeps sessionActive`() {
        var failNextUpdate = false
        val updateIntents = mutableListOf<Intent>()
        val controller = SessionPresenceController(
            application,
            startForegroundService = { _, _ -> },
            startService = { _, intent ->
                if (failNextUpdate) throw bgServiceNotAllowed()
                updateIntents.add(intent)
            },
        )

        controller.startSession(null)
        assertTrue(controller.sessionActive)

        // Process no longer foreground-exempt: the UPDATE startService throws, but
        // the service was already promoted — the session must stay active (the
        // regression this guards; clearing here permanently froze the notification).
        failNextUpdate = true
        controller.updateActivity(updateOptions())
        assertTrue(controller.sessionActive)

        // Back in the foreground, a later update refreshes the notification.
        failNextUpdate = false
        controller.updateActivity(updateOptions())
        assertEquals(BoardSessionService.ACTION_UPDATE, updateIntents.last().action)
    }

    @Test
    @Config(sdk = [30])
    fun `updateActivity includes flat board angle in the subtitle`() {
        val (controller, launchedIntents) = recordingController()
        controller.startSession(null)

        controller.updateActivity(updateOptions().apply { angle = 0 })

        val updateIntent = launchedIntents.last()
        assertEquals(BoardSessionService.ACTION_UPDATE, updateIntent.action)
        assertEquals("V5 · 0°", updateIntent.getStringExtra(BoardSessionService.EXTRA_SUBTITLE))
    }

    @Test
    @Config(sdk = [30])
    fun `updateActivity omits the degree marker for a negative sentinel angle`() {
        val (controller, launchedIntents) = recordingController()
        controller.startSession(null)

        // angle < 0 is the "no angle" sentinel (the >= 0 guard renders a flat 0°
        // but suppresses negatives), so the subtitle is the difficulty alone.
        controller.updateActivity(updateOptions().apply { angle = -1 })

        assertEquals("V5", launchedIntents.last().getStringExtra(BoardSessionService.EXTRA_SUBTITLE))
    }

    @Test
    @Config(sdk = [30])
    fun `startSession forwards the initial board connection and holder`() {
        val (controller, launchedIntents) = recordingController()

        controller.startSession(
            StartSessionOptions().apply {
                boardConnection = "heldByPeer"
                holderDisplayName = "Alex"
            },
        )

        val start = launchedIntents.single()
        assertEquals(BoardSessionService.ACTION_START, start.action)
        assertEquals("heldByPeer", start.getStringExtra(BoardSessionService.EXTRA_BOARD_CONNECTION))
        assertEquals("Alex", start.getStringExtra(BoardSessionService.EXTRA_HOLDER_NAME))
    }

    @Test
    @Config(sdk = [30])
    fun `updateActivity forwards ownership and the on-device thumbnail paths`() {
        val (controller, launchedIntents) = recordingController()
        controller.startSession(null)

        controller.updateActivity(
            updateOptions().apply {
                currentIndex = 1
                totalClimbs = 3
                boardConnection = "heldByPeer"
                holderDisplayName = "Sam"
                androidThumbnailOverlayPath = "file:///cache/overlay.png"
                androidThumbnailBackgroundPaths = listOf("/assets/kilter-bg.png", "/assets/kilter-holds.png")
            },
        )

        val update = launchedIntents.last()
        assertEquals(BoardSessionService.ACTION_UPDATE, update.action)
        assertEquals(3, update.getIntExtra(BoardSessionService.EXTRA_TOTAL_CLIMBS, -1))
        assertEquals("heldByPeer", update.getStringExtra(BoardSessionService.EXTRA_BOARD_CONNECTION))
        assertEquals("Sam", update.getStringExtra(BoardSessionService.EXTRA_HOLDER_NAME))
        assertEquals("file:///cache/overlay.png", update.getStringExtra(BoardSessionService.EXTRA_OVERLAY_PATH))
        assertEquals(
            arrayListOf("/assets/kilter-bg.png", "/assets/kilter-holds.png"),
            update.getStringArrayListExtra(BoardSessionService.EXTRA_BACKGROUND_PATHS),
        )
    }

    @Test
    @Config(sdk = [30])
    fun `updateActivity before a session starts is a no-op`() {
        val (controller, launchedIntents) = recordingController()

        controller.updateActivity(updateOptions())

        assertFalse(controller.sessionActive)
        assertTrue(launchedIntents.isEmpty())
    }

    @Test
    @Config(sdk = [30])
    fun `endSession deactivates and tears down via ACTION_STOP`() {
        val (controller, launchedIntents) = recordingController()
        controller.startSession(null)

        controller.endSession()

        // Teardown must go through the service's promote-then-stop ACTION_STOP
        // path (not stopService): a start token from startSession may still be
        // pending, and bypassing onStartCommand leaves it dangling — the
        // ForegroundServiceDidNotStartInTimeException kill on Android 12-14.
        assertFalse(controller.sessionActive)
        assertEquals(BoardSessionService.ACTION_STOP, launchedIntents.last().action)
    }

    @Test
    @Config(sdk = [31])
    fun `endSession falls back to stopService when ACTION_STOP delivery throws`() {
        var failNextLaunch = false
        val controller = SessionPresenceController(
            application,
            startForegroundService = { _, _ ->
                if (failNextLaunch) throw fgsNotAllowed()
            },
        )
        controller.startSession(null)

        // Service already gone and app backgrounded: the ACTION_STOP delivery
        // throws, but the session must still end locally without rethrowing.
        failNextLaunch = true
        controller.endSession()

        assertFalse(controller.sessionActive)
    }

    @Test
    @Config(sdk = [30])
    fun `endSession without an active session skips the foreground start`() {
        val (controller, launchedIntents) = recordingController()

        // No session window means no pending start token; ACTION_STOP via
        // startForegroundService would briefly promote a fresh service just to
        // stop it (a notification flash), so this path must stay stopService.
        controller.endSession()

        assertFalse(controller.sessionActive)
        assertTrue(launchedIntents.isEmpty())
    }
}
