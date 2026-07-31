package com.boardsesh.boardrenderer

import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class CacheDirRecoveryTest {
    private lateinit var cacheDir: File

    @Before
    fun createCacheDir() {
        cacheDir = File.createTempFile("board-thumbnails", "").let { placeholder ->
            placeholder.delete()
            placeholder.also { it.mkdirs() }
        }
    }

    @After
    fun removeCacheDir() {
        cacheDir.deleteRecursively()
    }

    /**
     * The real failure: the OS reclaimed the cache dir mid-session, so the
     * first write fails with FileNotFoundException. Reverting the guard makes
     * that first failure propagate and the PNG never lands.
     */
    @Test
    fun `recreates a reclaimed cache dir and lands the write on the retry`() {
        val outputFile = File(cacheDir, "climb.png")
        assertTrue("precondition: dir was reclaimed", cacheDir.deleteRecursively())

        var attempts = 0
        val writtenPath = CacheDirRecovery.retryOnceAfterRecreating(cacheDir) {
            attempts++
            FileOutputStream(outputFile).use { it.write(byteArrayOf(1, 2, 3)) }
            outputFile.absolutePath
        }

        assertEquals("write is retried exactly once", 2, attempts)
        assertTrue("cache dir was re-created", cacheDir.isDirectory)
        assertEquals(outputFile.absolutePath, writtenPath)
        assertTrue("PNG landed on disk", outputFile.exists())
        assertEquals(3, outputFile.length())
    }

    @Test
    fun `does not retry when the cache dir is still present`() {
        var attempts = 0

        val failure = try {
            CacheDirRecovery.retryOnceAfterRecreating(cacheDir) {
                attempts++
                throw IOException("No space left on device")
            }
            null
        } catch (thrown: IOException) {
            thrown
        }

        assertEquals("a healthy dir means the failure is not transient", 1, attempts)
        assertEquals("No space left on device", failure?.message)
    }

    @Test
    fun `a second failure propagates instead of looping`() {
        var attempts = 0
        assertTrue(cacheDir.deleteRecursively())

        val failure = try {
            CacheDirRecovery.retryOnceAfterRecreating(cacheDir) {
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
    fun `passes the value through untouched on the happy path`() {
        var attempts = 0
        val result = CacheDirRecovery.retryOnceAfterRecreating(cacheDir) {
            attempts++
            "file://${cacheDir.absolutePath}/climb.png"
        }

        assertEquals(1, attempts)
        assertEquals("file://${cacheDir.absolutePath}/climb.png", result)
        assertFalse(File(cacheDir, "climb.png").exists())
    }
}
