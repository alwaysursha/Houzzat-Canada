/**
 * Lightweight contact-row glyphs — no icon package dependency.
 * Drawn with Views so Android/iOS render identically (not emoji).
 */

import React from "react";
import { StyleSheet, View } from "react-native";

const INK = "#64748B";

export function ContactPencilIcon({ color = INK }: { color?: string }) {
  return (
    <View style={styles.box} accessibilityElementsHidden>
      <View style={[styles.pencilShaft, { backgroundColor: color }]} />
      <View style={[styles.pencilTip, { borderTopColor: color }]} />
    </View>
  );
}

export function ContactBellIcon({ color = INK }: { color?: string }) {
  return (
    <View style={styles.box} accessibilityElementsHidden>
      <View style={[styles.bellDome, { borderColor: color }]} />
      <View style={[styles.bellBase, { backgroundColor: color }]} />
      <View style={[styles.bellClapper, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  pencilShaft: {
    width: 2,
    height: 11,
    borderRadius: 1,
    transform: [{ rotate: "-45deg" }],
  },
  pencilTip: {
    position: "absolute",
    bottom: 1,
    left: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 4,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ rotate: "-45deg" }],
  },
  bellDome: {
    width: 10,
    height: 8,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: "transparent",
  },
  bellBase: {
    width: 12,
    height: 1.5,
    borderRadius: 1,
    marginTop: -1,
  },
  bellClapper: {
    width: 2,
    height: 2,
    borderRadius: 1,
    marginTop: 1,
  },
});
