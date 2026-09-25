package com.houzzat.pro

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.OnBackPressedCallback
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

private const val BACK_TRACE = "HOUZZAT_BACK_TRACE"

class MainActivity : ReactActivity() {

    /**
     * Android 16 does not call [onBackPressed] for apps targeting API 36.
     * Forward predictive/system Back into that existing React Native method.
     * The callback is disabled around the call so [super.onBackPressed] cannot
     * re-enter it, including when JS later calls BackHandler.exitApp().
     */
    private val predictiveBackCallback =
        object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                Log.d(BACK_TRACE, "native callback handleOnBackPressed")
                isEnabled = false
                Log.d(BACK_TRACE, "native callback calling ReactActivity.onBackPressed")
                onBackPressed()
                isEnabled = true
                Log.d(BACK_TRACE, "native callback handleOnBackPressed returned")
            }
        }

    override fun getMainComponentName(): String = "HouzzatPro"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(
            this,
            mainComponentName,
            false // fabricEnabled
        )

    override fun onCreate(savedInstanceState: Bundle?) {
        // react-native-screens: pass null so fragment state is not restored.
        // Cold-start intent extras remain available for FCM / JS bootstrap.
        super.onCreate(null)
        if (applicationInfo.targetSdkVersion >= 36) {
            onBackPressedDispatcher.addCallback(this, predictiveBackCallback)
            Log.d(
                BACK_TRACE,
                "native callback registered sdk=${Build.VERSION.SDK_INT} targetSdk=${applicationInfo.targetSdkVersion}",
            )
        } else {
            Log.d(
                BACK_TRACE,
                "native callback not registered sdk=${Build.VERSION.SDK_INT} targetSdk=${applicationInfo.targetSdkVersion}",
            )
        }
    }

    override fun onBackPressed() {
        Log.d(BACK_TRACE, "native ReactActivity.onBackPressed enter")
        super.onBackPressed()
        Log.d(BACK_TRACE, "native ReactActivity.onBackPressed return")
    }

    override fun invokeDefaultOnBackPressed() {
        // exitApp() lands here. Leave the callback disabled for the dispatcher
        // walk so the activity can move to the background, then turn it back
        // on so Back still works after the task returns.
        Log.d(BACK_TRACE, "native invokeDefaultOnBackPressed enter")
        predictiveBackCallback.isEnabled = false
        super.invokeDefaultOnBackPressed()
        predictiveBackCallback.isEnabled = true
        Log.d(
            BACK_TRACE,
            "native invokeDefaultOnBackPressed return finishing=$isFinishing",
        )
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
