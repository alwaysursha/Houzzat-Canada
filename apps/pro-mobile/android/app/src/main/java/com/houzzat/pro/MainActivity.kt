package com.houzzat.pro

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

    override fun getMainComponentName(): String = "HouzzatPro"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(
            this,
            mainComponentName,
            false // fabricEnabled
        )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Cold-start extras retained for getInitialNotification / JS bootstrap.
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        if (intent != null) {
            setIntent(intent)
            val href = intent.getStringExtra("href")
            val type = intent.getStringExtra("type")
            if (!href.isNullOrBlank() || !type.isNullOrBlank()) {
                FcmModule.emitNotificationOpened(href, type)
                intent.putExtra(FcmModule.EXTRA_HANDLED, true)
            }
        }
    }
}
