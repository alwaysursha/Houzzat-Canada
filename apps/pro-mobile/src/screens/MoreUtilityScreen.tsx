/**
 * Stage 5.2 — Native More utility destination (web Instant Shell drawer items).
 *
 * Substantial modules (Statistics, Communications, CMA, Team, Notifications,
 * Properties) are deferred to dedicated stages. This screen is the native
 * unavailable / coming-later state — never opens browser CRM.
 */

import React from "react";
import {
  MORE_UTILITY_META,
  type MoreUtilityId,
} from "../lib/more-utility-meta";

export type { MoreUtilityId };
export { MORE_UTILITY_META };
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type MoreUtilityScreenProps = {
  utilityId: Exclude<MoreUtilityId, "account">;
  onBack: () => void;
};

export function MoreUtilityScreen({ utilityId, onBack }: MoreUtilityScreenProps) {
  const meta = MORE_UTILITY_META[utilityId];

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onBack}
          activeOpacity={0.75}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          {meta.title}
        </Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Coming later</Text>
          <Text style={styles.title}>{meta.title}</Text>
          <Text style={styles.body}>{meta.summary}</Text>
          <View style={styles.divider} />
          <Text style={styles.metaLabel}>Web module</Text>
          <Text style={styles.metaValue}>{meta.webPath}</Text>
          <Text style={[styles.metaLabel, styles.metaLabelSpaced]}>
            Recommended next stage
          </Text>
          <Text style={styles.metaValue}>{meta.nextStage}</Text>
        </View>

        <Text style={styles.footnote}>
          HouzzatPRO native never opens browser CRM routes for unfinished
          modules.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F7F5",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F766E",
    width: 72,
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  topSpacer: {
    width: 72,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 18,
    gap: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#0F766E",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1E2A38",
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 8,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metaLabelSpaced: {
    marginTop: 8,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E2A38",
  },
  footnote: {
    fontSize: 12,
    lineHeight: 17,
    color: "#94A3B8",
    textAlign: "center",
    paddingHorizontal: 12,
  },
});
