package com.houzzat.pro

import android.content.Intent
import android.util.Base64
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream

/**
 * Stage 5.12B — write CMA PDF to app cache and share via FileProvider content URI.
 * No broad storage permissions; no public upload.
 */
class PdfShareModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "HouzzatProPdf"

    private fun writePdfFile(filename: String, base64: String): File {
        val safeName = filename
            .replace(Regex("[^a-zA-Z0-9._-]"), "-")
            .ifBlank { "CMA.pdf" }
            .let { if (it.endsWith(".pdf", ignoreCase = true)) it else "$it.pdf" }

        val dir = File(reactContext.cacheDir, "cma-pdf").apply { mkdirs() }
        val file = File(dir, safeName)
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        FileOutputStream(file).use { it.write(bytes) }
        return file
    }

    @ReactMethod
    fun savePdf(filename: String, base64: String, promise: Promise) {
        try {
            val file = writePdfFile(filename, base64)
            val uri = FileProvider.getUriForFile(
                reactContext,
                "${reactContext.packageName}.fileprovider",
                file,
            )
            promise.resolve(uri.toString())
        } catch (e: Exception) {
            promise.reject("PDF_SAVE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun sharePdf(filename: String, base64: String, promise: Promise) {
        try {
            val file = writePdfFile(filename, base64)
            val uri = FileProvider.getUriForFile(
                reactContext,
                "${reactContext.packageName}.fileprovider",
                file,
            )
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, filename)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(intent, "Share CMA PDF").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            reactContext.startActivity(chooser)
            promise.resolve(uri.toString())
        } catch (e: Exception) {
            promise.reject("PDF_SHARE_FAILED", e.message, e)
        }
    }
}
