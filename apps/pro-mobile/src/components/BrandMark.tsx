/**
 * Stage 4.2 — HouzzatPRO Mobile v2 Native Brand Marks.
 * Restores the original HouzzatPRO logo/wordmark and PRO badge treatment.
 */

import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
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
  size?: "sm" | "md" | "lg";
  dark?: boolean;
}) {
  const isSm = size === "sm";
  const isLg = size === "lg";

  const paddingHorizontal = isSm ? 5 : isLg ? 8 : 6;
  const paddingVertical = isSm ? 1 : isLg ? 3 : 2;
  const fontSize = isSm ? 9 : isLg ? 13 : 11;

  return (
    <View
      style={[
        styles.badgeContainer,
        {
          paddingHorizontal,
          paddingVertical,
          borderColor: dark ? "#D4B04A" : "#6E4F0C",
          backgroundColor: dark ? "rgba(212, 176, 74, 0.15)" : "#0B5C49",
        },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          {
            fontSize,
            color: dark ? "#F5DE7B" : "#96F0D8",
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
  size?: "sm" | "md" | "lg";
  dark?: boolean;
}) {
  const fontSize = size === "lg" ? 26 : size === "md" ? 20 : 15;

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
        HOUZZAT
      </Text>
      <View style={styles.badgeWrapper}>
        <HouzzatProBadge size={size} dark={!dark} />
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
    fontWeight: "900",
    letterSpacing: 0.8,
    fontFamily: "System",
  },
  badgeWrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  badgeContainer: {
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontWeight: "900",
    letterSpacing: 0.6,
  },
});
