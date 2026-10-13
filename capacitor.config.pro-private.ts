import type { CapacitorConfig } from "@capacitor/cli";

/**
 * PRIVATE TEST shell only — coexists with production HouzzatPRO.
 *
 * - Android applicationId / Capacitor appId: com.houzzat.pro.private
 *   (sideloadable beside Play package com.houzzat.pro)
 * - appendUserAgent must claim com.houzzat.pro so website middleware
 *   resolveRequestAppShell maps to houzzatpro (exact appId match).
 * - HouzzatProPrivateUI/1 is presentation-only: AgentShell bypasses
 *   InstantShell and shows the full responsive CRM (same as mobile Chrome).
 * - Loads the same responsive PRO mobile website as production
 * - Native tree: android-pro-private/
 * - Do not ship to Play Store. Do not overwrite com.houzzat.pro.
 */
const config: CapacitorConfig = {
  appId: "com.houzzat.pro.private",
  appName: "HouzzatPro Private",
  webDir: "mobile/www",
  appendUserAgent: "HouzzatNative/1 (com.houzzat.pro) HouzzatProPrivateUI/1",
  server: {
    url: "https://app.houzzatpro.com/pro/sign-in",
    cleartext: false,
    allowNavigation: [
      "app.houzzatpro.com",
      "houzzat.com",
      "*.houzzat.com",
      "houzzatpro.com",
      "*.houzzatpro.com",
      "accounts.google.com",
      "*.google.com",
      "*.googleapis.com",
    ],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#63D9BD",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1e2a38",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  android: {
    path: "android-pro-private",
    allowMixedContent: false,
    backgroundColor: "#63D9BD",
  },
  ios: {
    path: "ios-pro",
    backgroundColor: "#63D9BD",
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "HouzzatProPrivate",
  },
};

export default config;
