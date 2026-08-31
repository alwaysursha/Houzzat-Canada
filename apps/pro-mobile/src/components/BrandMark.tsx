/**
 * Stage 4.2 & 4.3B — HouzzatPRO Mobile Native Brand Marks.
 * - Wordmark font matching the Fraunces serif branding on houzzat.com.
 * - Custom open-bracket gold PRO badge.
 * - House + agent icon mark.
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

/**
 * Custom gold PRO badge with open bracket corners (top-right ┐ and bottom-left └).
 */
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

  const width = isSm ? 32 : isXl ? 52 : isLg ? 42 : 36;
  const height = isSm ? 15 : isXl ? 24 : isLg ? 20 : 17;
  const fontSize = isSm ? 8.5 : isXl ? 13 : isLg ? 11 : 9.5;
  const strokeWidth = isXl ? 2 : isLg ? 1.8 : 1.5;
  const goldColor = dark ? "#6E4F0C" : "#D4B04A";
  const textColor = dark ? "#5A4010" : "#F5DE7B";

  return (
    <View style={[styles.badgeBox, { width, height }]}>
      {/* Top-right corner bracket ┐ */}
      <View
        style={[
          styles.bracketTopRight,
          {
            borderColor: goldColor,
            borderTopWidth: strokeWidth,
            borderRightWidth: strokeWidth,
          },
        ]}
      />
      {/* Bottom-left corner bracket └ */}
      <View
        style={[
          styles.bracketBottomLeft,
          {
            borderColor: goldColor,
            borderBottomWidth: strokeWidth,
            borderLeftWidth: strokeWidth,
          },
        ]}
      />
      <Text
        style={[
          styles.badgeText,
          {
            fontSize,
            color: textColor,
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
            color: dark ? "#14201C" : "#FFFFFF",
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
    gap: 6,
  },
  wordmarkTitle: {
    fontWeight: "700",
    letterSpacing: -0.6,
    fontFamily: Platform.OS === "android" ? "serif" : "Georgia",
  },
  badgeWrapper: {
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  badgeBox: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  bracketTopRight: {
    position: "absolute",
    top: 0,
    right: 0,
    width: "75%",
    height: "60%",
    borderTopRightRadius: 2.5,
  },
  bracketBottomLeft: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: "75%",
    height: "60%",
    borderBottomLeftRadius: 2.5,
  },
  badgeText: {
    fontWeight: "900",
    letterSpacing: 1,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif-condensed",
  },
});
