/**
 * Stage 5.4 — Consumer-parity shortlist control (canonical SavedListing).
 * Matches SaveListingButton heart semantics; label "Shortlist" / "Shortlisted".
 */

import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type ShortlistButtonProps = {
  saved: boolean;
  pending?: boolean;
  compact?: boolean;
  onPress: () => void;
};

export function ShortlistButton({
  saved,
  pending = false,
  compact = false,
  onPress,
}: ShortlistButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.btn, compact && styles.btnCompact, saved && styles.btnSaved]}
      onPress={() => onPress()}
      activeOpacity={0.8}
      disabled={pending}
      accessibilityRole="button"
      accessibilityLabel={saved ? "Remove from shortlist" : "Add to shortlist"}
    >
      {pending ? (
        <ActivityIndicator size="small" color={saved ? "#0F766E" : "#64748B"} />
      ) : (
        <Text style={[styles.heart, saved && styles.heartSaved]}>
          {saved ? "♥" : "♡"}
        </Text>
      )}
      {!compact ? (
        <Text style={[styles.label, saved && styles.labelSaved]}>
          {saved ? "Shortlisted" : "Shortlist"}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  btnCompact: {
    width: 34,
    height: 34,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: "center",
    borderRadius: 17,
  },
  btnSaved: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF5",
  },
  heart: {
    fontSize: 16,
    color: "#64748B",
    lineHeight: 18,
  },
  heartSaved: {
    color: "#0F766E",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  labelSaved: {
    color: "#0F766E",
  },
});
