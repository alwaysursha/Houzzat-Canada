/**
 * Stage 4.3B — Native Agent Shell with Visual Restoration.
 *
 * Faithfully matches the original HouzzatPRO Agent experience:
 * - Top Navigation Bar in Dark Slate (#1E2A38) with Hamburger Menu, Brand Title,
 *   Activity globe (feed + dialer), and Call New Action
 * - Native Slide-in Drawer with complete previous navigation list
 * - Bottom Navigation Tabs matching original mobile layout (Launchpad, Leads, Tasks, Calendar, More)
 * - 0ms instant tab switching and drawer opening (pure React state, no network, no self-closing bug)
 * - Launchpad screen with Quick Modules, Todo status, and Contact Requested cards
 * - Leads screen with real Stage 4.3A workspace data, search, and status filters
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityFeedSheet } from "../components/ActivityFeedSheet";
import { HouzzatProWordmark } from "../components/BrandMark";
import { NativeDrawer, type DrawerItem } from "../components/NativeDrawer";
import { ViewingsLeadPickerSheet } from "../components/ViewingsLeadPickerSheet";
import { useAndroidHardwareBack } from "../hooks/useAndroidHardwareBack";
import { triggerNavHaptic } from "../lib/nav-haptics";
import { subscribePushNavigation } from "../lib/push-navigation";
import { useAuth } from "../state/AuthContext";
import { LaunchpadScreen } from "./LaunchpadScreen";
import { LeadDetailScreen } from "./LeadDetailScreen";
import { LeadsScreen } from "./LeadsScreen";
import { GlobalTasksScreen } from "./GlobalTasksScreen";
import { GlobalCalendarScreen } from "./GlobalCalendarScreen";
import { MoreHubScreen } from "./MoreHubScreen";
import {
  MoreUtilityScreen,
  type MoreUtilityId,
} from "./MoreUtilityScreen";
import { PropertiesSearchScreen } from "./PropertiesSearchScreen";
import { ShortlistScreen } from "./ShortlistScreen";
import { CommunicationsScreen } from "./CommunicationsScreen";
import { ChatsScreen } from "./ChatsScreen";
import { StatisticsScreen } from "./StatisticsScreen";
import { NotificationPreferencesScreen } from "./NotificationPreferencesScreen";
import { CmaScreen } from "./CmaScreen";
import { TeamScreen } from "./TeamScreen";
import { ViewingsPlannerScreen } from "./ViewingsPlannerScreen";

type AgentTab =
  | "launchpad"
  | "leads"
  | "chats"
  | "tasks"
  | "calendar"
  | "more";
type ActiveUtility = Exclude<MoreUtilityId, "account"> | null;

type ViewingsPlannerState = {
  leadId: string;
  mlsNumbers: string[];
  leadName?: string;
} | null;

type VisitedTabs = Partial<Record<AgentTab, boolean>>;

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
  const [visitedTabs, setVisitedTabs] = useState<VisitedTabs>({
    launchpad: true,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeDrawerId, setActiveDrawerId] = useState("launchpad");
  const [activeUtility, setActiveUtility] = useState<ActiveUtility>(null);
  const [leadsInitialFilter, setLeadsInitialFilter] = useState<string | undefined>(undefined);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadNavIds, setLeadNavIds] = useState<string[]>([]);
  const [viewingsPlanner, setViewingsPlanner] = useState<ViewingsPlannerState>(null);
  const [viewingsLeadPicker, setViewingsLeadPicker] = useState<{ mlsNumbers: string[] } | null>(
    null,
  );
  const [activityFeedOpen, setActivityFeedOpen] = useState(false);
  const [chatsThreadOpen, setChatsThreadOpen] = useState(false);
  const chatsThreadCloseRef = useRef<(() => void) | null>(null);

  const hasMultipleWorkspaces = memberships.length > 1;
  const brandDisplayName = activeWorkspace?.displayName || "HouzzatPRO";
  const orgName = activeWorkspace?.slug ? `${activeWorkspace.slug}.houzzatpro.com` : "Agent Desk";
  const userRole = activeMembership?.role || "AGENT";
  const userEmail = user?.email || "";
  const userName = user?.name ?? null;

  const selectTab = (tab: AgentTab, drawerId?: string) => {
    triggerNavHaptic();
    setActiveTab(tab);
    setActiveDrawerId(drawerId ?? tab);
    setActiveUtility(null);
  };

  useEffect(() => {
    setVisitedTabs((prev) =>
      prev[activeTab] ? prev : { ...prev, [activeTab]: true },
    );
  }, [activeTab]);

  const handleSelectDrawerItem = (item: DrawerItem) => {
    setActiveDrawerId(item.id);
    if (item.utilityId && item.utilityId !== "account") {
      setActiveUtility(item.utilityId);
      setActiveTab("more");
      return;
    }
    setActiveUtility(null);
    if (item.tabKey) {
      setActiveTab(item.tabKey);
    }
  };

  const handleCallNewAction = () => {
    setLeadsInitialFilter("NEW_LEAD");
    setActiveTab("leads");
    setActiveDrawerId("leads");
    setActiveUtility(null);
  };

  const handleNavigateToLeads = (statusFilter?: string) => {
    setLeadsInitialFilter(statusFilter);
    setActiveTab("leads");
    setActiveDrawerId("leads");
    setActiveUtility(null);
  };

  const handleNavigateToTasks = () => {
    setActiveTab("tasks");
    setActiveDrawerId("tasks");
    setActiveUtility(null);
  };

  const handleSignOut = () => {
    void signOut();
  };

  useEffect(() => {
    return subscribePushNavigation((target) => {
      setActiveUtility(null);
      setDrawerOpen(false);
      setViewingsPlanner(null);
      setViewingsLeadPicker(null);
      if (target.kind === "lead") {
        setActiveTab("leads");
        setActiveDrawerId("leads");
        setLeadNavIds([target.leadId]);
        setSelectedLeadId(target.leadId);
        return;
      }
      if (target.kind === "tasks") {
        setSelectedLeadId(null);
        setLeadNavIds([]);
        setActiveTab("tasks");
        setActiveDrawerId("tasks");
        return;
      }
      setSelectedLeadId(null);
      setLeadNavIds([]);
      setActiveTab("launchpad");
      setActiveDrawerId("launchpad");
    });
  }, []);

  useAndroidHardwareBack({
    onBack: () => {
      if (viewingsPlanner) {
        setViewingsPlanner(null);
        return true;
      }
      if (viewingsLeadPicker) {
        setViewingsLeadPicker(null);
        return true;
      }
      if (activityFeedOpen) {
        setActivityFeedOpen(false);
        return true;
      }
      // Chats conversation thread — same close as green Back (fallback if
      // chats-thread listener / overlay stack did not run).
      if (chatsThreadOpen) {
        chatsThreadCloseRef.current?.();
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
      if (activeTab !== "launchpad") {
        setActiveTab("launchpad");
        setActiveDrawerId("launchpad");
        setActiveUtility(null);
        return true;
      }
      if (onReturnToCommandCentre) {
        onReturnToCommandCentre();
        return true;
      }
      return false;
    },
    isAtRoot: () =>
      !viewingsPlanner &&
      !viewingsLeadPicker &&
      !activityFeedOpen &&
      !chatsThreadOpen &&
      !selectedLeadId &&
      !drawerOpen &&
      !activeUtility &&
      activeTab === "launchpad" &&
      !onReturnToCommandCentre,
  });

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
            style={[
              styles.globeBtn,
              activityFeedOpen && styles.globeBtnActive,
            ]}
            onPress={() => setActivityFeedOpen((open) => !open)}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={
              activityFeedOpen ? "Close activity feed" : "Open activity feed"
            }
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.globeIcon,
                activityFeedOpen && styles.globeIconActive,
              ]}
            >
              🌐
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.callNewBtn}
            onPress={handleCallNewAction}
            activeOpacity={0.85}
          >
            <Text style={styles.callNewBtnText}>CALL NEW</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Body Content Area — keep visited primary tabs mounted (no cold remount). */}
      <View style={styles.body}>
        {visitedTabs.launchpad ? (
          <View
            style={[
              styles.tabPane,
              activeTab !== "launchpad" ? styles.tabPaneHidden : null,
            ]}
            pointerEvents={activeTab === "launchpad" ? "auto" : "none"}
          >
            <LaunchpadScreen
              onNavigateToLeads={handleNavigateToLeads}
              onNavigateToTasks={handleNavigateToTasks}
              onNavigateToStatistics={() => {
                setActiveTab("more");
                setActiveUtility("statistics");
                setActiveDrawerId("statistics");
              }}
              onOpenLead={(leadId, leadIds) => {
                setLeadNavIds(leadIds?.length ? leadIds : [leadId]);
                setSelectedLeadId(leadId);
                setActiveTab("leads");
                setActiveDrawerId("leads");
                setActiveUtility(null);
              }}
            />
          </View>
        ) : null}

        {visitedTabs.leads ? (
          <View
            style={[
              styles.tabPane,
              activeTab !== "leads" ? styles.tabPaneHidden : null,
            ]}
            pointerEvents={activeTab === "leads" ? "auto" : "none"}
          >
            <LeadsScreen
              initialStatusFilter={leadsInitialFilter}
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
          </View>
        ) : null}

        {visitedTabs.chats ? (
          <View
            style={[
              styles.tabPane,
              activeTab !== "chats" ? styles.tabPaneHidden : null,
            ]}
            pointerEvents={activeTab === "chats" ? "auto" : "none"}
          >
            <ChatsScreen
              onThreadOpenChange={setChatsThreadOpen}
              threadCloseRef={chatsThreadCloseRef}
              onOpenLead={(leadId) => {
                setLeadNavIds([leadId]);
                setSelectedLeadId(leadId);
                setActiveTab("leads");
                setActiveDrawerId("leads");
                setActiveUtility(null);
              }}
            />
          </View>
        ) : null}

        {visitedTabs.calendar ? (
          <View
            style={[
              styles.tabPane,
              activeTab !== "calendar" ? styles.tabPaneHidden : null,
            ]}
            pointerEvents={activeTab === "calendar" ? "auto" : "none"}
          >
            <GlobalCalendarScreen
              onOpenLead={(leadId) => {
                setLeadNavIds([leadId]);
                setSelectedLeadId(leadId);
              }}
            />
          </View>
        ) : null}

        {visitedTabs.tasks ? (
          <View
            style={[
              styles.tabPane,
              activeTab !== "tasks" ? styles.tabPaneHidden : null,
            ]}
            pointerEvents={activeTab === "tasks" ? "auto" : "none"}
          >
            <GlobalTasksScreen
              onOpenLead={(leadId) => {
                setLeadNavIds([leadId]);
                setSelectedLeadId(leadId);
              }}
            />
          </View>
        ) : null}

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
              onReturnToCommandCentre={onReturnToCommandCentre}
              onOpenUtility={(id) => {
                setActiveUtility(id);
                setActiveDrawerId(id);
              }}
            />
          )
        )}
      </View>

      {/* Bottom Navigation — Launchpad | Leads | Chats | Calendar | More */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => selectTab("launchpad")}
        >
          <View style={[styles.navIconBox, activeTab === "launchpad" && styles.navIconBoxActive]}>
            <Text style={[styles.navIcon, activeTab === "launchpad" && styles.navIconActive]}>
              ⌂
            </Text>
          </View>
          <Text
            style={[styles.navLabel, activeTab === "launchpad" && styles.navLabelActive]}
            numberOfLines={1}
          >
            Launchpad
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => selectTab("leads")}
        >
          <View style={[styles.navIconBox, activeTab === "leads" && styles.navIconBoxActive]}>
            <Text
              style={[
                styles.navIcon,
                styles.navIconEmoji,
                activeTab === "leads" && styles.navIconActive,
              ]}
            >
              👥
            </Text>
          </View>
          <Text
            style={[styles.navLabel, activeTab === "leads" && styles.navLabelActive]}
            numberOfLines={1}
          >
            Leads
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => selectTab("chats", "chats")}
        >
          <View style={[styles.navIconBox, activeTab === "chats" && styles.navIconBoxActive]}>
            <Text
              style={[
                styles.navIcon,
                styles.navIconEmoji,
                activeTab === "chats" && styles.navIconActive,
              ]}
            >
              💬
            </Text>
          </View>
          <Text
            style={[styles.navLabel, activeTab === "chats" && styles.navLabelActive]}
            numberOfLines={1}
          >
            Chats
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => selectTab("calendar")}
        >
          <View style={[styles.navIconBox, activeTab === "calendar" && styles.navIconBoxActive]}>
            <Text
              style={[
                styles.navIcon,
                styles.navIconEmoji,
                activeTab === "calendar" && styles.navIconActive,
              ]}
            >
              📅
            </Text>
          </View>
          <Text
            style={[styles.navLabel, activeTab === "calendar" && styles.navLabelActive]}
            numberOfLines={1}
          >
            Calendar
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

      <ActivityFeedSheet
        visible={activityFeedOpen}
        onClose={() => setActivityFeedOpen(false)}
        onCallNew={handleCallNewAction}
        onOpenLead={(leadId) => {
          setLeadNavIds([leadId]);
          setSelectedLeadId(leadId);
          setActiveTab("leads");
          setActiveDrawerId("leads");
          setActiveUtility(null);
        }}
      />

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
    backgroundColor: "#1E2A38", // Header color
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
  headerRight: {
    marginLeft: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  globeBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  globeBtnActive: {
    backgroundColor: "rgba(13, 148, 136, 0.18)",
  },
  globeIcon: {
    fontSize: 18,
    color: "#FFFFFF",
    opacity: 0.95,
  },
  globeIconActive: {
    opacity: 1,
    color: "#FFFFFF",
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
  tabPane: {
    flex: 1,
  },
  tabPaneHidden: {
    display: "none",
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
    width: 28,
    height: 28,
    borderRadius: 10,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  navIconBoxActive: {
    backgroundColor: "rgba(15, 107, 76, 0.12)",
  },
  navIcon: {
    fontSize: 14,
    color: "#5B6775",
    lineHeight: 16,
    textAlign: "center",
  },
  /** Full-color emoji sit larger than text glyphs — keep them inside the rounded box. */
  navIconEmoji: {
    fontSize: 13,
    lineHeight: 15,
  },
  navIconActive: {
    color: "#0F6B4C", // Canopy green
    fontWeight: "bold",
  },
  navLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#5B6775",
    textAlign: "center",
    paddingHorizontal: 2,
  },
  navLabelActive: {
    color: "#0F6B4C",
    fontWeight: "700",
  },
});
