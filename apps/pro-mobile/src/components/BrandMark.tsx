/**
 * Stage 4.0 — HouzzatPRO Mobile v2 Native Brand Marks.
 * Pure native vector / styled view representations matching the HouzzatPRO visual identity.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function HouzzatProMark({ size = 80 }: { size?: number }) {
  const outerSize = size;
  const innerSize = Math.round(size * 0.44);

  return (
    <View
      style={[
        styles.markContainer,
        {
          width: outerSize,
          height: outerSize,
          borderRadius: Math.round(outerSize * 0.28),
        },
      ]}
    >
      <View
        style={[
          styles.innerDiamond,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: Math.round(innerSize * 0.2),
          },
        ]}
      />
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
  const fontSize = size === "lg" ? 28 : size === "md" ? 22 : 16;

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
      <View
        style={[
          styles.proPill,
          {
            backgroundColor: dark ? "#0B5C49" : "#FFFFFF",
          },
        ]}
      >
        <Text
          style={[
            styles.proText,
            {
              fontSize: Math.round(fontSize * 0.5),
              color: dark ? "#96F0D8" : "#0B5C49",
            },
          ]}
        >
          PRO
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  markContainer: {
    backgroundColor: "#0B5C49",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  innerDiamond: {
    backgroundColor: "#96F0D8",
    transform: [{ rotate: "45deg" }],
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  wordmarkTitle: {
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  proPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 2,
  },
  proText: {
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
