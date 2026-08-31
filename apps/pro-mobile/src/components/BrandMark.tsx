/**
 * Stage 4.2 — HouzzatPRO Mobile v2 Native Brand Marks.
 * Restores the original HouzzatPRO logo/wordmark and PRO badge treatment.
 */

import React from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { HOUZZAT_PRO_MARK_DATA_URI } from "../assets/houzzat-pro-mark-data";

export { HOUZZAT_PRO_MARK_DATA_URI };

export function HouzzatProMark({ size = 80 }: { size?: number }) {
  return (
    <View style={[styles.markWrapper, { width: size, height: size }]}>
      <Image
        source={{ uri: HOUZZAT_PRO_MARK_DATA_URI }}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

export function HouzzatProBadge({
  size = "md",
  dark = false,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  dark?: boolean;
}) {
  const isSm = size === "sm";
  const isLg = size === "lg";
  const isXl = size === "xl";

  const paddingHorizontal = isSm ? 5 : isXl ? 10 : isLg ? 8 : 6;
  const paddingVertical = isSm ? 1 : isXl ? 3 : isLg ? 2.5 : 2;
  const fontSize = isSm ? 9 : isXl ? 15 : isLg ? 13 : 11;

  return (
    <View
      style={[
        styles.badgeContainer,
        {
          paddingHorizontal,
          paddingVertical,
          borderColor: "#C9A227",
          borderWidth: 1.2,
          backgroundColor: dark ? "rgba(90, 64, 16, 0.45)" : "#3D2B08",
        },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          {
            fontSize,
            color: "#F5DE7B",
          },
        ]}
      >
        PRO
      </Text>
    </View>
  );
}

export function HouzzatProWordmark({
  size = "md",
  dark = false,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  dark?: boolean;
}) {
  const fontSize = size === "xl" ? 34 : size === "lg" ? 26 : size === "md" ? 20 : 15;

  return (
    <View style={styles.wordmarkRow}>
      <Text
        style={[
          styles.wordmarkTitle,
          {
            fontSize,
            color: dark ? "#0B5C49" : "#FFFFFF",
          },
        ]}
      >
        Houzzat
      </Text>
      <View style={styles.badgeWrapper}>
        <HouzzatProBadge size={size} dark={dark} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  markWrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  wordmarkTitle: {
    fontWeight: "800",
    letterSpacing: -0.5,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif-medium",
  },
  badgeWrapper: {
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },
  badgeContainer: {
    borderRadius: 4,
    borderWidth: 1.2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontWeight: "800",
    letterSpacing: 0.5,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif-bold",
  },
});
