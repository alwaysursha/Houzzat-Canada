package com.houzzat.pro

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Stage 5.11 — thin FCM bridge for HouzzatPRO native (shell = houzzatpro).
 * Reuses existing Firebase project houzzat-aa1b0 / com.houzzat.pro.
 */
class FcmModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "HouzzatProFcm"

    @ReactMethod
    fun ensureProAlertsChannel(promise: Promise) {
        try {
            ensureChannel(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CHANNEL_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getToken(promise: Promise) {
        try {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    if (token.isNullOrBlank()) {
                        promise.reject("TOKEN_EMPTY", "Empty FCM token")
                    } else {
                        promise.resolve(token)
                    }
                }
                .addOnFailureListener { e ->
                    promise.reject("TOKEN_FAILED", e.message, e)
                }
        } catch (e: Exception) {
            promise.reject("TOKEN_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getInitialNotification(promise: Promise) {
        try {
            val activity = currentActivity
            val extras = activity?.intent?.extras
            val map = extrasToMap(extras)
            // Consume so we don't re-open on rotation.
            if (map != null && activity != null) {
                activity.intent?.removeExtra("href")
                activity.intent?.removeExtra("type")
                activity.intent?.removeExtra(EXTRA_HANDLED)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("INITIAL_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // RN NativeEventEmitter compatibility
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // RN NativeEventEmitter compatibility
    }

    companion object {
        const val CHANNEL_ID = "houzzat_pro_alerts"
        const val CHANNEL_NAME = "HouzzatPro alerts"
        const val CHANNEL_DESCRIPTION =
            "New leads, tasks, appointments, and CRM desk alerts"
        const val EXTRA_HANDLED = "houzzat_pro_push_handled"

        @Volatile
        private var reactContextRef: ReactApplicationContext? = null

        fun attach(context: ReactApplicationContext) {
            reactContextRef = context
        }

        fun emitTokenRefresh(token: String) {
            val ctx = reactContextRef ?: return
            if (!ctx.hasActiveReactInstance()) return
            val map = Arguments.createMap().apply {
                putString("token", token)
            }
            ctx
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("houzzatpro_fcm_token", map)
        }

        fun emitNotificationOpened(href: String?, type: String?) {
            val ctx = reactContextRef ?: return
            if (!ctx.hasActiveReactInstance()) return
            val map = Arguments.createMap().apply {
                putString("href", href ?: "")
                putString("type", type ?: "")
            }
            ctx
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("houzzatpro_fcm_opened", map)
        }

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val mgr =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = CHANNEL_DESCRIPTION
                setShowBadge(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
                enableVibration(true)
            }
            mgr.createNotificationChannel(channel)
        }

        fun extrasToMap(extras: Bundle?): WritableMap? {
            if (extras == null) return null
            val href = extras.getString("href")
            val type = extras.getString("type")
            if (href.isNullOrBlank() && type.isNullOrBlank()) return null
            if (extras.getBoolean(EXTRA_HANDLED, false)) return null
            return Arguments.createMap().apply {
                putString("href", href ?: "")
                putString("type", type ?: "")
            }
        }
    }

    init {
        attach(reactContext)
    }
}
