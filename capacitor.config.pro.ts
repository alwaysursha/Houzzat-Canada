import type { CapacitorConfig } from "@capacitor/cli";

/**
 * HouzzatPro staff shell — same houzzat.com backend as the consumer app.
 *
 * Selected when `HOUZZAT_CAP_TARGET=pro` (see capacitor.config.ts +
 * scripts/cap-target.sh). Never activated by a bare `npx cap …`.
 *
 * Marker must match `nativeUserAgentMarker("com.houzzat.pro")` in
 * src/lib/mobile/app-shell.ts.
 */
const config: CapacitorConfig = {
  appId: "com.houzzat.pro",
  appName: "HouzzatPro",
  webDir: "mobile/www",
  appendUserAgent: "HouzzatNative/1 (com.houzzat.pro)",
  server: {
    // Cold-start into the Pro router; Auth.js + Neon remain shared.
    url: "https://houzzat.com/pro",
    cleartext: false,
    allowNavigation: [
      "houzzat.com",
      "*.houzzat.com",
      "accounts.google.com",
      "*.google.com",
      "*.googleapis.com",
    ],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      // Light mint mid-tone (matches Pro splash gradient; distinct from
      // consumer canopy #1A7B59). Keep lightweight — color only, no animation.
      backgroundColor: "#63D9BD",
      showSpinner: false,
    },
    StatusBar: {
      // Dark CRM chrome ⇒ light/white status icons. Runtime
      // CapacitorBootstrap retunes per route (mint sign-in vs navy CRM).
      style: "DARK",
      backgroundColor: "#1e2a38",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  android: {
    path: "android-pro",
    allowMixedContent: false,
    backgroundColor: "#63D9BD",
  },
  ios: {
    path: "ios-pro",
    backgroundColor: "#63D9BD",
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "HouzzatPro",
  },
};

export default config;
