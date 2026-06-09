package com.boardsesh.liveactivity

import android.Manifest
import android.app.Application
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
 * didn't" bugs. The controller takes an injectable startForegroundService seam so
 * the ForegroundServiceStartNotAllowedException path is drivable without a live
 * service.
 */
@RunWith(RobolectricTestRunner::class)
class SessionPresenceControllerTest {

    private val application: Application = ApplicationProvider.getApplicationContext()

    private fun recordingController(): Pair<SessionPresenceController, MutableList<Intent>> {
        val launchedIntents = mutableListOf<Intent>()
        val controller = SessionPresenceController(application) { _, intent -> launchedIntents.add(intent) }
        return controller to launchedIntents
    }

    // Stands in for ForegroundServiceStartNotAllowedException (API 31+); launchService
    // catches plain Exception, so the type doesn't matter for the flag logic.
    private fun fgsNotAllowed(): Exception = IllegalStateException("ForegroundServiceStartNotAllowedException")

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
    fun `startup-path launch failure clears sessionActive`() {
        val controller = SessionPresenceController(application) { _, _ -> throw fgsNotAllowed() }

        controller.startSession(null)

        // The initial promotion never landed, so later updates must not keep
        // retrying a service that never started.
        assertFalse(controller.sessionActive)
    }

    @Test
    @Config(sdk = [31])
    fun `update-path launch failure keeps sessionActive`() {
        var failNextLaunch = false
        val launchedIntents = mutableListOf<Intent>()
        val controller = SessionPresenceController(application) { _, intent ->
            if (failNextLaunch) throw fgsNotAllowed()
            launchedIntents.add(intent)
        }

        controller.startSession(null)
        assertTrue(controller.sessionActive)

        // App briefly backgrounds: the UPDATE re-delivery throws, but the service
        // is already running — the session must stay active (the regression this
        // PR fixes; clearing here permanently froze the notification).
        failNextLaunch = true
        controller.updateActivity(updateOptions())
        assertTrue(controller.sessionActive)

        // Back in the foreground, a later update refreshes the notification.
        failNextLaunch = false
        controller.updateActivity(updateOptions())
        assertEquals(BoardSessionService.ACTION_UPDATE, launchedIntents.last().action)
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
    fun `endSession deactivates the session`() {
        val (controller, _) = recordingController()
        controller.startSession(null)

        controller.endSession()

        assertFalse(controller.sessionActive)
    }
}
