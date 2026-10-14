package com.houzzat.pro;

import android.app.Application;
import com.getcapacitor.Logger;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

/**
 * PRIVATE TEST shell only ({@code com.houzzat.pro.private}).
 *
 * <p>This package has no Firebase Android app / {@code google-services.json} yet.
 * Once the Capacitor bridge is live, website push bootstrap calls
 * {@code PushNotifications.register()}, which crashes the process if
 * {@link FirebaseApp} was never initialized.
 *
 * <p>Bootstrap with the shared Houzzat Firebase project (same credentials as
 * production HouzzatPRO) so register can fail soft on token errors instead of
 * FATAL. Replace with a dedicated {@code com.houzzat.pro.private} Firebase app
 * when console access is available.
 */
public class PrivateFirebaseApp extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            if (!FirebaseApp.getApps(this).isEmpty()) {
                return;
            }
            // From android-pro/app/google-services.json (project houzzat-aa1b0 / com.houzzat.pro).
            FirebaseOptions options = new FirebaseOptions.Builder()
                .setApplicationId("1:200998455563:android:879b3289c90b44ff697a0e")
                .setApiKey("AIzaSyC_WrBd4Ws8NHuS8FtMpszhvqsCQBBnxPQ")
                .setProjectId("houzzat-aa1b0")
                .setStorageBucket("houzzat-aa1b0.firebasestorage.app")
                .setGcmSenderId("200998455563")
                .build();
            FirebaseApp.initializeApp(this, options);
            Logger.debug("Private: FirebaseApp initialized for PushNotifications safety");
        } catch (Exception ex) {
            Logger.error("Private: FirebaseApp init failed", ex);
        }
    }
}
