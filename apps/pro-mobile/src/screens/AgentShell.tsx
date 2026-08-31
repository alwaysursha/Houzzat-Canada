/**
 * Stage 4.2 — Native Agent Application Shell.
 *
 * Dedicated native navigation shell for AGENT workspace role.
 * Bottom Tabs: Home | Leads | Tasks | More
 *
 * Features:
 * - Immediate 0ms native tab switching (pure React state)
 * - Safe area handling for Samsung Fold6 and Android/iOS devices
 * - Tenant workspace identity & branding
 * - Workspace switching (only if multiple memberships)
 * - Controlled logout
 */

import React, { useState } from "react";
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { HouzzatProBadge, HouzzatProWordmark } from "../components/BrandMark";
import { useAuth } from "../state/AuthContext";
import { LeadsScreen } from "./LeadsScreen";

type AgentTab = "home" | "leads" | "tasks" | "more";

export function AgentShell({
  onReturnToCommandCentre,
}: {
  onReturnToCommandCentre?: () => void;
}) {
  const {
    user,
    activeWorkspace,
    activeMembership,
    memberships,
    changeWorkspace,
    signOut,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<AgentTab>("home");

  const hasMultipleWorkspaces = memberships.length > 1;
  const agentDisplayName = user?.email?.split("@")[0] || "Agent";
  const primaryBrandColor = activeWorkspace?.brand?.primaryColor || "#0B5C49";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#102A22" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerBrandRow}>
          <HouzzatProWordmark size="sm" dark={false} />
          <View style={styles.roleTag}>
            <Text style={styles.roleTagText}>{activeMembership?.role || "AGENT"}</Text>
          </View>
        </View>

        <View style={styles.workspaceBanner}>
          <View style={[styles.workspaceAvatar, { backgroundColor: primaryBrandColor }]}>
            <Text style={styles.workspaceAvatarText}>
              {activeWorkspace?.displayName?.charAt(0).toUpperCase() || "W"}
            </Text>
          </View>
          <View style={styles.workspaceInfo}>
            <Text style={styles.workspaceTitle} numberOfLines={1}>
              {activeWorkspace?.displayName || "Houzzat Workspace"}
            </Text>
            <Text style={styles.workspaceSubtitle} numberOfLines={1}>
              {activeWorkspace?.slug ? `${activeWorkspace.slug}.houzzatpro.com` : "Active Tenant"}
            </Text>
          </View>
        </View>
      </View>

      {/* Tab Content Body */}
      <View style={styles.body}>
        {activeTab === "home" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Welcome Greeting */}
            <View style={styles.welcomeCard}>
              <Text style={styles.welcomeGreeting}>Welcome back,</Text>
              <Text style={styles.agentName}>{agentDisplayName}</Text>
              <Text style={styles.welcomeSubtext}>
                Your HouzzatPRO Agent desk is active and connected to your workspace.
              </Text>
            </View>

            {/* Quick Status Card */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardSectionTitle}>Agent Launchpad</Text>
                <View style={styles.onlineBadge}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.onlineBadgeText}>CONNECTED</Text>
                </View>
              </View>

              <View style={styles.metricRow}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricValue}>0</Text>
                  <Text style={styles.metricLabel}>New Leads</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricValue}>0</Text>
                  <Text style={styles.metricLabel}>Active Tasks</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricValue}>100%</Text>
                  <Text style={styles.metricLabel}>Response Rate</Text>
                </View>
              </View>
            </View>

            {/* Tenant Security Info Card */}
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>Workspace Isolation</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Workspace ID:</Text>
                <Text style={styles.infoValMono} numberOfLines={1}>
                  {activeWorkspace?.id}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Authority:</Text>
                <Text style={styles.infoVal}>WorkspaceMember.role = AGENT</Text>
              </View>
            </View>
          </ScrollView>
        )}

        {activeTab === "leads" && <LeadsScreen />}

        {activeTab === "tasks" && (
          <View style={styles.placeholderContainer}>
            <View style={styles.placeholderIconBox}>
              <Text style={styles.placeholderIconText}>✓</Text>
            </View>
            <Text style={styles.placeholderTitle}>Tasks</Text>
            <Text style={styles.placeholderSubtitle}>
              Your tasks will appear here.
            </Text>
            <View style={styles.placeholderTag}>
              <Text style={styles.placeholderTagText}>STAGE 4.2 NATIVE SHELL</Text>
            </View>
          </View>
        )}

        {activeTab === "more" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* User Account Details */}
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>User Profile</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Email:</Text>
                <Text style={styles.infoVal}>{user?.email}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Role:</Text>
                <View style={styles.rolePillSmall}>
                  <Text style={styles.rolePillSmallText}>{activeMembership?.role}</Text>
                </View>
              </View>
            </View>

            {/* Workspace Identity */}
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>Active Workspace</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Name:</Text>
                <Text style={styles.infoVal}>{activeWorkspace?.displayName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Workspace ID:</Text>
                <Text style={styles.infoValMono}>{activeWorkspace?.id}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Tenant Slug:</Text>
                <Text style={styles.infoValMono}>{activeWorkspace?.slug}</Text>
              </View>
            </View>

            {/* Return to Command Centre if opened by OWNER/ADMIN */}
            {onReturnToCommandCentre ? (
              <TouchableOpacity
                style={styles.actionBtnSecondary}
                activeOpacity={0.85}
                onPress={onReturnToCommandCentre}
              >
                <Text style={styles.actionBtnSecondaryText}>← Return to Command Centre</Text>
              </TouchableOpacity>
            ) : null}

            {/* Workspace Switcher (ONLY if user belongs to multiple workspaces) */}
            {hasMultipleWorkspaces ? (
              <TouchableOpacity
                style={styles.actionBtnSecondary}
                activeOpacity={0.85}
                onPress={changeWorkspace}
              >
                <Text style={styles.actionBtnSecondaryText}>⇄ Switch Workspace</Text>
              </TouchableOpacity>
            ) : null}

            {/* Logout CTA */}
            <TouchableOpacity
              style={styles.actionBtnDanger}
              activeOpacity={0.85}
              onPress={signOut}
            >
              <Text style={styles.actionBtnDangerText}>Sign Out</Text>
            </TouchableOpacity>

            <Text style={styles.footerVersion}>HouzzatPRO Native v2.0</Text>
          </ScrollView>
        )}
      </View>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => setActiveTab("home")}
        >
          <Text style={[styles.navIcon, activeTab === "home" && styles.navIconActive]}>⌂</Text>
          <Text style={[styles.navLabel, activeTab === "home" && styles.navLabelActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => setActiveTab("leads")}
        >
          <Text style={[styles.navIcon, activeTab === "leads" && styles.navIconActive]}>👥</Text>
          <Text style={[styles.navLabel, activeTab === "leads" && styles.navLabelActive]}>Leads</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => setActiveTab("tasks")}
        >
          <Text style={[styles.navIcon, activeTab === "tasks" && styles.navIconActive]}>✓</Text>
          <Text style={[styles.navLabel, activeTab === "tasks" && styles.navLabelActive]}>Tasks</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => setActiveTab("more")}
        >
          <Text style={[styles.navIcon, activeTab === "more" && styles.navIconActive]}>•••</Text>
          <Text style={[styles.navLabel, activeTab === "more" && styles.navLabelActive]}>More</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#102A22",
  },
  header: {
    backgroundColor: "#102A22",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 14 : 6,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  headerBrandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  roleTag: {
    backgroundColor: "rgba(150, 240, 216, 0.16)",
    borderColor: "#96F0D8",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleTagText: {
    color: "#96F0D8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  workspaceBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    padding: 10,
    borderRadius: 12,
  },
  workspaceAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  workspaceAvatarText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  workspaceInfo: {
    flex: 1,
  },
  workspaceTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  workspaceSubtitle: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 11,
  },
  body: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    padding: 18,
    gap: 14,
  },
  welcomeCard: {
    backgroundColor: "#0B5C49",
    borderRadius: 16,
    padding: 18,
    shadowColor: "#0B5C49",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  welcomeGreeting: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 13,
    fontWeight: "500",
  },
  agentName: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 2,
    marginBottom: 6,
  },
  welcomeSubtext: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 12,
    lineHeight: 18,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
  },
  onlineBadgeText: {
    color: "#16A34A",
    fontSize: 10,
    fontWeight: "800",
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  metricBox: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0B5C49",
  },
  metricLabel: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 4,
    fontWeight: "500",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  infoValMono: {
    fontSize: 12,
    color: "#0F172A",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontWeight: "600",
  },
  rolePillSmall: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rolePillSmallText: {
    color: "#0369A1",
    fontSize: 12,
    fontWeight: "700",
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  placeholderIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  placeholderIconText: {
    fontSize: 28,
  },
  placeholderTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 8,
  },
  placeholderSubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  placeholderTag: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  placeholderTagText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  actionBtnSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  actionBtnSecondaryText: {
    color: "#0B5C49",
    fontSize: 14,
    fontWeight: "700",
  },
  actionBtnDanger: {
    backgroundColor: "#FEE2E2",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  actionBtnDangerText: {
    color: "#DC2626",
    fontSize: 14,
    fontWeight: "700",
  },
  footerVersion: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "500",
    marginTop: 8,
    marginBottom: 16,
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 10,
    paddingBottom: Platform.OS === "android" ? 36 : 20,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 2,
  },
  navIcon: {
    fontSize: 18,
    color: "#94A3B8",
  },
  navIconActive: {
    color: "#0B5C49",
    fontWeight: "800",
  },
  navLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
  },
  navLabelActive: {
    color: "#0B5C49",
    fontWeight: "800",
  },
});
