import { UIManager } from "react-native";

/** True when RNCWebView native view manager is linked in the APK. */
export function isEmailHtmlPreviewSupported(): boolean {
  try {
    return Boolean(UIManager.getViewManagerConfig("RNCWebView"));
  } catch {
    return false;
  }
}
