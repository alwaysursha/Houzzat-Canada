/**
 * Stage 4.3A — Native Agent Leads Screen.
 *
 * Workspace-scoped real CRM Leads list for HouzzatPRO Mobile v2.
 * Features:
 * - Real data from GET /api/mobile/v2/leads
 * - Debounced native search (name, email, phone)
 * - Real LeadStatus filter chips
 * - Native pull-to-refresh
 * - In-memory caching for instant tab switching
 * - Empty, search-no-match, error, and loading states
 * - Safe non-navigational row interaction for Stage 4.3A
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { useAuth } from "../state/AuthContext";
import type { BackendEnvelope, LeadsResponseData, MobileLeadSummary, LeadStatus } from "../types/api";

const STATUS_FILTERS: { key: LeadStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "NEW_LEAD", label: "New" },
  { key: "ATTEMPTED_CONTACT", label: "Attempted" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "APPT_SET", label: "Appt Set" },
  { key: "APPT_MET", label: "Appt Met" },
  { key: "ACTIVE_CLIENT", label: "Active" },
  { key: "PENDING_CLIENT", label: "Pending" },
  { key: "PAST_CLIENT", label: "Past" },
];

function getStatusStyle(status: LeadStatus) {
  switch (status) {
    case "NEW_LEAD":
      return { bg: "#DCFCE7", text: "#15803D", label: "New Lead" };
    case "ATTEMPTED_CONTACT":
      return { bg: "#FEF3C7", text: "#B45309", label: "Attempted" };
    case "CONTACTED":
      return { bg: "#E0F2FE", text: "#0369A1", label: "Contacted" };
    case "APPT_SET":
      return { bg: "#EDE9FE", text: "#6D28D9", label: "Appt Set" };
    case "APPT_MET":
      return { bg: "#E0E7FF", text: "#4338CA", label: "Appt Met" };
    case "ACTIVE_CLIENT":
      return { bg: "#D1FAE5", text: "#047857", label: "Active Client" };
    case "PENDING_CLIENT":
      return { bg: "#FFEDD5", text: "#C2410C", label: "Pending" };
    case "PAST_CLIENT":
      return { bg: "#F1F5F9", text: "#475569", label: "Past Client" };
    default:
      return { bg: "#F1F5F9", text: "#475569", label: status };
  }
}

function formatSource(source: string): string {
  switch (source) {
    case "PROPERTY_INQUIRY":
      return "Inquiry";
    case "SHOWING_REQUEST":
      return "Showing";
    case "HOME_VALUATION":
      return "Valuation";
    case "BUYER_SESSION":
      return "Buyer Session";
    case "SAVED_SEARCH":
      return "Saved Search";
    case "SIGNUP":
      return "Signup";
    default:
      return source.replace(/_/g, " ").toLowerCase();
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) {
      const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
      return `${diffMins}m ago`;
    }
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// In-memory cache for fast tab-switching
let leadCacheStore: {
  workspaceId: string;
  leads: MobileLeadSummary[];
  totalCount: number;
  timestamp: number;
} | null = null;

export function LeadsScreen() {
  const { activeWorkspace, activeMembership } = useAuth();

  const workspaceId = activeWorkspace?.id;

  const [leads, setLeads] = useState<MobileLeadSummary[]>(() => {
    if (leadCacheStore && leadCacheStore.workspaceId === workspaceId) {
      return leadCacheStore.leads;
    }
    return [];
  });

  const [totalCount, setTotalCount] = useState<number>(() => {
    if (leadCacheStore && leadCacheStore.workspaceId === workspaceId) {
      return leadCacheStore.totalCount;
    }
    return 0;
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return !(leadCacheStore && leadCacheStore.workspaceId === workspaceId);
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedStatus, setSelectedStatus] = useState<LeadStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const noticeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchLeads = useCallback(
    async (isPullToRefresh = false) => {
      if (!isPullToRefresh && (!leadCacheStore || leadCacheStore.workspaceId !== workspaceId)) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const queryParts: string[] = [];
        if (selectedStatus !== "ALL") {
          queryParts.push(`status=${encodeURIComponent(selectedStatus)}`);
        }
        if (debouncedSearch.length > 0) {
          queryParts.push(`q=${encodeURIComponent(debouncedSearch)}`);
        }
        queryParts.push("limit=50");

        const endpoint = `/leads?${queryParts.join("&")}`;

        const res = await mobileApiClient.get<BackendEnvelope<LeadsResponseData>>(endpoint);

        if (!res.ok) {
          setError(res.message || "Failed to load leads from workspace");
          return;
        }

        const data: LeadsResponseData =
          (res.data as any)?.data !== undefined ? (res.data as any).data : res.data;

        const fetchedLeads = data?.leads || [];
        const count = data?.pagination?.totalCount ?? fetchedLeads.length;

        setLeads(fetchedLeads);
        setTotalCount(count);

        if (workspaceId && selectedStatus === "ALL" && debouncedSearch === "") {
          leadCacheStore = {
            workspaceId,
            leads: fetchedLeads,
            totalCount: count,
            timestamp: Date.now(),
          };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error loading leads";
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [workspaceId, selectedStatus, debouncedSearch],
  );

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchLeads(true);
  };

  const showTapNotice = (lead: MobileLeadSummary) => {
    const name = lead.customer?.name || "Lead";
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNoticeMessage(`${name} • Details coming next in Stage 4.3B`);
    noticeTimerRef.current = setTimeout(() => {
      setNoticeMessage(null);
    }, 2800);
  };

  const renderLeadCard = ({ item }: { item: MobileLeadSummary }) => {
    const statusStyle = getStatusStyle(item.status);
    const customerName = item.customer?.name?.trim() || "Inquiry (No Name)";
    const contactEmail = item.customer?.email;
    const contactPhone = item.customer?.phone;
    const isBuyer = item.intent === "BUYER";
    const dateText = formatDate(item.updatedAt || item.createdAt);

    return (
      <TouchableOpacity
        style={styles.leadCard}
        activeOpacity={0.8}
        onPress={() => showTapNotice(item)}
      >
        {/* Top Card Row */}
        <View style={styles.cardTopRow}>
          <View style={styles.nameContainer}>
            <Text style={styles.leadName} numberOfLines={1}>
              {customerName}
            </Text>
            <View style={styles.badgeRow}>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                  {statusStyle.label}
                </Text>
              </View>

              <View
                style={[
                  styles.intentBadge,
                  { backgroundColor: isBuyer ? "#EFF6FF" : "#FAF5FF" },
                ]}
              >
                <Text
                  style={[
                    styles.intentBadgeText,
                    { color: isBuyer ? "#2563EB" : "#9333EA" },
                  ]}
                >
                  {item.intent}
                </Text>
              </View>

              {item.source ? (
                <Text style={styles.sourceText} numberOfLines={1}>
                  • {formatSource(item.source)}
                </Text>
              ) : null}
            </View>
          </View>

          <Text style={styles.dateText}>{dateText}</Text>
        </View>

        {/* Contact info row */}
        <View style={styles.contactRow}>
          {contactEmail ? (
            <Text style={styles.contactText} numberOfLines={1}>
              ✉ {contactEmail}
            </Text>
          ) : null}
          {contactPhone ? (
            <Text style={styles.contactText} numberOfLines={1}>
              📞 {contactPhone}
            </Text>
          ) : null}
        </View>

        {/* Card Footer: Assignee & Score */}
        <View style={styles.cardFooterRow}>
          {item.assignedAgent?.name ? (
            <Text style={styles.assigneeText} numberOfLines={1}>
              Agent: <Text style={styles.assigneeName}>{item.assignedAgent.name}</Text>
            </Text>
          ) : (
            <Text style={styles.unassignedText}>Pond • Unassigned</Text>
          )}

          {item.score > 0 ? (
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreText}>🔥 {item.score}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search leads by name, email, phone..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Status Filter Chips */}
      <View style={styles.filterScrollContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {STATUS_FILTERS.map((f) => {
            const isSelected = selectedStatus === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => setSelectedStatus(f.key)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Temporary Tap Notice Toast */}
      {noticeMessage ? (
        <View style={styles.noticeToast}>
          <Text style={styles.noticeToastText}>{noticeMessage}</Text>
        </View>
      ) : null}

      {/* Body Area */}
      <View style={styles.listContainer}>
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#0B5C49" />
            <Text style={styles.loadingText}>Loading workspace leads…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Unable to load leads</Text>
            <Text style={styles.errorSubtitle}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchLeads()}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : leads.length === 0 ? (
          <View style={styles.centerState}>
            {debouncedSearch.length > 0 ? (
              <>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No matching leads</Text>
                <Text style={styles.emptySubtitle}>
                  No leads found matching "{debouncedSearch}".
                </Text>
                <TouchableOpacity
                  style={styles.clearFilterBtn}
                  onPress={() => setSearchQuery("")}
                >
                  <Text style={styles.clearFilterBtnText}>Clear Search</Text>
                </TouchableOpacity>
              </>
            ) : selectedStatus !== "ALL" ? (
              <>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>No leads in this stage</Text>
                <Text style={styles.emptySubtitle}>
                  There are currently no leads with status "{selectedStatus}".
                </Text>
                <TouchableOpacity
                  style={styles.clearFilterBtn}
                  onPress={() => setSelectedStatus("ALL")}
                >
                  <Text style={styles.clearFilterBtnText}>View All Leads</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyTitle}>No leads in workspace</Text>
                <Text style={styles.emptySubtitle}>
                  Inbound inquiries and assigned leads will appear here.
                </Text>
              </>
            )}
          </View>
        ) : (
          <FlatList
            data={leads}
            keyExtractor={(item) => item.id}
            renderItem={renderLeadCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                colors={["#0B5C49"]}
                tintColor="#0B5C49"
              />
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  searchContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "700",
  },
  filterScrollContainer: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
  },
  filterChipActive: {
    backgroundColor: "#0B5C49",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  noticeToast: {
    backgroundColor: "#0F172A",
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  noticeToastText: {
    color: "#96F0D8",
    fontSize: 12,
    fontWeight: "600",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 14,
    gap: 10,
  },
  leadCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  nameContainer: {
    flex: 1,
    marginRight: 8,
  },
  leadName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  intentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  intentBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  sourceText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  dateText: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
  },
  contactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingVertical: 4,
  },
  contactText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
  },
  cardFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F8FAFC",
  },
  assigneeText: {
    fontSize: 11,
    color: "#64748B",
  },
  assigneeName: {
    fontWeight: "600",
    color: "#1E293B",
  },
  unassignedText: {
    fontSize: 11,
    color: "#94A3B8",
    fontStyle: "italic",
  },
  scoreBadge: {
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scoreText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#EF4444",
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  errorSubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: "#0B5C49",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
  },
  clearFilterBtn: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearFilterBtnText: {
    fontSize: 12,
    color: "#0B5C49",
    fontWeight: "700",
  },
});
