/**
 * Premium promotional banner — Agent Services Coming Soon.
 * Non-interactive advertising strip for Launchpad (between Today and Quick Modules).
 */
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

export function AgentServicesComingSoonBanner() {
  return (
    <View
      style={styles.shell}
      accessibilityRole="text"
      accessibilityLabel="Agent Services. Coming soon. More tools. One place."
      importantForAccessibility="yes"
    >
      {/* Layered depth (no linear-gradient dependency) */}
      <View style={styles.baseFill} />
      <View style={styles.glowTopRight} />
      <View style={styles.glowBottomLeft} />
      <View style={styles.sheen} />
      <View style={styles.edgeHighlight} />

      <View style={styles.content}>
        <View style={styles.leftMark}>
          <View style={styles.markRing}>
            <View style={styles.markCore} />
          </View>
          <View style={styles.markAccent} />
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>AGENT SERVICES</Text>
          <Text style={styles.headline}>Coming Soon</Text>
          <Text style={styles.tagline}>More tools. One place.</Text>
        </View>

        <View style={styles.rightDecor} pointerEvents="none">
          <View style={styles.decorPill} />
          <View style={[styles.decorDot, styles.decorDotA]} />
          <View style={[styles.decorDot, styles.decorDotB]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 14,
    overflow: "hidden",
    minHeight: 88,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    ...Platform.select({
      ios: {
        shadowColor: "#0B1F1A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  baseFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0C2A24",
  },
  glowTopRight: {
    position: "absolute",
    top: -36,
    right: -24,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(45, 212, 191, 0.22)",
  },
  glowBottomLeft: {
    position: "absolute",
    bottom: -48,
    left: -28,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(15, 107, 76, 0.45)",
  },
  sheen: {
    position: "absolute",
    top: 0,
    left: "18%",
    right: "-10%",
    height: "55%",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    transform: [{ skewX: "-18deg" }],
  },
  edgeHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  leftMark: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  markRing: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(148, 241, 213, 0.55)",
    backgroundColor: "rgba(15, 107, 76, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  markCore: {
    width: 14,
    height: 14,
    borderRadius: 4,
    backgroundColor: "#5EEAD4",
    opacity: 0.95,
  },
  markAccent: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F8FAFC",
    opacity: 0.85,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "rgba(153, 246, 228, 0.92)",
  },
  headline: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#F8FAFC",
  },
  tagline: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(226, 232, 240, 0.78)",
  },
  rightDecor: {
    width: 36,
    height: 44,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
  },
  decorPill: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(94, 234, 212, 0.55)",
  },
  decorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(248, 250, 252, 0.45)",
  },
  decorDotA: {
    marginRight: 10,
  },
  decorDotB: {
    marginRight: 2,
    opacity: 0.7,
  },
});
