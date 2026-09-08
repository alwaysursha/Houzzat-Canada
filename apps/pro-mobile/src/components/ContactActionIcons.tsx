/**
 * Lightweight contact / action glyphs — no icon package dependency.
 * Drawn with Views so Android/iOS render identically (not emoji tofu).
 */

import React from "react";
import { StyleSheet, View } from "react-native";

const INK = "#64748B";

export function ContactPencilIcon({
  color = INK,
  size = 16,
}: {
  color?: string;
  size?: number;
}) {
  // Lucide-style pencil: shaft + tip + eraser square.
  const shaftW = size * 0.7;
  const shaftH = Math.max(2, size * 0.18);
  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      accessibilityElementsHidden
    >
      <View
        style={[
          styles.pencilShaft,
          {
            width: shaftW,
            height: shaftH,
            backgroundColor: color,
            borderRadius: shaftH / 2,
          },
        ]}
      />
      <View
        style={[
          styles.pencilEraser,
          {
            width: size * 0.28,
            height: size * 0.28,
            borderColor: color,
            borderWidth: Math.max(1.25, size * 0.08),
            top: size * 0.08,
            right: size * 0.08,
          },
        ]}
      />
      <View
        style={[
          styles.pencilTip,
          {
            borderLeftWidth: size * 0.14,
            borderRightWidth: size * 0.14,
            borderTopWidth: size * 0.2,
            borderTopColor: color,
            bottom: size * 0.06,
            left: size * 0.08,
          },
        ]}
      />
    </View>
  );
}

export function ContactBellIcon({
  color = INK,
  muted = false,
}: {
  color?: string;
  muted?: boolean;
}) {
  const tone = muted ? "#94A3B8" : color;
  return (
    <View
      style={[styles.box, muted ? styles.muted : null]}
      accessibilityElementsHidden
    >
      <View style={[styles.bellDome, { borderColor: tone }]} />
      <View style={[styles.bellBase, { backgroundColor: tone }]} />
      <View style={[styles.bellClapper, { backgroundColor: tone }]} />
    </View>
  );
}

/** Lucide Mail — envelope outline (Android often lacks ✉ glyph). */
export function ContactMailIcon({
  color = INK,
  size = 14,
}: {
  color?: string;
  size?: number;
}) {
  const w = size;
  const h = size * 0.75;
  return (
    <View
      style={[styles.box, { width: w, height: h }]}
      accessibilityElementsHidden
    >
      <View
        style={[
          styles.mailBox,
          {
            width: w,
            height: h,
            borderColor: color,
            borderRadius: Math.max(1.5, size * 0.1),
          },
        ]}
      />
      <View
        style={[
          styles.mailFlapLeft,
          {
            width: w * 0.55,
            height: 1.5,
            backgroundColor: color,
            top: h * 0.12,
            left: 1,
            transform: [{ rotate: "28deg" }],
          },
        ]}
      />
      <View
        style={[
          styles.mailFlapRight,
          {
            width: w * 0.55,
            height: 1.5,
            backgroundColor: color,
            top: h * 0.12,
            right: 1,
            transform: [{ rotate: "-28deg" }],
          },
        ]}
      />
    </View>
  );
}

export function ContactPhoneIcon({
  color = INK,
  size = 14,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      accessibilityElementsHidden
    >
      <View
        style={[
          styles.phoneBody,
          {
            width: size * 0.55,
            height: size * 0.85,
            borderColor: color,
            borderRadius: size * 0.12,
          },
        ]}
      />
      <View
        style={[
          styles.phoneEar,
          {
            width: size * 0.22,
            height: size * 0.08,
            backgroundColor: color,
            top: size * 0.14,
          },
        ]}
      />
    </View>
  );
}

export function ContactChatIcon({
  color = "#FFFFFF",
  size = 16,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      accessibilityElementsHidden
    >
      <View
        style={[
          styles.chatBubble,
          {
            width: size * 0.78,
            height: size * 0.58,
            borderColor: color,
            borderRadius: size * 0.18,
          },
        ]}
      />
      <View
        style={[
          styles.chatTail,
          {
            borderTopWidth: size * 0.22,
            borderRightWidth: size * 0.22,
            borderTopColor: color,
            bottom: size * 0.06,
            left: size * 0.18,
          },
        ]}
      />
    </View>
  );
}

export function ContactPinIcon({
  color = "#DC2626",
  size = 14,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      accessibilityElementsHidden
    >
      <View
        style={[
          styles.pinHead,
          {
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: size * 0.35,
            borderColor: color,
            borderWidth: Math.max(1.5, size * 0.1),
          },
        ]}
      />
      <View
        style={[
          styles.pinDot,
          {
            width: size * 0.22,
            height: size * 0.22,
            borderRadius: size * 0.11,
            backgroundColor: color,
            top: size * 0.24,
          },
        ]}
      />
      <View
        style={[
          styles.pinPoint,
          {
            borderLeftWidth: size * 0.18,
            borderRightWidth: size * 0.18,
            borderTopWidth: size * 0.28,
            borderTopColor: color,
            bottom: 0,
          },
        ]}
      />
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
  muted: {
    opacity: 0.55,
  },
  pencilShaft: {
    transform: [{ rotate: "-45deg" }],
  },
  pencilEraser: {
    position: "absolute",
    borderRadius: 1,
    backgroundColor: "transparent",
    transform: [{ rotate: "-45deg" }],
  },
  pencilTip: {
    position: "absolute",
    width: 0,
    height: 0,
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
    marginTop: 0,
  },
  bellClapper: {
    width: 2,
    height: 2,
    borderRadius: 1,
    marginTop: 1,
  },
  mailBox: {
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  mailFlapLeft: {
    position: "absolute",
  },
  mailFlapRight: {
    position: "absolute",
  },
  phoneBody: {
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  phoneEar: {
    position: "absolute",
    borderRadius: 1,
  },
  chatBubble: {
    borderWidth: 1.75,
    backgroundColor: "transparent",
    marginBottom: 2,
  },
  chatTail: {
    position: "absolute",
    width: 0,
    height: 0,
    borderRightColor: "transparent",
  },
  pinHead: {
    backgroundColor: "transparent",
    position: "absolute",
    top: 0,
  },
  pinDot: {
    position: "absolute",
  },
  pinPoint: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
