/**
 * Stage 4.0 — Native Splash Screen.
 * Preserves the HouzzatPRO visual identity and brand colors.
 */

import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { HouzzatProMark, HouzzatProWordmark } from "../components/BrandMark";

export function SplashScreen({
  error,
  onRetry,
  retrying,
}: {
  error?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
} = {}) {
  return (
    <View style={styles.container}>
      <View style={styles.centerContent}>
        <HouzzatProMark size={96} />
        <View style={styles.wordmarkWrapper}>
          <HouzzatProWordmark size="lg" dark={true} />
        </View>
        <Text style={styles.subtitle}>Real Estate Agent Operating System</Text>
      </View>
      <View style={styles.footer}>
        {error ? (
          <>
            <Text style={styles.errorText}>{error}</Text>
            {onRetry ? (
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={onRetry}
                disabled={retrying}
                activeOpacity={0.85}
              >
                <Text style={styles.retryBtnText}>
                  {retrying ? "Retrying…" : "Retry connection"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <>
            <ActivityIndicator size="small" color="#0B5C49" />
            <Text style={styles.loadingText}>Initializing Native Engine…</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#63D9BD",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  wordmarkWrapper: {
    marginTop: 20,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#0B5C49",
    opacity: 0.85,
    letterSpacing: 0.2,
  },
  footer: {
    alignItems: "center",
    gap: 8,
    maxWidth: 320,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0B5C49",
    opacity: 0.75,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0B5C49",
    textAlign: "center",
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: "#0B5C49",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
