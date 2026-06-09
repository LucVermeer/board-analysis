package com.boardsesh.liveactivity

import android.content.Intent
import android.content.pm.ServiceInfo
import androidx.core.app.ServiceCompat
import androidx.test.core.app.ApplicationProvider
import io.mockk.every
import io.mockk.just
import io.mockk.mockkStatic
import io.mockk.Runs
import io.mockk.unmockkStatic
import io.mockk.verify
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * The startInForeground retry path: a connectedDevice FGS promotes with the typed
 * call, and on API < 34 falls back to an untyped promotion if the typed one fails;
 * on API 34+ there is no untyped fallback (the module gates the start on
 * BLUETOOTH_CONNECT instead). ServiceCompat.startForeground is statically mocked so
 * each type's outcome is controllable without a real foreground promotion.
 */
@RunWith(RobolectricTestRunner::class)
class BoardSessionServiceTest {

    private val connectedDevice = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE

    @Before
    fun setUp() {
        mockkStatic(ServiceCompat::class)
        // stopForeground is invoked on the teardown path; stub so the static mock
        // doesn't reject the unstubbed call.
        every { ServiceCompat.stopForeground(any(), any<Int>()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkStatic(ServiceCompat::class)
    }

    private fun startService(action: String = BoardSessionService.ACTION_START): BoardSessionService {
        val intent = Intent(ApplicationProvider.getApplicationContext(), BoardSessionService::class.java)
            .apply { this.action = action }
        return Robolectric.buildService(BoardSessionService::class.java, intent).create().startCommand(0, 1).get()
    }

    @Test
    @Config(sdk = [31])
    fun `falls back to an untyped promotion when the typed start fails below API 34`() {
        every { ServiceCompat.startForeground(any(), any(), any(), eq(connectedDevice)) } throws
            IllegalStateException("typed start not allowed")
        every { ServiceCompat.startForeground(any(), any(), any(), eq(0)) } just Runs

        val service = startService()

        verify(exactly = 1) { ServiceCompat.startForeground(any(), any(), any(), eq(connectedDevice)) }
        verify(exactly = 1) { ServiceCompat.startForeground(any(), any(), any(), eq(0)) }
        // Promotion ultimately succeeded, so the service keeps running.
        assertFalse(shadowOf(service).isStoppedBySelf)
    }

    @Test
    @Config(sdk = [31])
    fun `a successful typed promotion skips the untyped fallback`() {
        every { ServiceCompat.startForeground(any(), any(), any(), eq(connectedDevice)) } just Runs
        every { ServiceCompat.startForeground(any(), any(), any(), eq(0)) } just Runs

        val service = startService()

        verify(exactly = 1) { ServiceCompat.startForeground(any(), any(), any(), eq(connectedDevice)) }
        verify(exactly = 0) { ServiceCompat.startForeground(any(), any(), any(), eq(0)) }
        assertFalse(shadowOf(service).isStoppedBySelf)
    }

    @Test
    @Config(sdk = [34])
    fun `does not fall back to an untyped promotion on API 34 and stops on failure`() {
        every { ServiceCompat.startForeground(any(), any(), any(), eq(connectedDevice)) } throws
            IllegalStateException("typed start not allowed")
        every { ServiceCompat.startForeground(any(), any(), any(), eq(0)) } just Runs

        val service = startService()

        verify(exactly = 1) { ServiceCompat.startForeground(any(), any(), any(), eq(connectedDevice)) }
        // Type-0 on a typed service throws MissingForegroundServiceTypeException on
        // API 34+, so the retry must not be attempted.
        verify(exactly = 0) { ServiceCompat.startForeground(any(), any(), any(), eq(0)) }
        // Failed promotion tears the service down rather than risk
        // ForegroundServiceDidNotStartInTimeException.
        assertTrue(shadowOf(service).isStoppedBySelf)
    }

    @Test
    @Config(sdk = [31])
    fun `ACTION_STOP tears the service down after promoting`() {
        every { ServiceCompat.startForeground(any(), any(), any(), any()) } just Runs

        val service = startService(BoardSessionService.ACTION_STOP)

        assertTrue(shadowOf(service).isStoppedBySelf)
    }
}
