package com.boardsesh.boardrenderer

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Rect
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

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

            // Create composited bitmap
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)

            // Draw background images
            for (bgPath in backgroundPaths) {
                val bgBitmap = BitmapFactory.decodeFile(bgPath)
                if (bgBitmap != null) {
                    canvas.drawBitmap(
                        bgBitmap,
                        null,
                        Rect(0, 0, width, height),
                        null
                    )
                    bgBitmap.recycle()
                }
            }

            // Draw RGBA overlay — convert RGBA (Rust output) to ARGB (Android Bitmap format)
            val overlayBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val pixelCount = rgbaData.size / 4
            val argbPixels = IntArray(pixelCount)
            for (pixelIndex in 0 until pixelCount) {
                val byteOffset = pixelIndex * 4
                val red = rgbaData[byteOffset].toInt() and 0xFF
                val green = rgbaData[byteOffset + 1].toInt() and 0xFF
                val blue = rgbaData[byteOffset + 2].toInt() and 0xFF
                val alpha = rgbaData[byteOffset + 3].toInt() and 0xFF
                argbPixels[pixelIndex] = (alpha shl 24) or (red shl 16) or (green shl 8) or blue
            }
            overlayBitmap.setPixels(argbPixels, 0, width, 0, 0, width, height)
            canvas.drawBitmap(overlayBitmap, 0f, 0f, null)
            overlayBitmap.recycle()

            // Encode to PNG
            FileOutputStream(outputFile).use { outputStream ->
                val written = bitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream)
                if (!written) {
                    outputFile.delete()
                    throw Exception("PNG compression failed")
                }
            }
            bitmap.recycle()

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
