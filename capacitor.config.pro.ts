import type { CapacitorConfig } from "@capacitor/cli";

/**
 * HouzzatPRO staff shell.
 *
 * Stage 3K.5.9.1 — allowNavigation includes HouzzatPRO platform tenant hosts
 * so the WebView can open tenant Command Centres (e.g. tenant-canary).
 *
 * Default cold-start is houzzatpro.com (neutral platform bootstrap).
 * Dev/QA may override with HOUZZAT_CAP_PRO_SERVER_URL (e.g. tenant-canary).
 *
 * Selected when `HOUZZAT_CAP_TARGET=pro` (see capacitor.config.ts +
 * scripts/cap-target.sh). Never activated by a bare `npx cap …`.
 *
 * Marker must match `nativeUserAgentMarker("com.houzzat.pro")` in
 * src/lib/mobile/app-shell.ts.
 */
const proServerUrl =
  process.env.HOUZZAT_CAP_PRO_SERVER_URL?.trim() ||
  "https://houzzatpro.com/pro";

const config: CapacitorConfig = {
  appId: "com.houzzat.pro",
  appName: "HouzzatPro",
  webDir: "mobile/www",
  appendUserAgent: "HouzzatNative/1 (com.houzzat.pro)",
  server: {
    url: proServerUrl,
    cleartext: false,
    allowNavigation: [
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
      // Splash is platform chrome (HouzzatPRO), not tenant branding.
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
