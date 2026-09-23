/**
 * Stage 4.3B — Native Command Centre Shell with Visual Restoration.
 *
 * Faithfully matches the original HouzzatPRO Owner/Broker experience:
 * - Top Navigation Bar in Dark Slate (#1E2A38) with Hamburger Menu & Command Centre identity
 * - Native Slide-in Drawer with navigation options & Agent Mode switch
 * - Bottom Navigation Tabs (Overview, Lead Routing, People, CRM, More)
 * - 0ms instant tab switching & drawer opening
 * - Preserves Leads screen with real Stage 4.3A workspace data
 */

import React, { useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { HouzzatProWordmark } from "../components/BrandMark";
import { NativeDrawer, type DrawerItem } from "../components/NativeDrawer";
import { ViewingsLeadPickerSheet } from "../components/ViewingsLeadPickerSheet";
import { useAndroidHardwareBack } from "../hooks/useAndroidHardwareBack";
import { triggerNavHaptic } from "../lib/nav-haptics";
import { subscribePushNavigation } from "../lib/push-navigation";
import { useAuth } from "../state/AuthContext";
import { AgentShell } from "./AgentShell";
import { LeadDetailScreen } from "./LeadDetailScreen";
import { LeadsScreen } from "./LeadsScreen";
import { MoreHubScreen } from "./MoreHubScreen";
import {
  MoreUtilityScreen,
  type MoreUtilityId,
} from "./MoreUtilityScreen";
import { PropertiesSearchScreen } from "./PropertiesSearchScreen";
import { ShortlistScreen } from "./ShortlistScreen";
import { CommunicationsScreen } from "./CommunicationsScreen";
import { LeadRoutingScreen } from "./LeadRoutingScreen";
import { StatisticsScreen } from "./StatisticsScreen";
import { NotificationPreferencesScreen } from "./NotificationPreferencesScreen";
import { CmaScreen } from "./CmaScreen";
import { TeamScreen } from "./TeamScreen";
import { ViewingsPlannerScreen } from "./ViewingsPlannerScreen";

type CommandCentreTab =
  | "overview"
  | "leadRouting"
  | "people"
  | "crm"
  | "more";
type ActiveUtility = Exclude<MoreUtilityId, "account"> | null;

type ViewingsPlannerState = {
  leadId: string;
  mlsNumbers: string[];
  leadName?: string;
} | null;

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
  const [activeUtility, setActiveUtility] = useState<ActiveUtility>(null);
  const [inAgentMode, setInAgentMode] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadNavIds, setLeadNavIds] = useState<string[]>([]);
  const [viewingsPlanner, setViewingsPlanner] = useState<ViewingsPlannerState>(null);
  const [viewingsLeadPicker, setViewingsLeadPicker] = useState<{ mlsNumbers: string[] } | null>(
    null,
  );

  const hasMultipleWorkspaces = memberships.length > 1;
  const brandDisplayName = activeWorkspace?.displayName || "HouzzatPRO";
  const orgName = activeWorkspace?.slug ? `${activeWorkspace.slug}.houzzatpro.com` : "Command Centre";
  const userRole = activeMembership?.role || "OWNER";
  const userEmail = user?.email || "";
  const userName = user?.name ?? null;

  useEffect(() => {
    if (inAgentMode) return;
    return subscribePushNavigation((target) => {
      setActiveUtility(null);
      setDrawerOpen(false);
      setViewingsPlanner(null);
      setViewingsLeadPicker(null);
      if (target.kind === "lead") {
        setActiveTab("crm");
        setActiveDrawerId("leads");
        setLeadNavIds([target.leadId]);
        setSelectedLeadId(target.leadId);
        return;
      }
      if (target.kind === "tasks") {
        // Command Centre has no personal Tasks tab — open Agent Desk.
        setInAgentMode(true);
        return;
      }
      setSelectedLeadId(null);
      setLeadNavIds([]);
      setActiveTab("overview");
      setActiveDrawerId("launchpad");
    });
  }, [inAgentMode]);

  const selectTab = (tab: CommandCentreTab, drawerId?: string) => {
    triggerNavHaptic();
    setActiveTab(tab);
    if (drawerId) setActiveDrawerId(drawerId);
    setActiveUtility(null);
  };

  const handleSelectDrawerItem = (item: DrawerItem) => {
    setActiveDrawerId(item.id);
    if (item.utilityId && item.utilityId !== "account") {
      setActiveUtility(item.utilityId);
      setActiveTab("more");
      return;
    }
    setActiveUtility(null);
    if (item.tabKey === "launchpad") setActiveTab("overview");
    else if (item.tabKey === "leads") setActiveTab("crm");
    else if (item.id === "team") setActiveTab("people");
    else setActiveTab("more");
  };

  const handleSignOut = () => {
    void signOut();
  };

  useAndroidHardwareBack({
    onBack: () => {
      // Agent Mode mounts its own shell with its own back handler.
      if (inAgentMode) return false;
      if (viewingsPlanner) {
        setViewingsPlanner(null);
        return true;
      }
      if (viewingsLeadPicker) {
        setViewingsLeadPicker(null);
        return true;
      }
      if (selectedLeadId) {
        setSelectedLeadId(null);
        setLeadNavIds([]);
        return true;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      if (activeUtility) {
        setActiveUtility(null);
        setActiveDrawerId("account");
        setActiveTab("more");
        return true;
      }
      if (activeTab !== "overview") {
        setActiveTab("overview");
        setActiveDrawerId("launchpad");
        setActiveUtility(null);
        return true;
      }
      return false;
    },
    isAtRoot: () =>
      !inAgentMode &&
      !viewingsPlanner &&
      !viewingsLeadPicker &&
      !selectedLeadId &&
      !drawerOpen &&
      !activeUtility &&
      activeTab === "overview",
  });

  // If the owner/admin entered Agent Mode, render the AgentShell with return callback
  if (inAgentMode) {
    return <AgentShell onReturnToCommandCentre={() => setInAgentMode(false)} />;
  }

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

        {activeTab === "leadRouting" && <LeadRoutingScreen />}

        {activeTab === "people" && (
          <TeamScreen
            onOpenStatistics={
              userRole === "OWNER" || userRole === "ADMIN"
                ? () => {
                    setActiveTab("more");
                    setActiveUtility("statistics");
                    setActiveDrawerId("statistics");
                  }
                : undefined
            }
          />
        )}

        {activeTab === "crm" && (
          <LeadsScreen
            selectedLeadId={selectedLeadId}
            onSelectLead={(leadId, leadIds) => {
              setLeadNavIds(leadIds);
              setSelectedLeadId(leadId);
            }}
            onPlanViewings={(id, name, mlsNumbers) => {
              setViewingsPlanner({
                leadId: id,
                mlsNumbers: mlsNumbers ?? [],
                leadName: name,
              });
            }}
          />
        )}

        {activeTab === "more" && (
          activeUtility ? (
            activeUtility === "search" ? (
              <PropertiesSearchScreen
                onBack={() => {
                  setActiveUtility(null);
                  setActiveDrawerId("account");
                }}
                onPlanViewings={(mlsNumbers) => {
                  setViewingsLeadPicker({ mlsNumbers });
                }}
              />
            ) : activeUtility === "shortlist" ? (
              <ShortlistScreen
                onBack={() => {
                  setActiveUtility(null);
                  setActiveDrawerId("account");
                }}
                onBrowseProperties={() => {
                  setActiveUtility("search");
                  setActiveDrawerId("search");
                }}
                onPlanViewings={(mlsNumbers) => {
                  setViewingsLeadPicker({ mlsNumbers });
                }}
              />
            ) : activeUtility === "inbox" ? (
              <CommunicationsScreen
                onBack={() => {
                  setActiveUtility(null);
                  setActiveDrawerId("account");
                }}
                onOpenLead={(leadId) => {
                  setLeadNavIds([leadId]);
                  setSelectedLeadId(leadId);
                }}
              />
            ) : activeUtility === "statistics" ? (
              <StatisticsScreen
                onBack={() => {
                  setActiveUtility(null);
                  setActiveDrawerId("account");
                }}
              />
            ) : activeUtility === "cma" ? (
              <CmaScreen
                onBack={() => {
                  setActiveUtility(null);
                  setActiveDrawerId("account");
                }}
              />
            ) : activeUtility === "team" ? (
              <TeamScreen
                onBack={() => {
                  setActiveUtility(null);
                  setActiveDrawerId("account");
                }}
                onOpenStatistics={() => {
                  setActiveUtility("statistics");
                  setActiveDrawerId("statistics");
                }}
              />
            ) : activeUtility === "notifications" ? (
              <NotificationPreferencesScreen
                onBack={() => {
                  setActiveUtility(null);
                  setActiveDrawerId("account");
                }}
              />
            ) : (
              <MoreUtilityScreen
                utilityId={activeUtility}
                onBack={() => {
                  setActiveUtility(null);
                  setActiveDrawerId("account");
                }}
              />
            )
          ) : (
            <MoreHubScreen
              userEmail={userEmail}
              userName={userName}
              userRole={userRole}
              brandDisplayName={brandDisplayName}
              workspaceId={activeWorkspace?.id}
              workspaceSlug={activeWorkspace?.slug}
              hasMultipleWorkspaces={hasMultipleWorkspaces}
              onChangeWorkspace={() => {
                void changeWorkspace();
              }}
              onSignOut={handleSignOut}
              onOpenAgentDesk={() => setInAgentMode(true)}
              onOpenUtility={(id) => {
                setActiveUtility(id);
                setActiveDrawerId(id);
              }}
            />
          )
        )}
      </View>

      {/* Bottom Navigation — Overview | Lead Routing | People | CRM | More */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => selectTab("overview", "launchpad")}
        >
          <View style={[styles.navIconBox, activeTab === "overview" && styles.navIconBoxActive]}>
            <Text style={[styles.navIcon, activeTab === "overview" && styles.navIconActive]}>
              ⌂
            </Text>
          </View>
          <Text
            style={[styles.navLabel, activeTab === "overview" && styles.navLabelActive]}
            numberOfLines={1}
          >
            Overview
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => selectTab("leadRouting", "lead-routing")}
        >
          <View
            style={[
              styles.navIconBox,
              activeTab === "leadRouting" && styles.navIconBoxActive,
            ]}
          >
            <Text
              style={[
                styles.navIcon,
                activeTab === "leadRouting" && styles.navIconActive,
              ]}
            >
              %
            </Text>
          </View>
          <Text
            style={[
              styles.navLabel,
              activeTab === "leadRouting" && styles.navLabelActive,
            ]}
            numberOfLines={1}
          >
            Lead Routing
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => selectTab("people", "team")}
        >
          <View style={[styles.navIconBox, activeTab === "people" && styles.navIconBoxActive]}>
            <Text
              style={[
                styles.navIcon,
                styles.navIconEmoji,
                activeTab === "people" && styles.navIconActive,
              ]}
            >
              👥
            </Text>
          </View>
          <Text
            style={[styles.navLabel, activeTab === "people" && styles.navLabelActive]}
            numberOfLines={1}
          >
            People
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => selectTab("crm", "leads")}
        >
          <View style={[styles.navIconBox, activeTab === "crm" && styles.navIconBoxActive]}>
            <Text style={[styles.navIcon, activeTab === "crm" && styles.navIconActive]}>
              ◫
            </Text>
          </View>
          <Text
            style={[styles.navLabel, activeTab === "crm" && styles.navLabelActive]}
            numberOfLines={1}
          >
            CRM
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => {
            triggerNavHaptic();
            setDrawerOpen(true);
          }}
        >
          <View style={[styles.navIconBox, drawerOpen && styles.navIconBoxActive]}>
            <Text style={[styles.navIcon, drawerOpen && styles.navIconActive]}>
              ☰
            </Text>
          </View>
          <Text
            style={[styles.navLabel, drawerOpen && styles.navLabelActive]}
            numberOfLines={1}
          >
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
            onPlanViewings={(id, name, mlsNumbers) => {
              setViewingsPlanner({
                leadId: id,
                mlsNumbers: mlsNumbers ?? [],
                leadName: name,
              });
            }}
          />
        </View>
      ) : null}

      {viewingsLeadPicker ? (
        <ViewingsLeadPickerSheet
          visible
          onClose={() => setViewingsLeadPicker(null)}
          onSelect={(leadId, leadName) => {
            setViewingsPlanner({
              leadId,
              leadName,
              mlsNumbers: viewingsLeadPicker.mlsNumbers,
            });
            setViewingsLeadPicker(null);
          }}
        />
      ) : null}

      {viewingsPlanner ? (
        <View style={styles.viewingsPlannerOverlay}>
          <ViewingsPlannerScreen
            leadId={viewingsPlanner.leadId}
            leadName={viewingsPlanner.leadName}
            initialMlsNumbers={viewingsPlanner.mlsNumbers}
            onBack={() => setViewingsPlanner(null)}
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
  viewingsPlannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 110,
    elevation: 110,
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
    width: 28,
    height: 28,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  navIconBoxActive: {
    backgroundColor: "rgba(30, 42, 56, 0.1)",
  },
  navIcon: {
    fontSize: 14,
    color: "#5B6775",
  },
  navIconEmoji: {
    fontSize: 13,
    lineHeight: 15,
  },
  navIconActive: {
    color: "#1E2A38",
    fontWeight: "bold",
  },
  navLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#5B6775",
    textAlign: "center",
    paddingHorizontal: 1,
  },
  navLabelActive: {
    color: "#1E2A38",
    fontWeight: "700",
  },
});
