/**
 * Stage 4.8 — Render stored LeadEmailLog htmlBody (web EmailPreviewModal iframe parity).
 * Local HTML only — not CRM WebView navigation.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { WebView as RNWebView } from "react-native-webview";

type EmailHtmlPreviewProps = {
  htmlBody: string;
};

/** RN WebView + React 18 type shim */
const WebView = RNWebView as unknown as React.ComponentType<{
  originWhitelist?: string[];
  source: { html: string };
  style?: object;
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  setSupportMultipleWindows?: boolean;
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
}>;

export function EmailHtmlPreview({ htmlBody }: EmailHtmlPreviewProps) {
  const html = htmlBody.trim();
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
    flex: 1,
    minHeight: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
