package com.boardsesh.boardrenderer

import java.io.FileNotFoundException
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

/**
 * Covers [CacheMissRecovery] in isolation. The guard's single call site —
 * `CacheMissRecovery.retryOnceOnFileNotFound { renderOverlayOnce(...) }`
 * wrapping the whole cache-check-render-write pipeline in
 * `BoardRendererModule.renderOverlay` — is *not* covered here, for the same
 * reason [CacheDirRecoveryTest] doesn't cover its own call site: exercising
 * it needs a real `Bitmap` (JNI) plus a `Module` appContext, i.e. a
 * Robolectric harness, which is disproportionate for this fix. Keep the
 * wrapper at that one call site; deleting it re-opens #4107 without failing
 * anything below.
 */
class CacheMissRecoveryTest {
    @Test
    fun `retries exactly once when the action throws FileNotFoundException`() {
        var attempts = 0
        var recoveredFrom: FileNotFoundException? = null
        val originalFailure = FileNotFoundException("cache file vanished")

        val result = CacheMissRecovery.retryOnceOnFileNotFound(
            onRecovered = { failure -> recoveredFrom = failure },
        ) {
            attempts++
            if (attempts == 1) throw originalFailure
            "file:///cache/climb.png"
        }

        assertEquals("action ran once, failed, then ran again", 2, attempts)
        assertEquals("file:///cache/climb.png", result)
        assertSame("the call site gets the original failure to log", originalFailure, recoveredFrom)
    }

    @Test
    fun `a second FileNotFoundException propagates instead of looping`() {
        var attempts = 0

        val failure = try {
            CacheMissRecovery.retryOnceOnFileNotFound {
                attempts++
                throw FileNotFoundException("still gone")
            }
            null
        } catch (thrown: FileNotFoundException) {
            thrown
        }

        assertEquals("retry is bounded to one extra attempt", 2, attempts)
        assertEquals("still gone", failure?.message)
    }

    @Test
    fun `a broader IOException is not retried`() {
        var attempts = 0
        var recovered = false
        val originalFailure = IOException("disk full")

        val failure = try {
            CacheMissRecovery.retryOnceOnFileNotFound(
                onRecovered = { recovered = true },
            ) {
                attempts++
                throw originalFailure
            }
            null
        } catch (thrown: IOException) {
            thrown
        }

        assertEquals("no retry for a non-FileNotFoundException failure", 1, attempts)
        assertFalse("nothing to log when there was no recovery", recovered)
        assertSame(originalFailure, failure)
    }

    @Test
    fun `passes the value through untouched on the happy path`() {
        var attempts = 0
        var recoveredFrom: FileNotFoundException? = null

        val result = CacheMissRecovery.retryOnceOnFileNotFound(
            onRecovered = { failure -> recoveredFrom = failure },
        ) {
            attempts++
            "file:///cache/climb.png"
        }

        assertEquals(1, attempts)
        assertEquals("file:///cache/climb.png", result)
        assertNull("no recovery on the hot path", recoveredFrom)
    }
}
