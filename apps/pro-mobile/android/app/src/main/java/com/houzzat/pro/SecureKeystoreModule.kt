package com.houzzat.pro

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SecureKeystoreModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val PREFS_NAME = "houzzat_pro_secure_storage"

    private val securePrefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(reactContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            reactContext,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    override fun getName(): String = "SecureKeystoreBridge"

    @ReactMethod
    fun getSecureItem(key: String, promise: Promise) {
        try {
            val value = securePrefs.getString(key, null)
            promise.resolve(value)
        } catch (e: Exception) {
            promise.reject("SECURE_GET_FAILED", "Failed to retrieve from Android Keystore: ${e.message}", e)
        }
    }

    @ReactMethod
    fun setSecureItem(key: String, value: String, promise: Promise) {
        try {
            securePrefs.edit().putString(key, value).apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SECURE_SET_FAILED", "Failed to write to Android Keystore: ${e.message}", e)
        }
    }

    @ReactMethod
    fun removeSecureItem(key: String, promise: Promise) {
        try {
            securePrefs.edit().remove(key).apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SECURE_REMOVE_FAILED", "Failed to remove from Android Keystore: ${e.message}", e)
        }
    }

    @ReactMethod
    fun clearSecureItems(promise: Promise) {
        try {
            securePrefs.edit().clear().apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SECURE_CLEAR_FAILED", "Failed to clear Android Keystore: ${e.message}", e)
        }
    }
}
