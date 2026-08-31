/**
 * Stage 4.2 — Native Access Unavailable Screen.
 *
 * Rendered if a user successfully authenticates into a workspace
 * but has an unknown or unsupported mobile workspace role.
 */

import React from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { HouzzatProWordmark } from "../components/BrandMark";
import { useAuth } from "../state/AuthContext";

export function AccessUnavailableScreen() {
  const {
    user,
    activeWorkspace,
    activeMembership,
    memberships,
    changeWorkspace,
    signOut,
  } = useAuth();

  const hasMultipleWorkspaces = memberships.length > 1;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <HouzzatProWordmark size="md" dark={true} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>🔒</Text>
        </View>

        <Text style={styles.title}>Access Unavailable</Text>
        <Text style={styles.subtitle}>
          Your workspace membership role does not currently have permissions to access the mobile application.
        </Text>

        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>User:</Text>
            <Text style={styles.infoVal}>{user?.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Workspace:</Text>
            <Text style={styles.infoVal}>{activeWorkspace?.displayName || "Unknown"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Role Reported:</Text>
            <Text style={styles.infoValWarn}>{activeMembership?.role || "UNKNOWN"}</Text>
          </View>
        </View>

        <View style={styles.actionStack}>
          {hasMultipleWorkspaces ? (
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

      <View style={styles.footer}>
        <Text style={styles.footerText}>HouzzatPRO Native v2.0 • Strict Role Authority</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    justifyContent: "space-between",
  },
  header: {
    paddingTop: 24,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  content: {
    paddingHorizontal: 24,
    alignItems: "center",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  infoKey: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  infoVal: {
    fontSize: 13,
    color: "#1E293B",
    fontWeight: "600",
  },
  infoValWarn: {
    fontSize: 13,
    color: "#DC2626",
    fontWeight: "700",
  },
  actionStack: {
    width: "100%",
    gap: 10,
  },
  switchButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  switchButtonText: {
    color: "#0B5C49",
    fontSize: 15,
    fontWeight: "700",
  },
  signOutButton: {
    backgroundColor: "#FEE2E2",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  signOutButtonText: {
    color: "#DC2626",
    fontSize: 15,
    fontWeight: "700",
  },
  footer: {
    paddingBottom: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
  },
});
