package com.boardsesh.boardrenderer

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Rect
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer

class BoardRendererModule : Module() {
    private val cacheDir: File by lazy {
        val reactCacheDir = appContext.reactContext?.cacheDir
            ?: throw IllegalStateException("BoardRenderer: reactContext.cacheDir unavailable")
        File(reactCacheDir, "board-thumbnails").also { it.mkdirs() }
    }

    @Volatile
    private var pruned = false

    private fun pruneCacheIfNeeded(maxBytes: Long) {
        val files = cacheDir.listFiles() ?: return
        var totalBytes = files.sumOf { it.length() }
        if (totalBytes <= maxBytes) return

        // Android's File.lastModified() is our LRU proxy — atime is not
        // reliably available on the filesystems Android caches live on.
        val sorted = files.sortedBy { it.lastModified() }
        var removed = 0
        for (file in sorted) {
            if (totalBytes <= maxBytes) break
            val size = file.length()
            if (file.delete()) {
                totalBytes -= size
                removed++
            }
        }
        if (removed > 0) {
            android.util.Log.i("BoardRenderer", "Pruned $removed cached PNGs; new total $totalBytes bytes")
        }
    }

    override fun definition() = ModuleDefinition {
        Name("BoardRenderer")

        AsyncFunction("renderComposite") { configJson: String, backgroundPaths: List<String>, cacheKey: String ->
            if (!pruned) {
                synchronized(this@BoardRendererModule) {
                    if (!pruned) {
                        pruneCacheIfNeeded(CACHE_CAP_BYTES)
                        pruned = true
                    }
                }
            }
            val outputFile = File(cacheDir, "$cacheKey.png")

            if (outputFile.exists()) {
                // Touch mtime so LRU treats hot files as recently used.
                outputFile.setLastModified(System.currentTimeMillis())
                return@AsyncFunction "file://${outputFile.absolutePath}"
            }

            val renderResult = BoardRendererBridge.render(configJson)
                ?: throw Exception("Rust render failed")

            val width = renderResult.width
            val height = renderResult.height
            val rgbaData = renderResult.data

            // Both bitmaps are recycled in finally so a throw between
            // creation and the manual recycle() can't leak native pixel
            // memory (which lives outside the JVM heap and isn't GC'd).
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            var overlayBitmap: Bitmap? = null
            try {
                val canvas = Canvas(bitmap)

                // Draw background images
                for (bgPath in backgroundPaths) {
                    val bgBitmap = BitmapFactory.decodeFile(bgPath)
                    if (bgBitmap != null) {
                        try {
                            canvas.drawBitmap(
                                bgBitmap,
                                null,
                                Rect(0, 0, width, height),
                                null
                            )
                        } finally {
                            bgBitmap.recycle()
                        }
                    }
                }

                // Draw RGBA overlay — tiny-skia returns premultiplied RGBA, and
                // ARGB_8888 bitmaps default to premultiplied storage in the same
                // byte layout, so copyPixelsFromBuffer lets us hand the buffer
                // straight to the bitmap with no per-pixel JVM loop. setPremultiplied
                // is true by default but we set it explicitly so future changes
                // can't accidentally flip it.
                overlayBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                overlayBitmap.setPremultiplied(true)
                overlayBitmap.copyPixelsFromBuffer(ByteBuffer.wrap(rgbaData))
                canvas.drawBitmap(overlayBitmap, 0f, 0f, null)

                // Encode to PNG
                FileOutputStream(outputFile).use { outputStream ->
                    val written = bitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream)
                    if (!written) {
                        outputFile.delete()
                        throw Exception("PNG compression failed")
                    }
                }
            } finally {
                overlayBitmap?.recycle()
                bitmap.recycle()
            }

            "file://${outputFile.absolutePath}"
        }
    }

    private companion object {
        // Cap the on-disk PNG cache so heavy users don't accumulate hundreds
        // of MB of stale renders. The cache lives in context.cacheDir, which
        // Android may also reclaim on its own under storage pressure — this
        // is just our explicit upper bound.
        const val CACHE_CAP_BYTES: Long = 200L * 1024 * 1024
    }
}
