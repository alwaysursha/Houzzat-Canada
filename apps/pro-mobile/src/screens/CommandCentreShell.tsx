/**
 * Stage 4.3B — Native Command Centre Shell with Visual Restoration.
 *
 * Faithfully matches the original HouzzatPRO Owner/Broker experience:
 * - Top Navigation Bar in Dark Slate (#1E2A38) with Hamburger Menu & Command Centre identity
 * - Native Slide-in Drawer with navigation options & Agent Mode switch
 * - Bottom Navigation Tabs (Overview, Team, Leads, Calendar, More)
 * - 0ms instant tab switching & drawer opening
 * - Preserves Leads screen with real Stage 4.3A workspace data
 */

import React, { useState } from "react";
import {
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { HouzzatProWordmark } from "../components/BrandMark";
import { NativeDrawer, type DrawerItem } from "../components/NativeDrawer";
import { useAuth } from "../state/AuthContext";
import { AgentShell } from "./AgentShell";
import { LeadDetailScreen } from "./LeadDetailScreen";
import { LeadsScreen } from "./LeadsScreen";

type CommandCentreTab = "overview" | "team" | "leads" | "calendar" | "more";

export function CommandCentreShell() {
  const {
    user,
    activeWorkspace,
    activeMembership,
    memberships,
    changeWorkspace,
    signOut,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<CommandCentreTab>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeDrawerId, setActiveDrawerId] = useState("launchpad");
  const [inAgentMode, setInAgentMode] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadNavIds, setLeadNavIds] = useState<string[]>([]);

  const hasMultipleWorkspaces = memberships.length > 1;
  const brandDisplayName = activeWorkspace?.displayName || "HouzzatPRO";
  const orgName = activeWorkspace?.slug ? `${activeWorkspace.slug}.houzzatpro.com` : "Command Centre";
  const userRole = activeMembership?.role || "OWNER";
  const userEmail = user?.email || "";

  // If the owner/admin entered Agent Mode, render the AgentShell with return callback
  if (inAgentMode) {
    return <AgentShell onReturnToCommandCentre={() => setInAgentMode(false)} />;
  }

  const handleSelectDrawerItem = (item: DrawerItem) => {
    setActiveDrawerId(item.id);
    if (item.tabKey === "launchpad") setActiveTab("overview");
    else if (item.tabKey === "leads") setActiveTab("leads");
    else if (item.tabKey === "tasks") setActiveTab("team");
    else if (item.tabKey === "calendar") setActiveTab("calendar");
    else setActiveTab("more");
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out of HouzzatPRO?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: () => signOut() },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1E2A38" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setDrawerOpen(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>

          <View style={styles.headerTitleGroup}>
            <Text style={styles.brandTitle} numberOfLines={1}>
              {brandDisplayName}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              COMMAND CENTRE · {orgName}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.agentModeBtn}
          onPress={() => setInAgentMode(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.agentModeBtnText}>AGENT DESK →</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Body Content */}
      <View style={styles.body}>
        {activeTab === "overview" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Overview Banner */}
            <View style={styles.overviewCard}>
              <Text style={styles.overviewGreeting}>Command Centre</Text>
              <Text style={styles.brokerageName}>{brandDisplayName}</Text>
              <Text style={styles.overviewSubtext}>
                Brokerage executive overview, team distribution, and lead authority monitor.
              </Text>
            </View>

            {/* Operations Summary */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardSectionTitle}>Brokerage Status</Text>
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>ACTIVE</Text>
                </View>
              </View>

              <View style={styles.metricRow}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricValue}>1</Text>
                  <Text style={styles.metricLabel}>Workspace</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricValue}>{userRole}</Text>
                  <Text style={styles.metricLabel}>Authority</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricValue}>v2.0</Text>
                  <Text style={styles.metricLabel}>Engine</Text>
                </View>
              </View>
            </View>

            {/* Quick Switch to Agent Mode */}
            <TouchableOpacity
              style={styles.actionBtnPrimary}
              activeOpacity={0.85}
              onPress={() => setInAgentMode(true)}
            >
              <Text style={styles.actionBtnPrimaryText}>👤 Open Personal Agent Desk</Text>
            </TouchableOpacity>

            {/* Security Isolation Info */}
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>Tenant Scope Boundary</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Workspace ID:</Text>
                <Text style={styles.infoValMono} numberOfLines={1}>
                  {activeWorkspace?.id}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Role Authority:</Text>
                <Text style={styles.infoVal}>WorkspaceMember.role = {userRole}</Text>
              </View>
            </View>
          </ScrollView>
        )}

        {activeTab === "team" && (
          <View style={styles.placeholderContainer}>
            <View style={styles.placeholderIconBox}>
              <Text style={styles.placeholderIconText}>👥</Text>
            </View>
            <Text style={styles.placeholderTitle}>Brokerage Team</Text>
            <Text style={styles.placeholderSubtitle}>
              Agent roster, lead routing, and performance metrics.
            </Text>
            <View style={styles.placeholderTag}>
              <Text style={styles.placeholderTagText}>ALL AGENTS ACTIVE</Text>
            </View>
          </View>
        )}

        {activeTab === "leads" && (
          <LeadsScreen
            selectedLeadId={selectedLeadId}
            onSelectLead={(leadId, leadIds) => {
              setLeadNavIds(leadIds);
              setSelectedLeadId(leadId);
            }}
          />
        )}

        {activeTab === "calendar" && (
          <View style={styles.placeholderContainer}>
            <View style={styles.placeholderIconBox}>
              <Text style={styles.placeholderIconText}>📅</Text>
            </View>
            <Text style={styles.placeholderTitle}>Brokerage Appointments</Text>
            <Text style={styles.placeholderSubtitle}>
              Team showing schedules and calendar sync.
            </Text>
          </View>
        )}

        {activeTab === "more" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* User Profile */}
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>Executive Profile</Text>
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

            {/* Workspace Identity */}
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>Active Workspace</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Name:</Text>
                <Text style={styles.infoVal}>{brandDisplayName}</Text>
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

            {/* Agent Mode Switch */}
            <TouchableOpacity
              style={styles.actionBtnPrimary}
              activeOpacity={0.85}
              onPress={() => setInAgentMode(true)}
            >
              <Text style={styles.actionBtnPrimaryText}>👤 Open Personal Agent Desk</Text>
            </TouchableOpacity>

            {/* Switch Workspace */}
            {hasMultipleWorkspaces && (
              <TouchableOpacity
                style={styles.actionBtnSecondary}
                activeOpacity={0.85}
                onPress={() => {
                  changeWorkspace();
                }}
              >
                <Text style={styles.actionBtnSecondaryText}>⇄ Switch Workspace</Text>
              </TouchableOpacity>
            )}

            {/* Sign Out Button */}
            <TouchableOpacity
              style={styles.signOutBtn}
              activeOpacity={0.85}
              onPress={handleSignOut}
            >
              <Text style={styles.signOutBtnText}>Sign Out of HouzzatPRO</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      {/* Bottom Navigation matching original HouzzatPRO */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => {
            setActiveTab("overview");
            setActiveDrawerId("launchpad");
          }}
        >
          <View style={[styles.navIconBox, activeTab === "overview" && styles.navIconBoxActive]}>
            <Text style={[styles.navIcon, activeTab === "overview" && styles.navIconActive]}>
              ⌂
            </Text>
          </View>
          <Text style={[styles.navLabel, activeTab === "overview" && styles.navLabelActive]}>
            Overview
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => {
            setActiveTab("team");
            setActiveDrawerId("tasks");
          }}
        >
          <View style={[styles.navIconBox, activeTab === "team" && styles.navIconBoxActive]}>
            <Text style={[styles.navIcon, activeTab === "team" && styles.navIconActive]}>
              👥
            </Text>
          </View>
          <Text style={[styles.navLabel, activeTab === "team" && styles.navLabelActive]}>
            Team
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => {
            setActiveTab("leads");
            setActiveDrawerId("leads");
          }}
        >
          <View style={[styles.navIconBox, activeTab === "leads" && styles.navIconBoxActive]}>
            <Text style={[styles.navIcon, activeTab === "leads" && styles.navIconActive]}>
              📊
            </Text>
          </View>
          <Text style={[styles.navLabel, activeTab === "leads" && styles.navLabelActive]}>
            Leads
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => {
            setActiveTab("calendar");
            setActiveDrawerId("calendar");
          }}
        >
          <View style={[styles.navIconBox, activeTab === "calendar" && styles.navIconBoxActive]}>
            <Text style={[styles.navIcon, activeTab === "calendar" && styles.navIconActive]}>
              📅
            </Text>
          </View>
          <Text style={[styles.navLabel, activeTab === "calendar" && styles.navLabelActive]}>
            Calendar
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => setDrawerOpen(true)}
        >
          <View style={[styles.navIconBox, drawerOpen && styles.navIconBoxActive]}>
            <Text style={[styles.navIcon, drawerOpen && styles.navIconActive]}>
              ☰
            </Text>
          </View>
          <Text style={[styles.navLabel, drawerOpen && styles.navLabelActive]}>
            More
          </Text>
        </TouchableOpacity>
      </View>

      {/* Native Slide-in Navigation Drawer */}
      <NativeDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeItemId={activeDrawerId}
        onSelectItem={handleSelectDrawerItem}
        brandDisplayName={brandDisplayName}
        orgName={orgName}
        userEmail={userEmail}
        membershipRole={userRole}
        hasMultipleWorkspaces={hasMultipleWorkspaces}
        onChangeWorkspace={() => {
          changeWorkspace();
        }}
        onSignOut={() => signOut()}
        onSwitchToAgentMode={() => setInAgentMode(true)}
      />

      {selectedLeadId ? (
        <View style={styles.leadDetailOverlay}>
          <LeadDetailScreen
            leadId={selectedLeadId}
            leadIds={leadNavIds}
            onNavigateLead={(id) => setSelectedLeadId(id)}
            onBack={() => {
              setSelectedLeadId(null);
              setLeadNavIds([]);
            }}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const topHeaderPadding = Platform.OS === "android" ? Math.max(StatusBar.currentHeight || 0, 42) + 8 : 10;
const bottomNavPadding = Platform.OS === "android" ? 54 : 20;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#1E2A38",
  },
  leadDetailOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
    backgroundColor: "#FFFFFF",
  },
  header: {
    backgroundColor: "#1E2A38",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: topHeaderPadding,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuIcon: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  headerTitleGroup: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.5)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  agentModeBtn: {
    backgroundColor: "#0F6B4C", // Canopy green
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  agentModeBtnText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  body: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: Platform.OS === "android" ? 36 : 24,
    gap: 14,
  },
  overviewCard: {
    backgroundColor: "#1E2A38",
    borderRadius: 14,
    padding: 18,
    gap: 4,
    shadowColor: "rgba(0, 0, 0, 0.15)",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  overviewGreeting: {
    fontSize: 12,
    fontWeight: "800",
    color: "#96F0D8",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  brokerageName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 2,
    letterSpacing: -0.4,
  },
  overviewSubtext: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 18,
    marginTop: 6,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    shadowColor: "rgba(15, 23, 42, 0.04)",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E2A38",
  },
  activeBadge: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0F6B4C",
    letterSpacing: 0.8,
  },
  metricRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricBox: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1E2A38",
  },
  metricLabel: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  infoKey: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  infoVal: {
    fontSize: 13,
    color: "#1E2A38",
    fontWeight: "600",
  },
  infoValMono: {
    fontSize: 12,
    color: "#475569",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  rolePillSmall: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rolePillSmallText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F6B4C",
  },
  actionBtnPrimary: {
    backgroundColor: "#0F6B4C",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "rgba(15, 107, 76, 0.25)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  actionBtnSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  actionBtnSecondaryText: {
    color: "#1E2A38",
    fontSize: 13,
    fontWeight: "700",
  },
  signOutBtn: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 8,
  },
  signOutBtnText: {
    color: "#DC2626",
    fontSize: 13,
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
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  placeholderIconText: {
    fontSize: 26,
    color: "#64748B",
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E2A38",
    marginBottom: 6,
  },
  placeholderSubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
  placeholderTag: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  placeholderTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0F6B4C",
    letterSpacing: 0.8,
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 10,
    paddingBottom: bottomNavPadding,
    minHeight: Platform.OS === "android" ? 102 : 64,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    gap: 3,
  },
  navIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  navIconBoxActive: {
    backgroundColor: "rgba(30, 42, 56, 0.1)",
  },
  navIcon: {
    fontSize: 16,
    color: "#5B6775",
  },
  navIconActive: {
    color: "#1E2A38",
    fontWeight: "bold",
  },
  navLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#5B6775",
  },
  navLabelActive: {
    color: "#1E2A38",
    fontWeight: "700",
  },
});
