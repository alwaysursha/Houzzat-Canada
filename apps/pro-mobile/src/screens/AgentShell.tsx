/**
 * Stage 4.3B — Native Agent Shell with Visual Restoration.
 *
 * Faithfully matches the original HouzzatPRO Agent experience:
 * - Top Navigation Bar in Dark Slate (#1E2A38) with Hamburger Menu, Brand Title, Workspace Subtitle, and Call New Action
 * - Native Slide-in Drawer with complete previous navigation list
 * - Bottom Navigation Tabs matching original mobile layout (Launchpad, Leads, Tasks, Calendar, More)
 * - 0ms instant tab switching and drawer opening (pure React state, no network, no self-closing bug)
 * - Launchpad screen with Quick Modules, Todo status, and Contact Requested cards
 * - Leads screen with real Stage 4.3A workspace data, search, and status filters
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
import { LaunchpadScreen } from "./LaunchpadScreen";
import { LeadDetailScreen } from "./LeadDetailScreen";
import { LeadsScreen } from "./LeadsScreen";

type AgentTab = "launchpad" | "leads" | "tasks" | "calendar" | "more";

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

  const [activeTab, setActiveTab] = useState<AgentTab>("launchpad");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeDrawerId, setActiveDrawerId] = useState("launchpad");
  const [leadsInitialFilter, setLeadsInitialFilter] = useState<string | undefined>(undefined);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadNavIds, setLeadNavIds] = useState<string[]>([]);

  const hasMultipleWorkspaces = memberships.length > 1;
  const brandDisplayName = activeWorkspace?.displayName || "HouzzatPRO";
  const orgName = activeWorkspace?.slug ? `${activeWorkspace.slug}.houzzatpro.com` : "Agent Desk";
  const userRole = activeMembership?.role || "AGENT";
  const userEmail = user?.email || "";

  const handleSelectDrawerItem = (item: DrawerItem) => {
    setActiveDrawerId(item.id);
    if (item.tabKey) {
      setActiveTab(item.tabKey);
    }
  };

  const handleCallNewAction = () => {
    setLeadsInitialFilter("NEW_LEAD");
    setActiveTab("leads");
    setActiveDrawerId("leads");
  };

  const handleNavigateToLeads = (statusFilter?: string) => {
    setLeadsInitialFilter(statusFilter);
    setActiveTab("leads");
    setActiveDrawerId("leads");
  };

  const handleNavigateToTasks = () => {
    setActiveTab("tasks");
    setActiveDrawerId("tasks");
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

      {/* Top Header matching original HouzzatPRO */}
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
              {activeTab.toUpperCase()} · {orgName}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.callNewBtn}
            onPress={handleCallNewAction}
            activeOpacity={0.85}
          >
            <Text style={styles.callNewBtnText}>CALL NEW</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Body Content Area */}
      <View style={styles.body}>
        {activeTab === "launchpad" && (
          <LaunchpadScreen
            onNavigateToLeads={handleNavigateToLeads}
            onNavigateToTasks={handleNavigateToTasks}
          />
        )}

        {activeTab === "leads" && (
          <LeadsScreen
            initialStatusFilter={leadsInitialFilter}
            selectedLeadId={selectedLeadId}
            onSelectLead={(leadId, leadIds) => {
              setLeadNavIds(leadIds);
              setSelectedLeadId(leadId);
            }}
          />
        )}

        {activeTab === "tasks" && (
          <View style={styles.placeholderContainer}>
            <View style={styles.placeholderIconBox}>
              <Text style={styles.placeholderIconText}>✓</Text>
            </View>
            <Text style={styles.placeholderTitle}>Tasks & Reminders</Text>
            <Text style={styles.placeholderSubtitle}>
              All open follow-up actions and scheduled tasks.
            </Text>
            <View style={styles.placeholderTag}>
              <Text style={styles.placeholderTagText}>ALL CAUGHT UP</Text>
            </View>
          </View>
        )}

        {activeTab === "calendar" && (
          <View style={styles.placeholderContainer}>
            <View style={styles.placeholderIconBox}>
              <Text style={styles.placeholderIconText}>📅</Text>
            </View>
            <Text style={styles.placeholderTitle}>Appointments & Calendar</Text>
            <Text style={styles.placeholderSubtitle}>
              Sync showing schedules and client appointments.
            </Text>
          </View>
        )}

        {activeTab === "more" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* User Profile */}
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>User Profile</Text>
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
            setActiveTab("launchpad");
            setActiveDrawerId("launchpad");
          }}
        >
          <View style={[styles.navIconBox, activeTab === "launchpad" && styles.navIconBoxActive]}>
            <Text style={[styles.navIcon, activeTab === "launchpad" && styles.navIconActive]}>
              ⌂
            </Text>
          </View>
          <Text style={[styles.navLabel, activeTab === "launchpad" && styles.navLabelActive]}>
            Launchpad
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
              👥
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
            setActiveTab("tasks");
            setActiveDrawerId("tasks");
          }}
        >
          <View style={[styles.navIconBox, activeTab === "tasks" && styles.navIconBoxActive]}>
            <Text style={[styles.navIcon, activeTab === "tasks" && styles.navIconActive]}>
              ✓
            </Text>
          </View>
          <Text style={[styles.navLabel, activeTab === "tasks" && styles.navLabelActive]}>
            Tasks
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
      />

      {/* Lead Detail overlay — matches web LeadQuickPopup full-screen modal */}
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
    backgroundColor: "#1E2A38", // Header color
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
  headerRight: {
    marginLeft: 8,
  },
  callNewBtn: {
    backgroundColor: "#E11D48", // Rose / red from original app
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    shadowColor: "#E11D48",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  callNewBtnText: {
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
  cardSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E2A38",
    marginBottom: 4,
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
    backgroundColor: "rgba(15, 107, 76, 0.12)",
  },
  navIcon: {
    fontSize: 16,
    color: "#5B6775",
  },
  navIconActive: {
    color: "#0F6B4C", // Canopy green
    fontWeight: "bold",
  },
  navLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#5B6775",
  },
  navLabelActive: {
    color: "#0F6B4C",
    fontWeight: "700",
  },
});
