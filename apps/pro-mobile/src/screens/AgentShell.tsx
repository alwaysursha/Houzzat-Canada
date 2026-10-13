/**
 * Stage 4.3B — Native Agent Shell with Visual Restoration.
 *
 * Faithfully matches the original HouzzatPRO Agent experience:
 * - Top Navigation Bar in Dark Slate (#1E2A38) with Hamburger Menu, Brand Title,
 *   Activity globe (feed + dialer), and Call New Action
 * - Native Slide-in Drawer with complete previous navigation list
 * - Bottom Navigation Tabs matching original mobile layout (Launchpad, Leads, Chats, Calendar, More)
 * - 0ms instant tab switching and drawer opening (pure React state, no network, no self-closing bug)
 * - Launchpad screen with Quick Modules, Todo status, and Contact Requested cards
 * - Leads screen with real Stage 4.3A workspace data, search, and status filters
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import { traceAndroidBack } from "../lib/android-back-trace";
import { leadsStackBackAction } from "../navigation/leads-stack-back";
import type {
  AgentTabParamList,
  AgentTabRouteName,
  LeadsStackParamList,
} from "../navigation/types";
import { AGENT_BOTTOM_NAV_LABELS } from "../lib/drawer-nav-items";
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

const TAB_ROUTE: Record<AgentTab, AgentTabRouteName> = {
  launchpad: "Launchpad",
  leads: "Leads",
  chats: "Chats",
  tasks: "Tasks",
  calendar: "Calendar",
  more: "More",
};

const Tab = createBottomTabNavigator<AgentTabParamList>();

const agentTabNavigationRef: {
  current: {
    navigate: (name: AgentTabRouteName, params?: object) => void;
  } | null;
} = { current: null };

const leadsStackNavRef: {
  current: NativeStackNavigationProp<LeadsStackParamList> | null;
} = { current: null };

function useBindLeadsStackNavigation(): NativeStackNavigationProp<LeadsStackParamList> {
  const navigation = useNavigation<NativeStackNavigationProp<LeadsStackParamList>>();
  // Keep the latest stack navigation object. Do not clear it when a screen blurs;
  // Lead Profile must still be able to pop after the list loses focus.
  useEffect(() => {
    leadsStackNavRef.current = navigation;
  }, [navigation]);
  return navigation;
}

function leadsBackSnapshot(tab: string) {
  const navigation = leadsStackNavRef.current;
  if (!navigation) return { tab, leadsRef: "null" as const };
  try {
    const state = navigation.getState();
    return {
      tab,
      leadsRef: "set" as const,
      stackKey: state?.key ?? null,
      stackIndex: state?.index ?? null,
      stackRoutes: state?.routes?.map((route) => route.name) ?? null,
    };
  } catch (error) {
    return { tab, leadsRef: "set" as const, getStateError: String(error) };
  }
}

function popLeadsStackIfPushed(): boolean {
  const navigation = leadsStackNavRef.current;
  if (!navigation) return false;
  const action = leadsStackBackAction(navigation.getState());
  if (!action) return false;
  navigation.dispatch(action);
  return true;
}

type AgentTabContextValue = {
  leadsInitialFilter?: string;
  selectedLeadId: string | null;
  activeUtility: ActiveUtility;
  chatsThreadCloseRef: React.MutableRefObject<(() => void) | null>;
  userEmail: string;
  userName: string | null;
  userRole: string;
  brandDisplayName: string;
  workspaceId?: string;
  workspaceSlug?: string;
  hasMultipleWorkspaces: boolean;
  drawerOpen: boolean;
  onReturnToCommandCentre?: () => void;
  setChatsThreadOpen: (open: boolean) => void;
  setSelectedLeadId: (leadId: string | null) => void;
  setActiveRoute: (route: AgentTabRouteName) => void;
  openDrawer: () => void;
  selectPrimaryTab: (route: Exclude<AgentTabRouteName, "Tasks" | "More">) => void;
  navigateToLeads: (statusFilter?: string) => void;
  navigateToTasks: () => void;
  navigateToChats: () => void;
  openStatistics: () => void;
  openLeadOnLeads: (leadId: string, leadIds?: string[]) => void;
  selectLead: (leadId: string, leadIds: string[]) => void;
  openLeadFromChat: (leadId: string) => void;
  planViewings: (id: string, name: string | undefined, mlsNumbers: string[]) => void;
  closeUtility: () => void;
  browseProperties: () => void;
  openUtility: (id: Exclude<MoreUtilityId, "account">) => void;
  openLeadFromUtility: (leadId: string) => void;
  openViewingsLeadPicker: (mlsNumbers: string[]) => void;
  openTeamStatistics: () => void;
  changeWorkspace: () => void;
  signOut: () => void;
};

const AgentTabContext = createContext<AgentTabContextValue | null>(null);

function useAgentTabContext(): AgentTabContextValue {
  const ctx = useContext(AgentTabContext);
  if (!ctx) {
    throw new Error("Agent tab screens must render inside AgentShell");
  }
  return ctx;
}

function LaunchpadTab() {
  const ctx = useAgentTabContext();
  return (
    <LaunchpadScreen
      onNavigateToLeads={ctx.navigateToLeads}
      onNavigateToTasks={ctx.navigateToTasks}
      onNavigateToChats={ctx.navigateToChats}
      onNavigateToStatistics={ctx.openStatistics}
      onOpenLead={(leadId, leadIds) => ctx.openLeadOnLeads(leadId, leadIds)}
    />
  );
}

function LeadsListRoute() {
  const ctx = useAgentTabContext();
  const navigation = useBindLeadsStackNavigation();
  return (
    <LeadsScreen
      initialStatusFilter={ctx.leadsInitialFilter}
      selectedLeadId={ctx.selectedLeadId}
      onSelectLead={(leadId, leadIds) => {
        navigation.navigate("LeadProfile", {
          leadId,
          leadIds,
        });
      }}
      onPlanViewings={(id, name, mlsNumbers) =>
        ctx.planViewings(id, name, mlsNumbers ?? [])
      }
    />
  );
}

function LeadProfileRoute() {
  const ctx = useAgentTabContext();
  const navigation = useBindLeadsStackNavigation();
  const route = useRoute<RouteProp<LeadsStackParamList, "LeadProfile">>();
  const leadId = route.params.leadId;
  const leadIds = route.params.leadIds;
  const setSelectedLeadId = ctx.setSelectedLeadId;

  useFocusEffect(
    useCallback(() => {
      setSelectedLeadId(leadId);
      return () => setSelectedLeadId(null);
    }, [leadId, setSelectedLeadId]),
  );

  return (
    <LeadDetailScreen
      embeddedInShell
      leadId={leadId}
      leadIds={leadIds}
      onBack={() => navigation.goBack()}
      onNavigateLead={(id) => navigation.setParams({ leadId: id })}
      onPlanViewings={(id, name, mlsNumbers) =>
        ctx.planViewings(id, name, mlsNumbers ?? [])
      }
    />
  );
}

function LeadsTab() {
  const Navigator = LeadsStack.Navigator as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  const Screen = LeadsStack.Screen as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  return (
    <Navigator
      initialRouteName="LeadsList"
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
      }}
    >
      <Screen name="LeadsList" component={LeadsListRoute} />
      <Screen name="LeadProfile" component={LeadProfileRoute} />
    </Navigator>
  );
}

const LeadsStack = createNativeStackNavigator<LeadsStackParamList>();

function ChatsTab() {
  const ctx = useAgentTabContext();
  return (
    <ChatsScreen
      onThreadOpenChange={ctx.setChatsThreadOpen}
      threadCloseRef={ctx.chatsThreadCloseRef}
      onOpenLead={ctx.openLeadFromChat}
    />
  );
}

function CalendarTab() {
  const ctx = useAgentTabContext();
  return (
    <GlobalCalendarScreen
      onOpenLead={(leadId) => ctx.openLeadFromUtility(leadId)}
    />
  );
}

function TasksTab() {
  const ctx = useAgentTabContext();
  return (
    <GlobalTasksScreen
      onOpenLead={(leadId) => ctx.openLeadFromUtility(leadId)}
    />
  );
}

function MoreTab() {
  const ctx = useAgentTabContext();
  if (ctx.activeUtility === "search") {
    return (
      <PropertiesSearchScreen
        onBack={ctx.closeUtility}
        onPlanViewings={ctx.openViewingsLeadPicker}
      />
    );
  }
  if (ctx.activeUtility === "shortlist") {
    return (
      <ShortlistScreen
        onBack={ctx.closeUtility}
        onBrowseProperties={ctx.browseProperties}
        onPlanViewings={ctx.openViewingsLeadPicker}
      />
    );
  }
  if (ctx.activeUtility === "inbox") {
    return (
      <CommunicationsScreen
        onBack={ctx.closeUtility}
        onOpenLead={ctx.openLeadFromUtility}
      />
    );
  }
  if (ctx.activeUtility === "statistics") {
    return <StatisticsScreen onBack={ctx.closeUtility} />;
  }
  if (ctx.activeUtility === "cma") {
    return <CmaScreen onBack={ctx.closeUtility} />;
  }
  if (ctx.activeUtility === "team") {
    return (
      <TeamScreen
        onBack={ctx.closeUtility}
        onOpenStatistics={ctx.openTeamStatistics}
      />
    );
  }
  if (ctx.activeUtility === "notifications") {
    return <NotificationPreferencesScreen onBack={ctx.closeUtility} />;
  }
  if (ctx.activeUtility) {
    return (
      <MoreUtilityScreen utilityId={ctx.activeUtility} onBack={ctx.closeUtility} />
    );
  }
  return (
    <MoreHubScreen
      userEmail={ctx.userEmail}
      userName={ctx.userName}
      userRole={ctx.userRole}
      brandDisplayName={ctx.brandDisplayName}
      workspaceId={ctx.workspaceId}
      workspaceSlug={ctx.workspaceSlug}
      hasMultipleWorkspaces={ctx.hasMultipleWorkspaces}
      onChangeWorkspace={ctx.changeWorkspace}
      onSignOut={ctx.signOut}
      onReturnToCommandCentre={ctx.onReturnToCommandCentre}
      onOpenUtility={ctx.openUtility}
    />
  );
}

const TAB_ICONS: Record<(typeof AGENT_BOTTOM_NAV_LABELS)[number], string> = {
  Launchpad: "⌂",
  Leads: "👥",
  Chats: "💬",
  Calendar: "📅",
  More: "☰",
};

function AgentBottomTabBar({ state, navigation }: BottomTabBarProps) {
  const ctx = useAgentTabContext();
  agentTabNavigationRef.current = navigation;
  const focused = state.routes[state.index]?.name;

  useEffect(() => {
    if (focused === "Launchpad" || focused === "Leads" || focused === "Chats" || focused === "Calendar" || focused === "More" || focused === "Tasks") {
      ctx.setActiveRoute(focused);
    }
  }, [ctx, focused]);

  return (
    <View style={styles.bottomNav}>
      {AGENT_BOTTOM_NAV_LABELS.map((label) => {
        const routeName = label as AgentTabRouteName;
        const focusedTab = focused === routeName;
        const active = label === "More" ? ctx.drawerOpen : focusedTab;
        const emoji = label !== "Launchpad" && label !== "More";
        return (
          <TouchableOpacity
            key={label}
            style={styles.navItem}
            activeOpacity={0.7}
            onPress={() => {
              triggerNavHaptic();
              if (label === "More") {
                ctx.openDrawer();
                return;
              }
              ctx.selectPrimaryTab(routeName as Exclude<AgentTabRouteName, "Tasks" | "More">);
            }}
          >
            <View style={[styles.navIconBox, active && styles.navIconBoxActive]}>
              <Text
                style={[
                  styles.navIcon,
                  emoji && styles.navIconEmoji,
                  active && styles.navIconActive,
                ]}
              >
                {TAB_ICONS[label]}
              </Text>
            </View>
            <Text
              style={[styles.navLabel, active && styles.navLabelActive]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function AgentPrimaryTabs() {
  // React 18.3 Component.refs disagrees with this package's JSX type.
  const Navigator = Tab.Navigator as unknown as React.ComponentType<Record<string, unknown>>;
  const Screen = Tab.Screen as unknown as React.ComponentType<Record<string, unknown>>;
  return (
    <Navigator
      backBehavior="none"
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        animation: "none",
      }}
      tabBar={(props: BottomTabBarProps) => <AgentBottomTabBar {...props} />}
    >
      <Screen name="Launchpad" component={LaunchpadTab} />
      <Screen name="Leads" component={LeadsTab} />
      <Screen name="Chats" component={ChatsTab} />
      <Screen name="Calendar" component={CalendarTab} />
      <Screen name="More" component={MoreTab} />
      <Screen
        name="Tasks"
        component={TasksTab}
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: "none" },
        }}
      />
    </Navigator>
  );
}

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

  const [activeRoute, setActiveRoute] = useState<AgentTabRouteName>("Launchpad");
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

  const navigateTab = (tab: AgentTab, drawerId?: string) => {
    const route = TAB_ROUTE[tab];
    setActiveRoute(route);
    setActiveDrawerId(drawerId ?? tab);
    setActiveUtility(null);
    agentTabNavigationRef.current?.navigate(route);
  };

  const pushLeadProfile = (leadId: string, leadIds?: string[]) => {
    const ids = leadIds && leadIds.length > 0 ? leadIds : [leadId];
    setLeadNavIds(ids);
    setSelectedLeadId(leadId);
    setActiveUtility(null);
    setActiveRoute("Leads");
    setActiveDrawerId("leads");
    agentTabNavigationRef.current?.navigate("Leads", {
      screen: "LeadProfile",
      params: { leadId, leadIds: ids },
    });
  };

  const handleSelectDrawerItem = (item: DrawerItem) => {
    setActiveDrawerId(item.id);
    if (item.id === "viewings") {
      setViewingsLeadPicker({ mlsNumbers: [] });
      return;
    }
    if (item.utilityId && item.utilityId !== "account") {
      setActiveUtility(item.utilityId);
      setActiveRoute("More");
      agentTabNavigationRef.current?.navigate("More");
      return;
    }
    setActiveUtility(null);
    if (item.tabKey) {
      const route = TAB_ROUTE[item.tabKey];
      setActiveRoute(route);
      agentTabNavigationRef.current?.navigate(route);
    }
  };

  const handleCallNewAction = () => {
    setLeadsInitialFilter("NEW_LEAD");
    navigateTab("leads", "leads");
  };

  const handleNavigateToLeads = (statusFilter?: string) => {
    setLeadsInitialFilter(statusFilter);
    navigateTab("leads", "leads");
  };

  const handleNavigateToTasks = () => {
    navigateTab("tasks", "tasks");
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
        pushLeadProfile(target.leadId);
        return;
      }
      if (target.kind === "tasks") {
        leadsStackNavRef.current?.popToTop();
        setSelectedLeadId(null);
        setLeadNavIds([]);
        navigateTab("tasks", "tasks");
        return;
      }
      leadsStackNavRef.current?.popToTop();
      setSelectedLeadId(null);
      setLeadNavIds([]);
      navigateTab("launchpad", "launchpad");
    });
  }, []);

  useAndroidHardwareBack({
    onBack: () => {
      traceAndroidBack("js agent-shell onBack", leadsBackSnapshot(activeRoute));
      if (viewingsPlanner) {
        setViewingsPlanner(null);
        traceAndroidBack("js agent-shell consumed viewings-planner");
        return true;
      }
      if (viewingsLeadPicker) {
        setViewingsLeadPicker(null);
        traceAndroidBack("js agent-shell consumed viewings-lead-picker");
        return true;
      }
      if (activityFeedOpen) {
        setActivityFeedOpen(false);
        traceAndroidBack("js agent-shell consumed activity-feed");
        return true;
      }
      // Chats conversation thread — same close as green Back (fallback if
      // chats-thread listener / overlay stack did not run).
      if (chatsThreadOpen) {
        chatsThreadCloseRef.current?.();
        traceAndroidBack("js agent-shell consumed chats-thread");
        return true;
      }
      if (popLeadsStackIfPushed()) {
        traceAndroidBack(
          "js agent-shell consumed leads-pop",
          leadsBackSnapshot(activeRoute),
        );
        return true;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
        traceAndroidBack("js agent-shell consumed drawer");
        return true;
      }
      if (activeUtility) {
        setActiveUtility(null);
        setActiveDrawerId("account");
        setActiveRoute("More");
        agentTabNavigationRef.current?.navigate("More");
        traceAndroidBack("js agent-shell consumed utility");
        return true;
      }
      if (activeRoute !== "Launchpad") {
        navigateTab("launchpad", "launchpad");
        traceAndroidBack("js agent-shell consumed tab-to-launchpad", {
          tab: activeRoute,
        });
        return true;
      }
      if (onReturnToCommandCentre) {
        onReturnToCommandCentre();
        traceAndroidBack("js agent-shell consumed return-to-command-centre");
        return true;
      }
      traceAndroidBack("js agent-shell onBack returned false", {
        tab: activeRoute,
      });
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
      activeRoute === "Launchpad" &&
      !onReturnToCommandCentre,
  });

  const tabContext: AgentTabContextValue = {
    leadsInitialFilter,
    selectedLeadId,
    activeUtility,
    chatsThreadCloseRef,
    userEmail,
    userName,
    userRole,
    brandDisplayName,
    workspaceId: activeWorkspace?.id,
    workspaceSlug: activeWorkspace?.slug,
    hasMultipleWorkspaces,
    drawerOpen,
    onReturnToCommandCentre,
    setChatsThreadOpen,
    setSelectedLeadId,
    setActiveRoute: (route) => {
      setActiveRoute((prev) => (prev === route ? prev : route));
    },
    openDrawer: () => setDrawerOpen(true),
    selectPrimaryTab: (route) => {
      const tab =
        route === "Launchpad"
          ? "launchpad"
          : route === "Leads"
            ? "leads"
            : route === "Chats"
              ? "chats"
              : "calendar";
      navigateTab(tab, tab);
    },
    navigateToLeads: handleNavigateToLeads,
    navigateToTasks: handleNavigateToTasks,
    navigateToChats: () => {
      navigateTab("chats", "chats");
    },
    openStatistics: () => {
      setActiveUtility("statistics");
      setActiveDrawerId("statistics");
      setActiveRoute("More");
      agentTabNavigationRef.current?.navigate("More");
    },
    openLeadOnLeads: (leadId, leadIds) => {
      pushLeadProfile(leadId, leadIds);
    },
    selectLead: (leadId, leadIds) => {
      pushLeadProfile(leadId, leadIds);
    },
    openLeadFromChat: (leadId) => {
      pushLeadProfile(leadId);
    },
    planViewings: (id, name, mlsNumbers) => {
      setViewingsPlanner({
        leadId: id,
        mlsNumbers,
        leadName: name,
      });
    },
    closeUtility: () => {
      setActiveUtility(null);
      setActiveDrawerId("account");
    },
    browseProperties: () => {
      setActiveUtility("search");
      setActiveDrawerId("search");
    },
    openUtility: (id) => {
      if (id === "viewings") {
        setViewingsLeadPicker({ mlsNumbers: [] });
        return;
      }
      setActiveUtility(id);
      setActiveDrawerId(id);
    },
    openLeadFromUtility: (leadId) => {
      pushLeadProfile(leadId);
    },
    openViewingsLeadPicker: (mlsNumbers) => {
      setViewingsLeadPicker({ mlsNumbers });
    },
    openTeamStatistics: () => {
      setActiveUtility("statistics");
      setActiveDrawerId("statistics");
    },
    changeWorkspace: () => {
      void changeWorkspace();
    },
    signOut: () => {
      void signOut();
    },
  };

  return (
    <AgentTabContext.Provider value={tabContext}>
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
              {activeRoute.toUpperCase()} · {orgName}
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

      {/* Primary tabs — React Navigation bottom tabs. Visited screens stay mounted. */}
      <View style={styles.body}>
        <AgentPrimaryTabs />
        {viewingsPlanner ? (
          <View style={styles.viewingsPlannerPane}>
            <ViewingsPlannerScreen
              embeddedInShell
              leadId={viewingsPlanner.leadId}
              leadName={viewingsPlanner.leadName}
              initialMlsNumbers={viewingsPlanner.mlsNumbers}
              onBack={() => setViewingsPlanner(null)}
            />
          </View>
        ) : null}
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

      <ActivityFeedSheet
        visible={activityFeedOpen}
        onClose={() => setActivityFeedOpen(false)}
        onCallNew={handleCallNewAction}
        onOpenLead={(leadId) => {
          pushLeadProfile(leadId);
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

    </SafeAreaView>
    </AgentTabContext.Provider>
  );
}

const topHeaderPadding = Platform.OS === "android" ? Math.max(StatusBar.currentHeight || 0, 42) + 8 : 10;
const bottomNavPadding = Platform.OS === "android" ? 54 : 20;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#1E2A38", // Header color
  },
  viewingsPlannerPane: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: Platform.OS === "android" ? 102 : 64,
    zIndex: 30,
    backgroundColor: "#F4F7F5",
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
