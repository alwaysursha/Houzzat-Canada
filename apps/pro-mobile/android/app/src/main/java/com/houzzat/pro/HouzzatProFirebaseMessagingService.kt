package com.houzzat.pro

import android.Manifest
import android.app.ActivityManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM token refresh + foreground display.
 *
 * Background / killed: FCM `notification`+`data` is shown by the system; this
 * callback is not invoked, so we do not post a second tray item.
 * Foreground: the system does not display; we post to houzzat_pro_alerts.
 */
class HouzzatProFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        if (token.isNotBlank()) {
            FcmModule.emitTokenRefresh(token)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        if (!isAppInForeground()) return
        postForegroundNotification(message)
    }

    private fun isAppInForeground(): Boolean {
        val state = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(state)
        return state.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND ||
            state.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
    }

    private fun postForegroundNotification(message: RemoteMessage) {
        try {
            val mgr = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            if (!mgr.areNotificationsEnabled()) return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val granted =
                    ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.POST_NOTIFICATIONS,
                    ) == PackageManager.PERMISSION_GRANTED
                if (!granted) return
            }

            FcmModule.ensureChannel(this)

            val title =
                message.notification?.title?.takeIf { it.isNotBlank() }
                    ?: message.data["title"]
                    ?: "HouzzatPRO"
            val body =
                message.notification?.body?.takeIf { it.isNotBlank() }
                    ?: message.data["body"]
                    ?: ""
            val href = message.data["href"].orEmpty()
            val type = message.data["type"].orEmpty()

            val tap = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("href", href)
                putExtra("type", type)
            }
            val requestCode = (System.currentTimeMillis() and 0x7fffffff).toInt()
            val pendingFlags =
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val pending = PendingIntent.getActivity(this, requestCode, tap, pendingFlags)

            val notification =
                NotificationCompat.Builder(this, FcmModule.CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_houzzat_pro)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                    .setAutoCancel(true)
                    .setContentIntent(pending)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                    .setDefaults(NotificationCompat.DEFAULT_ALL)
                    .build()

            mgr.notify(requestCode, notification)
        } catch (_: Exception) {
            // Never crash the FCM service.
        }
    }
}
