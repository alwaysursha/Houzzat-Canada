/**
 * Password visibility eye / eye-off icons (vector-like Views — no emoji flicker).
 */
import React from "react";
import { StyleSheet, View } from "react-native";

type PasswordEyeIconProps = {
  visible: boolean;
  color?: string;
  size?: number;
};

export function PasswordEyeIcon({
  visible,
  color = "#64748B",
  size = 22,
}: PasswordEyeIconProps) {
  const eyeW = size;
  const eyeH = Math.round(size * 0.55);
  const pupil = Math.round(size * 0.28);

  return (
    <View
      style={[styles.wrap, { width: eyeW, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.eyeOutline,
          {
            width: eyeW,
            height: eyeH,
            borderRadius: eyeH / 2,
            borderColor: color,
          },
        ]}
      >
        <View
          style={[
            styles.pupil,
            {
              width: pupil,
              height: pupil,
              borderRadius: pupil / 2,
              backgroundColor: color,
            },
          ]}
        />
      </View>
      {visible ? null : (
        <View
          style={[
            styles.slash,
            {
              backgroundColor: color,
              width: size * 1.05,
              transform: [{ rotate: "-28deg" }],
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  eyeOutline: {
    borderWidth: 1.75,
    alignItems: "center",
    justifyContent: "center",
  },
  pupil: {},
  slash: {
    position: "absolute",
    height: 1.75,
    borderRadius: 1,
  },
});
