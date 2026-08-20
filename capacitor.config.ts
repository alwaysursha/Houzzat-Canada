import type { CapacitorConfig } from "@capacitor/cli";
import proConfig from "./capacitor.config.pro";

/**
 * Dual-target Capacitor entrypoint.
 *
 * Default (no env / any value other than `pro`) → Houzzat consumer
 * (`com.houzzat.app`, ios/, android/).
 *
 * `HOUZZAT_CAP_TARGET=pro` → HouzzatPro (`com.houzzat.pro`, ios-pro/,
 * android-pro/). Set only by `scripts/cap-target.sh pro …`.
 *
 * IMPORTANT: this file is never rewritten on disk during builds. Parallel CI
 * jobs can run consumer + Pro in the same checkout as long as they set
 * different `HOUZZAT_CAP_TARGET` values and write to different native trees.
 */

const houzzatConfig: CapacitorConfig = {
  appId: "com.houzzat.app",
  appName: "Houzzat",
  webDir: "mobile/www",
  /**
   * Server-visible native marker consumed by middleware for shell UX only
   * (never authorization). Must match `nativeUserAgentMarker(HOUZZAT_APP_ID)`
   * in src/lib/mobile/app-shell.ts.
   */
  appendUserAgent: "HouzzatNative/1 (com.houzzat.app)",
  server: {
    url: "https://houzzat.com",
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
      // Android 12 keeps the system splash until JS hides it. Duration must
      // be > 0 or Capacitor never installs the keep-on-screen condition —
      // that was the logo-then-plain-green gap.
      // autoHide after 10s is only a failsafe if houzzat.com never calls hide.
      launchAutoHide: true,
      launchShowDuration: 10000,
      launchFadeOutDuration: 0,
      backgroundColor: "#0A2F24",
      androidScaleType: "CENTER_CROP",
      splashFullScreen: false,
      splashImmersive: false,
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0A2F24",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  android: {
    path: "android",
    allowMixedContent: false,
    backgroundColor: "#0A2F24",
  },
  ios: {
    path: "ios",
    backgroundColor: "#0A2F24",
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
};

const target = process.env.HOUZZAT_CAP_TARGET === "pro" ? "pro" : "houzzat";

export default target === "pro" ? proConfig : houzzatConfig;
