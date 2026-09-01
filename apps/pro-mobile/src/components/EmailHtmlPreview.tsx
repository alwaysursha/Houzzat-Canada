/**
 * Stage 4.8 — Render stored LeadEmailLog htmlBody (web EmailPreviewModal iframe parity).
 * Local HTML only — not CRM WebView navigation.
 *
 * react-native-webview must be lazy-loaded: its module calls
 * TurboModuleRegistry.getEnforcing('RNCWebViewModule') at import time.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { isEmailHtmlPreviewSupported } from "./email-html-preview-support";

export { isEmailHtmlPreviewSupported } from "./email-html-preview-support";

type EmailHtmlPreviewProps = {
  htmlBody: string;
};

type WebViewComponent = React.ComponentType<{
  originWhitelist?: string[];
  source: { html: string };
  style?: object;
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  setSupportMultipleWindows?: boolean;
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
}>;

function loadWebView(): WebViewComponent | null {
  if (!isEmailHtmlPreviewSupported()) return null;
  try {
    return require("react-native-webview").WebView as WebViewComponent;
  } catch {
    return null;
  }
}

const PREVIEW_HEIGHT = 420;

export function EmailHtmlPreview({ htmlBody }: EmailHtmlPreviewProps) {
  const WebView = loadWebView();
  const html = htmlBody.trim();

  if (!WebView) return null;

  return (
    <View style={styles.wrap}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.webview}
        scrollEnabled
        showsVerticalScrollIndicator
        setSupportMultipleWindows={false}
        javaScriptEnabled={false}
        domStorageEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: PREVIEW_HEIGHT,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
