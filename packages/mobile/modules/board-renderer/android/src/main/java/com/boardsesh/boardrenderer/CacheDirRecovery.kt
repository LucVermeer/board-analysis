package com.boardsesh.boardrenderer

import java.io.File
import java.io.IOException

/**
 * The overlay PNG cache lives under `context.cacheDir`, which Android is free to
 * reclaim at any time under storage pressure — including while our process is
 * alive. The directory is created once when [BoardRendererModule.cacheDir] is
 * first touched, so once the OS deletes it every later write fails with
 * `FileNotFoundException` (ENOENT on the parent) and the render promise rejects:
 * hold overlays silently stop drawing until the app is restarted.
 *
 * This re-creates the directory and retries the write exactly once.
 */
object CacheDirRecovery {
    /**
     * Runs [action]. If it fails with an [IOException] *and* [cacheDir] is
     * missing, re-creates the directory and runs [action] one more time.
     *
     * `mkdirs()` returns false when the directory already exists, so an
     * IO failure with the directory still in place (out of disk space, a
     * read-only volume) propagates immediately instead of being retried —
     * the retry is bounded to a single extra attempt either way.
     */
    fun <T> retryOnceAfterRecreating(cacheDir: File, action: () -> T): T {
        return try {
            action()
        } catch (writeFailure: IOException) {
            if (!cacheDir.mkdirs()) throw writeFailure
            android.util.Log.w(
                "BoardRenderer",
                "Cache dir ${cacheDir.absolutePath} had vanished; re-created it and retrying the write",
                writeFailure
            )
            action()
        }
    }
}
