package com.houzzat.pro

import android.app.Application
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.shell.MainReactPackage
import com.facebook.soloader.SoLoader
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.reactcommunity.rndatetimepicker.RNDateTimePickerPackage
import com.reactnativecommunity.webview.RNCWebViewPackage

class MainApplication : Application(), ReactApplication {

    private val mReactNativeHost = object : DefaultReactNativeHost(this) {
        override fun getUseDeveloperSupport(): Boolean = false

        override fun getPackages(): List<ReactPackage> {
            return listOf(
                MainReactPackage(),
                SecureKeystorePackage(),
                FcmPackage(),
                PdfSharePackage(),
                RNCWebViewPackage(),
                RNDateTimePickerPackage(),
            )
        }

        override fun getJSMainModuleName(): String = "index"

        override fun getBundleAssetName(): String = "index.android.bundle"

        override val isNewArchEnabled: Boolean = false
        override val isHermesEnabled: Boolean = true
    }

    override val reactNativeHost: ReactNativeHost
        get() = mReactNativeHost

    override fun onCreate() {
        super.onCreate()
        SoLoader.init(this, OpenSourceMergedSoMapping)
    }
}
