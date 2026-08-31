/**
 * Stage 4.0 — Placeholder App Ready Screen.
 *
 * Confirms WORKSPACE_ACTIVE state:
 * - workspaceId bound
 * - user & role verified
 * - API client configured with active tenant header
 */

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { HouzzatProWordmark } from "../components/BrandMark";
import { useAuth } from "../state/AuthContext";

export function AppReadyScreen() {
  const { user, activeWorkspace, activeMembership, memberships, changeWorkspace, signOut } = useAuth();

  const isMultiWorkspace = memberships.length > 1;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <HouzzatProWordmark size="sm" dark={false} />
          <View style={styles.readyBadge}>
            <Text style={styles.readyBadgeText}>V2 ENGINE ACTIVE</Text>
          </View>
        </View>

        <Text style={styles.workspaceName}>
          {activeWorkspace?.displayName ?? "Active Workspace"}
        </Text>
        <Text style={styles.workspaceId}>
          Workspace ID: {activeWorkspace?.id}
        </Text>
      </View>

      {/* Body Content */}
      <View style={styles.content}>
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Native Foundation Active</Text>
          <Text style={styles.statusDesc}>
            The React Native multi-tenant foundation is running cleanly without any WebView, remote shell, or hostname dependency.
          </Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>User Email:</Text>
            <Text style={styles.detailValue}>{user?.email}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Active Role:</Text>
            <View style={styles.rolePill}>
              <Text style={styles.rolePillText}>{activeMembership?.role}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>API Origin:</Text>
            <Text style={styles.detailValueMono}>https://app.houzzatpro.com/api/mobile/v2</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Tenant Auth:</Text>
            <Text style={styles.detailValueMono}>x-workspace-id: {activeWorkspace?.id}</Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionStack}>
          {isMultiWorkspace ? (
            <TouchableOpacity
              style={styles.switchButton}
              activeOpacity={0.85}
              onPress={changeWorkspace}
            >
              <Text style={styles.switchButtonText}>Switch Workspace</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.signOutButton}
            activeOpacity={0.85}
            onPress={signOut}
          >
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>HouzzatPRO Native v2.0 • Ready for CRM Modules</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    backgroundColor: "#1E2A38",
    paddingTop: 54,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  readyBadge: {
    backgroundColor: "#0F6B4C",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  readyBadgeText: {
    color: "#96F0D8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  workspaceName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  workspaceId: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: "space-between",
  },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    gap: 12,
  },
  statusTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0B5C49",
  },
  statusDesc: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E2A38",
  },
  detailValueMono: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0F6B4C",
  },
  rolePill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rolePillText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "800",
  },
  actionStack: {
    gap: 12,
  },
  switchButton: {
    backgroundColor: "#1E2A38",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  switchButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  signOutButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  signOutButtonText: {
    color: "#EF4444",
    fontSize: 15,
    fontWeight: "700",
  },
  footer: {
    alignItems: "center",
    paddingBottom: 24,
  },
  footerText: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
  },
});
