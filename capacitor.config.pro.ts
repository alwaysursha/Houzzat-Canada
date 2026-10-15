import type { CapacitorConfig } from "@capacitor/cli";

/**
 * HouzzatPRO staff shell.
 *
 * Stage 3K.5.10.6 — cold-start is app.houzzatpro.com (application bootstrap).
 * houzzatpro.com remains the public sales / marketing centre — not Capacitor URL.
 * Keep in sync with HOUZZATPRO_BOOTSTRAP_SERVER_URL in
 * src/lib/mobile/platform-bootstrap.ts.
 *
 * Dev/QA may override with HOUZZAT_CAP_PRO_SERVER_URL (never ship tenant hosts).
 *
 * Selected when `HOUZZAT_CAP_TARGET=pro` (see capacitor.config.ts +
 * scripts/cap-target.sh). Never activated by a bare `npx cap …`.
 *
 * Android + iOS share this same bootstrap URL and handoff protocol.
 */
const PRODUCTION_PRO_SERVER_URL = "https://app.houzzatpro.com/pro/sign-in";

const proServerUrl =
  process.env.HOUZZAT_CAP_PRO_SERVER_URL?.trim() || PRODUCTION_PRO_SERVER_URL;

/**
 * HouzzatProFullCRM/1 — production candidate capability marker (not Private UI).
 * Web gates full responsive CRM + Launchpad default + nav haptics on this token.
 * Installed Play builds without the marker keep InstantShell until users update.
 */
const PRO_FULL_CRM_UA_MARKER = "HouzzatProFullCRM/1";

const config: CapacitorConfig = {
  appId: "com.houzzat.pro",
  appName: "HouzzatPro",
  webDir: "mobile/www",
  appendUserAgent: `HouzzatNative/1 (com.houzzat.pro) ${PRO_FULL_CRM_UA_MARKER}`,
  server: {
    url: proServerUrl,
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
