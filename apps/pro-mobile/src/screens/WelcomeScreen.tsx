/**
 * Stage 4.0 — Native Welcome Screen.
 * Visual baseline matching HouzzatPRO cold-start design.
 */

import React from "react";
import { Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { HouzzatProMark, HouzzatProWordmark } from "../components/BrandMark";

export function WelcomeScreen({ onStartSignIn }: { onStartSignIn: () => void }) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#63D9BD" />
      <View style={styles.content}>
        <HouzzatProMark size={88} />
        <View style={styles.wordmarkWrapper}>
          <HouzzatProWordmark size="xl" dark={true} />
        </View>
        <Text style={styles.tagline}>The modern workspace for high-performing real estate teams</Text>
      </View>

      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.85}
          onPress={onStartSignIn}
        >
          <Text style={styles.primaryButtonText}>Sign in to Workspace</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>HouzzatPRO Native v2.0</Text>
      </View>
    </View>
  );
}

const topPadding = Platform.OS === "android" ? Math.max(StatusBar.currentHeight || 0, 42) + 20 : 36;
const bottomPadding = Platform.OS === "android" ? 44 : 24;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#63D9BD",
    justifyContent: "space-between",
    paddingTop: topPadding,
    paddingBottom: bottomPadding,
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  wordmarkWrapper: {
    marginTop: 20,
  },
  tagline: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "500",
    color: "#0B5C49",
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 22,
  },
  actionContainer: {
    width: "100%",
    alignItems: "center",
    gap: 16,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#0B5C49",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  versionText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0B5C49",
    opacity: 0.65,
  },
});
