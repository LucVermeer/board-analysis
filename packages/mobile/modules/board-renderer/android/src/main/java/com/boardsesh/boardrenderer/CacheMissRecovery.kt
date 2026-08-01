package com.boardsesh.boardrenderer

import java.io.FileNotFoundException
import java.io.IOException

/**
 * Bounds retry for the *whole* overlay-cache pipeline (fast-path check,
 * render, and write), not just the write step [CacheDirRecovery] already
 * guards.
 *
 * #4107: even with #4041's directory-recreation retry and #3748's atomic
 * write, a single retry can still lose to *sustained* storage pressure —
 * the just-recreated directory (or a freshly created temp file inside it)
 * can vanish a second time before the retried write lands. That second
 * failure was previously unguarded and reached JS as a rejected
 * `renderHoldsOverlay` promise. Investigation for #4107 also confirmed the
 * fast-path cache-hit check (`outputFile.exists()` / `.length()` /
 * `.setLastModified()`) is metadata-only and never throws on its own — so
 * this wrapper exists to survive a second write-side vanish, and as
 * defense-in-depth if a future change to the fast path ever adds a real
 * read.
 *
 * Deliberately narrower than [CacheDirRecovery]: this only retries
 * [FileNotFoundException] specifically — "the cache file/dir isn't there
 * right now" — not the broader [IOException] contract [CacheDirRecovery]
 * accepts (which also covers e.g. an out-of-space failure with the
 * directory in place the whole time). A vanished cache entry is recoverable
 * by re-rendering; an out-of-space condition usually isn't, and silently
 * retrying the entire pipeline for it would double the wasted work without
 * fixing anything. [CacheDirRecovery] keeps owning that broader,
 * write-scoped retry as its own inner concern.
 *
 * Pure Kotlin, no Android framework calls, no `File`-specific coupling — it
 * just retries a callable once on a specific exception type — so
 * [CacheMissRecoveryTest] needs neither Robolectric nor a real cache
 * directory, matching [CacheDirRecovery]'s approach for its sibling helper.
 */
object CacheMissRecovery {
    /**
     * Runs [action]. If it throws [FileNotFoundException], invokes
     * [onRecovered] with the original failure and runs [action] exactly one
     * more time. Any other exception — including a broader [IOException] —
     * propagates immediately, untouched. A second [FileNotFoundException]
     * also propagates: the retry is bounded to one extra attempt, so a
     * persistently vanished cache path still fails fast instead of looping.
     */
    fun <T> retryOnceOnFileNotFound(
        onRecovered: (FileNotFoundException) -> Unit = {},
        action: () -> T,
    ): T {
        return try {
            action()
        } catch (failure: FileNotFoundException) {
            onRecovered(failure)
            action()
        }
    }
}
