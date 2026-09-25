/**
 * Stage 5.2 — Native More / Account hub (Instant Shell More + account identity).
 *
 * Visual authority: Stage 4.3B More tab cards + drawer identity.
 * No redesign — only makes account/workspace/logout rows accurate and wired.
 */

import React from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ServiceAreasCard } from "../components/ServiceAreasCard";
import {
  MORE_UTILITY_META,
  type MoreUtilityId,
} from "../lib/more-utility-meta";

type MoreHubScreenProps = {
  userEmail: string;
  userName?: string | null;
  userRole: string;
  brandDisplayName: string;
  workspaceId?: string | null;
  workspaceSlug?: string | null;
  hasMultipleWorkspaces: boolean;
  onChangeWorkspace: () => void;
  onSignOut: () => void;
  onReturnToCommandCentre?: () => void;
  onOpenAgentDesk?: () => void;
  onOpenUtility: (id: Exclude<MoreUtilityId, "account">) => void;
};

export function MoreHubScreen({
  userEmail,
  userName,
  userRole,
  brandDisplayName,
  workspaceId,
  workspaceSlug,
  hasMultipleWorkspaces,
  onChangeWorkspace,
  onSignOut,
  onReturnToCommandCentre,
  onOpenAgentDesk,
  onOpenUtility,
}: MoreHubScreenProps) {
  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out of HouzzatPRO?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: onSignOut },
      ],
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.cardSectionTitle}>User Profile</Text>
        {userName ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Name:</Text>
            <Text style={styles.infoVal}>{userName}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>Email:</Text>
          <Text style={styles.infoVal}>{userEmail}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>Role:</Text>
          <View style={styles.rolePillSmall}>
            <Text style={styles.rolePillSmallText}>{userRole}</Text>
          </View>
        </View>
      </View>

      <ServiceAreasCard />

      <View style={styles.card}>
        <Text style={styles.cardSectionTitle}>Active Workspace</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>Name:</Text>
          <Text style={styles.infoVal}>{brandDisplayName}</Text>
        </View>
        {workspaceId ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Workspace ID:</Text>
            <Text style={styles.infoValMono}>{workspaceId}</Text>
          </View>
        ) : null}
        {workspaceSlug ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Tenant Slug:</Text>
            <Text style={styles.infoValMono}>{workspaceSlug}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardSectionTitle}>Agent utilities</Text>
        <Text style={styles.cardHint}>
          Same destinations as the More drawer. Full modules arrive in later
          native stages.
        </Text>
        {(
          Object.keys(MORE_UTILITY_META) as Array<
            Exclude<MoreUtilityId, "account">
          >
        ).map((id) => (
          <TouchableOpacity
            key={id}
            style={styles.utilityRow}
            activeOpacity={0.8}
            onPress={() => onOpenUtility(id)}
            accessibilityRole="button"
            accessibilityLabel={MORE_UTILITY_META[id].title}
          >
            <Text style={styles.utilityLabel}>
              {MORE_UTILITY_META[id].title}
            </Text>
            <Text style={styles.utilityChevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {onReturnToCommandCentre ? (
        <TouchableOpacity
          style={styles.actionBtnSecondary}
          activeOpacity={0.85}
          onPress={onReturnToCommandCentre}
        >
          <Text style={styles.actionBtnSecondaryText}>
            ← Return to Command Centre
          </Text>
        </TouchableOpacity>
      ) : null}

      {onOpenAgentDesk ? (
        <TouchableOpacity
          style={styles.actionBtnPrimary}
          activeOpacity={0.85}
          onPress={onOpenAgentDesk}
        >
          <Text style={styles.actionBtnPrimaryText}>
            👤 Open Personal Agent Desk
          </Text>
        </TouchableOpacity>
      ) : null}

      {hasMultipleWorkspaces ? (
        <TouchableOpacity
          style={styles.actionBtnSecondary}
          activeOpacity={0.85}
          onPress={onChangeWorkspace}
        >
          <Text style={styles.actionBtnSecondaryText}>
            ⇄ Switch Workspace
          </Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={styles.signOutBtn}
        activeOpacity={0.85}
        onPress={handleSignOut}
      >
        <Text style={styles.signOutBtnText}>Sign Out of HouzzatPRO</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 10,
  },
  cardSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1E2A38",
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  cardHint: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  infoKey: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
  infoVal: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    color: "#1E2A38",
    fontWeight: "600",
  },
  infoValMono: {
    flex: 1,
    textAlign: "right",
    fontSize: 11,
    color: "#475569",
    fontWeight: "600",
    fontFamily: "monospace",
  },
  rolePillSmall: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  rolePillSmallText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F766E",
  },
  utilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  utilityLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E2A38",
  },
  utilityChevron: {
    fontSize: 18,
    color: "#94A3B8",
    fontWeight: "300",
  },
  actionBtnSecondary: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  actionBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E2A38",
  },
  actionBtnPrimary: {
    backgroundColor: "#0F766E",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  actionBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  signOutBtn: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: 4,
  },
  signOutBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#B91C1C",
  },
});
