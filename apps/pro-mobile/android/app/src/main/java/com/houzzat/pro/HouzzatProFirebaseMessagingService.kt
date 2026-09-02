package com.houzzat.pro

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Stage 5.11 — FCM token refresh + foreground message hook.
 * Background display is handled by the system when payload includes `notification`.
 * Foreground: do not re-post a notification (avoid double display).
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
    // Intentionally no local notification post when app is foregrounded.
    // System already displayed when backgrounded via notification+data payload.
    }
}
