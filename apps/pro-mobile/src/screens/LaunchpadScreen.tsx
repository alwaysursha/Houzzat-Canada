/**
 * Native HouzzatPRO Launchpad — live desk snapshot (web Instant Shell parity).
 * Data: GET /api/mobile/v2/launchpad
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { AgentServicesComingSoonBanner } from "../components/AgentServicesComingSoonBanner";
import {
  LaunchpadStatsIcon,
  LaunchpadTaskIcon,
} from "../components/ContactActionIcons";
import {
  clearLaunchpadCache,
  launchpadCache,
  launchpadCacheKey,
  type MobileLaunchpadCachePayload,
} from "../lib/lead-tab-cache";
import { useAuth } from "../state/AuthContext";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ModuleId =
  | "callNew"
  | "contacted"
  | "messages"
  | "tasks"
  | "statistics"
  | "online"
  | "hot";

type LeadPreview = {
  id: string;
  status: string;
  customer: { name: string | null; email: string } | null;
  meta?: string | null;
  lastSeenAt?: string | null;
  isOnline?: boolean;
};

type TaskPreview = {
  id: string;
  title: string;
  type: string;
  dueAt: string;
  overdue: boolean;
  lead: {
    id: string;
    customer: { name: string | null; email: string } | null;
  } | null;
};

type ContactRequestedPreview = {
  id: string;
  source: string;
  status: string;
  listingMls: string | null;
  inquiryTag: string | null;
  createdAt: string;
  customer: {
    name: string | null;
    email: string;
    isBuyer: boolean;
    isSeller: boolean;
  } | null;
  isOnline?: boolean;
};

type UnreadMessagePreview = {
  conversationId: string;
  leadId: string;
  displayName: string;
  preview: string | null;
  channel: string | null;
  unreadCount: number;
  lastMessageAt: string;
};

type LaunchpadData = MobileLaunchpadCachePayload & {
  callNewLeads: LeadPreview[];
  contactedLeads: LeadPreview[];
  openTasks: TaskPreview[];
  onlineLeads: LeadPreview[];
  hotLeads: LeadPreview[];
  unreadMessages: UnreadMessagePreview[];
  contactRequested: ContactRequestedPreview[];
};

interface LaunchpadScreenProps {
  onNavigateToLeads: (statusFilter?: string) => void;
  onNavigateToTasks: () => void;
  onNavigateToStatistics: () => void;
  onNavigateToChats: () => void;
  onOpenLead: (leadId: string, leadIds?: string[]) => void;
}

function leadLabel(lead: LeadPreview | ContactRequestedPreview): string {
  return (
    lead.customer?.name?.trim() ||
    lead.customer?.email?.trim() ||
    "Lead"
  );
}

function relativeAgo(iso: string | null | undefined): string {
  if (!iso) return "Just now";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function dueLabel(iso: string, overdue: boolean): string {
  try {
    const d = new Date(iso);
    const time = d.toLocaleString("en-CA", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return overdue ? `Overdue · ${time}` : `Due ${time}`;
  } catch {
    return overdue ? "Overdue" : "Due";
  }
}

function emptyLaunchpad(workspaceId: string): LaunchpadData {
  return {
    workspaceId,
    deskView: "mine",
    dueTodayCount: 0,
    overdueTaskCount: 0,
    newLeadCount: 0,
    contactedCount: 0,
    avgResponseMins: 0,
    hotCount: 0,
    unreadMessageCount: 0,
    unreadConversationCount: 0,
    unreadMessages: [],
    callNewLeads: [],
    contactedLeads: [],
    openTasks: [],
    onlineLeads: [],
    hotLeads: [],
    contactRequested: [],
  };
}

export function LaunchpadScreen({
  onNavigateToLeads,
  onNavigateToTasks,
  onNavigateToStatistics,
  onNavigateToChats,
  onOpenLead,
}: LaunchpadScreenProps) {
  const { activeWorkspace, activeMembership } = useAuth();
  const workspaceId = activeWorkspace?.id;
  const cacheKey = workspaceId ? launchpadCacheKey(workspaceId) : "";
  const cached = cacheKey ? launchpadCache.get(cacheKey)?.launchpad : undefined;

  const [data, setData] = useState<LaunchpadData>(() =>
    cached
      ? (cached as LaunchpadData)
      : emptyLaunchpad(workspaceId ?? ""),
  );
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedModule, setExpandedModule] = useState<ModuleId | null>(null);

  const now = new Date();
  const dateFormatted = now.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const load = useCallback(
    async (isPull = false) => {
      if (!workspaceId) return;
      if (isPull) setRefreshing(true);
      else if (!launchpadCache.get(launchpadCacheKey(workspaceId))) {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await mobileApiClient.get<{
          ok?: boolean;
          data?: LaunchpadData;
        }>("/launchpad");

        if (!res.ok) {
          setError(res.message || "Couldn't load Launchpad");
          return;
        }

        const payload =
          (res.data as { data?: LaunchpadData } | undefined)?.data ??
          (res.data as LaunchpadData | undefined);

        if (!payload || typeof payload !== "object") {
          setError("Invalid Launchpad response");
          return;
        }

        const next: LaunchpadData = {
          ...emptyLaunchpad(workspaceId),
          ...payload,
          workspaceId,
          callNewLeads: (payload.callNewLeads as LeadPreview[]) ?? [],
          contactedLeads: (payload.contactedLeads as LeadPreview[]) ?? [],
          openTasks: (payload.openTasks as TaskPreview[]) ?? [],
          onlineLeads: (payload.onlineLeads as LeadPreview[]) ?? [],
          hotLeads: (payload.hotLeads as LeadPreview[]) ?? [],
          unreadMessageCount:
            typeof payload.unreadMessageCount === "number"
              ? payload.unreadMessageCount
              : 0,
          unreadConversationCount:
            typeof payload.unreadConversationCount === "number"
              ? payload.unreadConversationCount
              : 0,
          unreadMessages:
            (payload.unreadMessages as UnreadMessagePreview[]) ?? [],
          contactRequested:
            (payload.contactRequested as ContactRequestedPreview[]) ?? [],
        };

        setData(next);
        launchpadCache.set(launchpadCacheKey(workspaceId), {
          launchpad: next,
          timestamp: Date.now(),
        });
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Network error loading Launchpad",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceId],
  );

  useEffect(() => {
    if (!workspaceId) return;
    const entry = launchpadCache.get(launchpadCacheKey(workspaceId));
    const FRESH_MS = 60_000;
    if (entry) {
      setData(entry.launchpad as LaunchpadData);
      setLoading(false);
      // Skip immediate refetch when hydrated cache is still fresh.
      if (Date.now() - entry.timestamp < FRESH_MS) {
        return;
      }
    } else {
      setData(emptyLaunchpad(workspaceId));
      setLoading(true);
    }
    void load(false);
  }, [workspaceId, load]);

  const toggleModule = (id: ModuleId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedModule((prev) => (prev === id ? null : id));
  };

  const openLeadFromList = (leadId: string, ids: string[]) => {
    onOpenLead(leadId, ids);
  };

  const modules: Array<{
    id: ModuleId;
    title: string;
    subtitle: string;
    accentColor: string;
    icon: React.ReactNode;
    linkLabel: string;
    onLink: () => void;
    body: React.ReactNode;
  }> = [
    {
      id: "callNew",
      title: "Call New Leads",
      subtitle: `${data.newLeadCount} new leads to call`,
      accentColor: "#E11D48",
      icon: <Text style={styles.moduleIconText}>📞</Text>,
      linkLabel: "Open in leads dashboard",
      onLink: () => onNavigateToLeads("NEW_LEAD"),
      body: (
        <LeadList
          leads={data.callNewLeads}
          empty="No new leads to call right now."
          onSelect={(id) =>
            openLeadFromList(
              id,
              data.callNewLeads.map((l) => l.id),
            )
          }
        />
      ),
    },
    {
      id: "contacted",
      title: "Contacted Leads",
      subtitle: `${data.contactedCount} clients to follow up with`,
      accentColor: "#D97706",
      icon: <Text style={styles.moduleIconText}>👤</Text>,
      linkLabel: "Open in leads dashboard",
      onLink: () => onNavigateToLeads("CONTACTED"),
      body: (
        <LeadList
          leads={data.contactedLeads}
          empty="No follow-up leads right now."
          onSelect={(id) =>
            openLeadFromList(
              id,
              data.contactedLeads.map((l) => l.id),
            )
          }
        />
      ),
    },
    {
      id: "messages",
      title: "New Messages",
      subtitle:
        data.unreadMessageCount === 0
          ? "No unread texts or chats"
          : data.unreadConversationCount === 1
            ? `${data.unreadMessageCount} unread message${data.unreadMessageCount === 1 ? "" : "s"}`
            : `${data.unreadMessageCount} unread · ${data.unreadConversationCount} conversations`,
      accentColor: "#0284C7",
      icon: <Text style={styles.moduleIconText}>💬</Text>,
      linkLabel: "Open chats inbox",
      onLink: onNavigateToChats,
      body: (
        <MessageList
          messages={data.unreadMessages}
          empty="No unread texts or chats right now."
          onSelect={(leadId) =>
            openLeadFromList(
              leadId,
              data.unreadMessages.map((m) => m.leadId),
            )
          }
        />
      ),
    },
    {
      id: "tasks",
      title: "Due Tasks",
      subtitle: `${data.overdueTaskCount} Overdue · ${data.dueTodayCount} Due Today`,
      accentColor: "#F59E0B",
      icon: <LaunchpadTaskIcon color="#F59E0B" size={16} />,
      linkLabel: "Open tasks",
      onLink: onNavigateToTasks,
      body: (
        <TaskList
          tasks={data.openTasks}
          empty="No open tasks due."
          onSelectLead={(leadId) => onOpenLead(leadId)}
        />
      ),
    },
    {
      id: "statistics",
      title: "Statistics",
      subtitle:
        data.avgResponseMins > 0
          ? `Response Time · ${data.avgResponseMins} mins`
          : "Response Time · —",
      accentColor: "#2B6CB0",
      icon: <LaunchpadStatsIcon color="#2B6CB0" size={16} />,
      linkLabel: "Open statistics",
      onLink: onNavigateToStatistics,
      body: (
        <View style={styles.statsBody}>
          <Text style={styles.statsBig}>
            {data.avgResponseMins > 0 ? `${data.avgResponseMins}m` : "—"}
          </Text>
          <Text style={styles.statsCaption}>
            Average first-response time on your desk
          </Text>
        </View>
      ),
    },
    {
      id: "online",
      title: "Online Leads",
      subtitle:
        data.onlineLeads.length === 0
          ? "No leads active on the site right now"
          : `${data.onlineLeads.length} lead${data.onlineLeads.length === 1 ? "" : "s"} active on the site`,
      accentColor: "#059669",
      icon: <Text style={styles.moduleIconText}>⚡</Text>,
      linkLabel: "Open in leads dashboard",
      onLink: () => onNavigateToLeads("ALL"),
      body: (
        <LeadList
          leads={data.onlineLeads}
          empty="Nobody from your desk is on the website right now."
          showOnline
          onSelect={(id) =>
            openLeadFromList(
              id,
              data.onlineLeads.map((l) => l.id),
            )
          }
        />
      ),
    },
    {
      id: "hot",
      title: "Hot Pipeline",
      subtitle: `${data.hotCount} leads scoring hot right now`,
      accentColor: "#0F6B4C",
      icon: <Text style={styles.moduleIconText}>🔥</Text>,
      linkLabel: "Open hot leads",
      onLink: () => onNavigateToLeads("ALL"),
      body: (
        <LeadList
          leads={data.hotLeads}
          empty="No hot-scoring leads right now."
          onSelect={(id) =>
            openLeadFromList(
              id,
              data.hotLeads.map((l) => l.id),
            )
          }
        />
      ),
    },
  ];

  const tasksDueLine =
    data.dueTodayCount === 1
      ? "1 task"
      : `${data.dueTodayCount} tasks`;
  const overdueLine =
    data.overdueTaskCount === 1
      ? "1 overdue"
      : `${data.overdueTaskCount} overdue`;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            if (workspaceId) clearLaunchpadCache(workspaceId);
            void load(true);
          }}
          tintColor="#0F6B4C"
          colors={["#0F6B4C"]}
        />
      }
    >
      <View style={styles.dateHeaderSection}>
        <Text style={styles.dateTitle}>{dateFormatted}</Text>
        <Text style={styles.dateSubtitle}>
          Today you have <Text style={styles.highlightCount}>{tasksDueLine}</Text>{" "}
          due
          {data.overdueTaskCount > 0 ? (
            <>
              {" · "}
              <Text style={styles.highlightCount}>{overdueLine}</Text>
              {"."}
            </>
          ) : (
            "."
          )}
        </Text>
      </View>

      <AgentServicesComingSoonBanner />

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeading}>Quick Modules</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onNavigateToLeads("NEW_LEAD")}
        >
          <Text style={styles.sectionActionText}>VIEW CRM</Text>
        </TouchableOpacity>
      </View>

      {loading && !cached ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#0F6B4C" />
          <Text style={styles.loadingText}>Loading desk…</Text>
        </View>
      ) : null}

      {error ? (
        <TouchableOpacity
          style={styles.errorBox}
          onPress={() => void load(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorRetry}>Tap to retry</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.modulesStack}>
        {modules.map((mod) => {
          const isExpanded = expandedModule === mod.id;
          return (
            <View key={mod.id} style={styles.moduleCard}>
              <TouchableOpacity
                style={[
                  styles.moduleCardHeader,
                  { borderLeftColor: mod.accentColor },
                ]}
                activeOpacity={0.8}
                onPress={() => toggleModule(mod.id)}
              >
                <View style={styles.moduleIconBox}>{mod.icon}</View>
                <View style={styles.moduleInfo}>
                  <Text style={styles.moduleTitle}>{mod.title}</Text>
                  <Text style={styles.moduleSubtitle}>{mod.subtitle}</Text>
                </View>
                <Text
                  style={[
                    styles.chevronText,
                    isExpanded && styles.chevronTextExpanded,
                  ]}
                >
                  ›
                </Text>
              </TouchableOpacity>

              {isExpanded ? (
                <View style={styles.moduleExpandedBody}>
                  {mod.body}
                  <TouchableOpacity
                    style={styles.moduleLinkBtn}
                    activeOpacity={0.85}
                    onPress={mod.onLink}
                  >
                    <Text style={styles.moduleLinkBtnText}>{mod.linkLabel}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.contactRequestedCard}>
        <View style={styles.crHeaderRow}>
          <Text style={styles.crTitle}>Contact Requested</Text>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              {data.contactRequested.length > 0
                ? `${data.contactRequested.length}`
                : "READY"}
            </Text>
          </View>
        </View>
        {data.contactRequested.length === 0 ? (
          <Text style={styles.crBodyText}>
            Inbound property inquiries and viewing requests routed to your desk
            will appear here.
          </Text>
        ) : (
          <View style={styles.crList}>
            {data.contactRequested.slice(0, 8).map((lead) => (
              <TouchableOpacity
                key={lead.id}
                style={styles.crRow}
                activeOpacity={0.75}
                onPress={() =>
                  openLeadFromList(
                    lead.id,
                    data.contactRequested.map((l) => l.id),
                  )
                }
              >
                <View style={styles.crRowMain}>
                  <Text style={styles.crRowName} numberOfLines={1}>
                    {leadLabel(lead)}
                  </Text>
                  <Text style={styles.crRowMeta} numberOfLines={1}>
                    {lead.status.replace(/_/g, " ")}
                    {lead.listingMls ? ` · MLS ${lead.listingMls}` : ""}
                  </Text>
                </View>
                {lead.isOnline ? (
                  <View style={styles.onlinePill}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.onlineText}>Online</Text>
                  </View>
                ) : (
                  <Text style={styles.crChevron}>›</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.securityFooterCard}>
        <Text style={styles.secTitle}>Tenant Isolation & Authority</Text>
        <View style={styles.secRow}>
          <Text style={styles.secLabel}>Workspace:</Text>
          <Text style={styles.secVal}>
            {activeWorkspace?.displayName} ({activeWorkspace?.slug})
          </Text>
        </View>
        <View style={styles.secRow}>
          <Text style={styles.secLabel}>Authority:</Text>
          <Text style={styles.secVal}>
            WorkspaceMember.role = {activeMembership?.role}
          </Text>
        </View>
        <View style={styles.secRow}>
          <Text style={styles.secLabel}>Desk:</Text>
          <Text style={styles.secVal}>
            {data.deskView === "team" ? "Team overview" : "My desk"}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function LeadList({
  leads,
  empty,
  onSelect,
  showOnline,
}: {
  leads: LeadPreview[];
  empty: string;
  onSelect: (id: string) => void;
  showOnline?: boolean;
}) {
  if (leads.length === 0) {
    return <Text style={styles.emptyLine}>{empty}</Text>;
  }
  return (
    <View style={styles.listStack}>
      {leads.map((lead) => (
        <TouchableOpacity
          key={lead.id}
          style={styles.listRow}
          activeOpacity={0.75}
          onPress={() => onSelect(lead.id)}
        >
          <View style={styles.listRowMain}>
            <Text style={styles.listRowTitle} numberOfLines={1}>
              {leadLabel(lead)}
            </Text>
            <Text style={styles.listRowMeta} numberOfLines={1}>
              {lead.meta || lead.status.replace(/_/g, " ")}
              {showOnline && lead.lastSeenAt
                ? ` · ${relativeAgo(lead.lastSeenAt)}`
                : ""}
            </Text>
          </View>
          {showOnline && lead.isOnline ? (
            <View style={styles.onlinePill}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Live</Text>
            </View>
          ) : (
            <Text style={styles.listChevron}>›</Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MessageList({
  messages,
  empty,
  onSelect,
}: {
  messages: UnreadMessagePreview[];
  empty: string;
  onSelect: (leadId: string) => void;
}) {
  if (messages.length === 0) {
    return <Text style={styles.emptyLine}>{empty}</Text>;
  }
  return (
    <View style={styles.listStack}>
      {messages.map((message) => {
        const channel =
          message.channel === "SMS"
            ? "SMS"
            : message.channel === "CHAT"
              ? "Chat"
              : null;
        return (
          <TouchableOpacity
            key={message.conversationId}
            style={styles.listRow}
            activeOpacity={0.75}
            onPress={() => onSelect(message.leadId)}
          >
            <View style={styles.listRowMain}>
              <Text style={styles.listRowTitle} numberOfLines={1}>
                {message.displayName}
              </Text>
              <Text style={styles.listRowMeta} numberOfLines={1}>
                {channel ? `${channel} · ` : ""}
                {message.preview?.trim() || "New message"}
              </Text>
            </View>
            <View style={styles.unreadPill}>
              <Text style={styles.unreadPillText}>
                {message.unreadCount > 99 ? "99+" : message.unreadCount}
              </Text>
            </View>
            <Text style={styles.listChevron}>›</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TaskList({
  tasks,
  empty,
  onSelectLead,
}: {
  tasks: TaskPreview[];
  empty: string;
  onSelectLead: (leadId: string) => void;
}) {
  if (tasks.length === 0) {
    return <Text style={styles.emptyLine}>{empty}</Text>;
  }
  return (
    <View style={styles.listStack}>
      {tasks.map((task) => (
        <TouchableOpacity
          key={task.id}
          style={styles.listRow}
          activeOpacity={0.75}
          disabled={!task.lead?.id}
          onPress={() => {
            if (task.lead?.id) onSelectLead(task.lead.id);
          }}
        >
          <View style={styles.listRowMain}>
            <Text style={styles.listRowTitle} numberOfLines={1}>
              {task.title}
            </Text>
            <Text
              style={[
                styles.listRowMeta,
                task.overdue && styles.listRowMetaOverdue,
              ]}
              numberOfLines={1}
            >
              {dueLabel(task.dueAt, task.overdue)}
              {task.lead
                ? ` · ${
                    task.lead.customer?.name?.trim() ||
                    task.lead.customer?.email ||
                    "Lead"
                  }`
                : ""}
            </Text>
          </View>
          <Text style={styles.listChevron}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: Platform.OS === "android" ? 36 : 24,
    gap: 16,
  },
  dateHeaderSection: {
    marginBottom: 4,
  },
  dateTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E2A38",
    letterSpacing: -0.5,
  },
  dateSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2B6CB0",
    marginTop: 4,
  },
  highlightCount: {
    fontWeight: "800",
    color: "#1E2A38",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  sectionActionText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F6B4C",
    letterSpacing: 0.5,
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 12,
    gap: 4,
  },
  errorText: {
    fontSize: 13,
    color: "#B91C1C",
    fontWeight: "600",
  },
  errorRetry: {
    fontSize: 12,
    color: "#E11D48",
    fontWeight: "700",
  },
  modulesStack: {
    gap: 10,
  },
  moduleCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    shadowColor: "rgba(15, 23, 42, 0.04)",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
    overflow: "hidden",
  },
  moduleCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderLeftWidth: 4,
  },
  moduleIconBox: {
    width: 28,
    alignItems: "center",
    marginRight: 10,
  },
  moduleIconText: {
    fontSize: 16,
  },
  moduleInfo: {
    flex: 1,
  },
  moduleTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E2A38",
  },
  moduleSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#5B6775",
    marginTop: 2,
  },
  chevronText: {
    fontSize: 20,
    fontWeight: "400",
    color: "#94A3B8",
    marginLeft: 8,
  },
  chevronTextExpanded: {
    transform: [{ rotate: "90deg" }],
    color: "#2B6CB0",
  },
  moduleExpandedBody: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#FBFCFD",
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
    gap: 10,
  },
  moduleLinkBtn: {
    backgroundColor: "#2B6CB0",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  moduleLinkBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyLine: {
    fontSize: 12,
    color: "#64748B",
    paddingHorizontal: 4,
    paddingVertical: 6,
    lineHeight: 17,
  },
  listStack: {
    gap: 2,
    maxHeight: 280,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEF2F6",
    marginBottom: 4,
  },
  listRowMain: {
    flex: 1,
    minWidth: 0,
  },
  listRowTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E2A38",
  },
  listRowMeta: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  listRowMetaOverdue: {
    color: "#E11D48",
    fontWeight: "600",
  },
  listChevron: {
    fontSize: 18,
    color: "#94A3B8",
    marginLeft: 8,
  },
  unreadPill: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    marginLeft: 8,
  },
  unreadPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0369A1",
  },
  statsBody: {
    alignItems: "center",
    paddingVertical: 12,
    gap: 4,
  },
  statsBig: {
    fontSize: 28,
    fontWeight: "800",
    color: "#2B6CB0",
  },
  statsCaption: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
  },
  contactRequestedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    padding: 16,
    gap: 10,
    shadowColor: "rgba(15, 23, 42, 0.04)",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
  },
  crHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  crTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#059669",
  },
  liveText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#059669",
    letterSpacing: 0.5,
  },
  crBodyText: {
    fontSize: 12,
    color: "#5B6775",
    lineHeight: 18,
  },
  crList: {
    gap: 6,
  },
  crRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  crRowMain: {
    flex: 1,
    minWidth: 0,
  },
  crRowName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E2A38",
  },
  crRowMeta: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  crChevron: {
    fontSize: 18,
    color: "#94A3B8",
    marginLeft: 8,
  },
  onlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  onlineDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#059669",
  },
  onlineText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#059669",
  },
  securityFooterCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 6,
  },
  secTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  secRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  secLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  secVal: {
    fontSize: 11,
    color: "#0F172A",
    fontWeight: "700",
    maxWidth: "65%",
    textAlign: "right",
  },
});
