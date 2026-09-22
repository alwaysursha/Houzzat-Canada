/**
 * Stage 4.0 / Phase 3 — Native Workspace / Identity Selection Screen.
 *
 * TENANCY GUARANTEE:
 * Operates purely on `workspaceId` (never hostname).
 *
 * Two modes:
 * 1) IDENTITY_SELECTION — pre-auth discover matches (password already verified).
 *    Selecting re-authenticates as that tenant User (never client-only ws switch).
 * 2) WORKSPACE_SELECTION — post-auth memberships for the authenticated User.
 */

import React from "react";
import {
  Alert,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { HouzzatProWordmark } from "../components/BrandMark";
import { useAuth } from "../state/AuthContext";
import type { MobileIdentityChoice } from "../types/auth";
import type { MobileWorkspaceMembership } from "../types/workspace";

export function WorkspaceSelectionScreen() {
  const {
    state,
    user,
    memberships,
    identityChoices,
    selectWorkspace,
    selectIdentity,
    signOut,
    cancelIdentitySelection,
    error,
    isLoading,
  } = useAuth();

  const isIdentitySelection = state === "IDENTITY_SELECTION";

  const handleCancel = () => {
    if (isIdentitySelection) {
      void cancelIdentitySelection();
      return;
    }
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out of HouzzatPRO?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: () => signOut() },
      ],
    );
  };

  const renderMembership = ({ item }: { item: MobileWorkspaceMembership }) => {
    const ws = item.workspace;
    const primaryColor = ws.brand?.primaryColor || "#0F6B4C";

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => selectWorkspace(item.workspaceId)}
        disabled={isLoading}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.avatarBadge, { backgroundColor: primaryColor }]}>
            <Text style={styles.avatarText}>
              {ws.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.workspaceName}>{ws.displayName}</Text>
            <Text style={styles.workspaceSlug}>{ws.slug}</Text>
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{item.role}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.idLabel}>ID: {item.workspaceId}</Text>
          <Text style={styles.selectCta}>Select →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderIdentity = ({ item }: { item: MobileIdentityChoice }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => selectIdentity(item.workspaceId)}
      disabled={isLoading}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.avatarBadge, { backgroundColor: "#0F6B4C" }]}>
          <Text style={styles.avatarText}>
            {item.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.workspaceName}>{item.displayName}</Text>
          <Text style={styles.workspaceSlug}>{item.slug}</Text>
        </View>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{item.role}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.idLabel}>ID: {item.workspaceId}</Text>
        <Text style={styles.selectCta}>Continue →</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <View style={styles.topBar}>
        <HouzzatProWordmark size="sm" dark={true} />
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.signOutText}>
            {isIdentitySelection ? "Cancel" : "Sign Out"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.intro}>
        <Text style={styles.title}>
          {isIdentitySelection ? "Select Workspace" : "Select Workspace"}
        </Text>
        <Text style={styles.subtitle}>
          {isIdentitySelection ? (
            "Choose which brokerage identity to open"
          ) : (
            <>
              Signed in as <Text style={styles.userEmail}>{user?.email}</Text>
            </>
          )}
        </Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      {isIdentitySelection ? (
        <FlatList
          data={identityChoices}
          keyExtractor={(item) => item.workspaceId}
          renderItem={renderIdentity}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={memberships}
          keyExtractor={(item) => item.id}
          renderItem={renderMembership}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Tenancy authority: workspaceId • Hostname independent
        </Text>
      </View>
    </View>
  );
}

const topPadding = Platform.OS === "android" ? Math.max(StatusBar.currentHeight || 0, 42) + 12 : 24;
const bottomPadding = Platform.OS === "android" ? 56 : 24;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingTop: topPadding,
    paddingHorizontal: 20,
    paddingBottom: bottomPadding,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  signOutText: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "700",
  },
  intro: {
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1E2A38",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
  },
  userEmail: {
    color: "#1E2A38",
    fontWeight: "700",
  },
  errorText: {
    marginTop: 8,
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: "600",
  },
  listContent: {
    gap: 12,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  headerText: {
    flex: 1,
  },
  workspaceName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  workspaceSlug: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleText: {
    color: "#0369A1",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  idLabel: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#94A3B8",
  },
  selectCta: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F6B4C",
  },
  footer: {
    alignItems: "center",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
  },
});
