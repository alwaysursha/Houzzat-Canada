import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Houzzat consumer app — loads the live site for fast iteration / low cost.
 * Native plugins (push, biometrics) will still run in this shell.
 */
const config: CapacitorConfig = {
  appId: "com.houzzat.app",
  appName: "Houzzat",
  webDir: "mobile/www",
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
      launchAutoHide: true,
      backgroundColor: "#0f3d32",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f3d32",
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0f3d32",
  },
  ios: {
    backgroundColor: "#0f3d32",
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
};

export default config;
