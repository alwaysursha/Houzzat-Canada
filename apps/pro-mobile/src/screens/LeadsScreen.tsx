/**
 * Stage 4.3A & 4.3B — Native Agent Leads Screen.
 *
 * Visually restored to match the original HouzzatPRO Leads CRM layout:
 * - Top search bar with clean icon and clear action
 * - Real LeadStatus filter chips with original Houzzat pipeline pill colors:
 *   - NEW_LEAD (Red #E11D48 / #FEF2F2)
 *   - ATTEMPTED_CONTACT (Orange #EA580C / #FFF7ED)
 *   - CONTACTED (Green #16A34A / #F0FDF4)
 *   - APPT_SET / APPT_MET (Slate #64748B / #F8FAFC)
 *   - ACTIVE_CLIENT (Teal #0F766E / #F0FDFA)
 *   - PENDING_CLIENT (Dark Slate #475569 / #F1F5F9)
 *   - PAST_CLIENT (Gray #94A3B8 / #F8FAFC)
 * - Lead Card design matching original CRM:
 *   - Contact Name + Status pill
 *   - Intent badge (BUYER / SELLER) & Source
 *   - Email / Phone contact details
 *   - Assigned Agent badge & Hotness score flame
 *   - Relative timestamp
 * - Real V2 backend data, server-side pagination, search, caching, pull-to-refresh
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { ContactMailIcon, ContactPhoneIcon } from "../components/ContactActionIcons";
import { LeadAccountVerifyMenu } from "../components/LeadAccountVerifyMenu";
import {
  leadCacheStore,
  setLeadCacheStore,
  updateCustomerEmailVerifiedInListCache,
} from "../lib/lead-list-cache";
import { useAuth } from "../state/AuthContext";
import type { BackendEnvelope, LeadsResponseData, MobileLeadSummary, LeadStatus } from "../types/api";
import { LeadDetailScreen } from "./LeadDetailScreen";

type LeadViewFilter = "all" | "mine" | "pond";
type LeadSortKey =
  | "lastLogin"
  | "updated"
  | "created"
  | "score"
  | "name"
  | "status";

const VIEW_FILTERS: Array<{ id: LeadViewFilter; label: string }> = [
  { id: "all", label: "All leads" },
  { id: "mine", label: "Mine" },
  { id: "pond", label: "Pond" },
];

const SORT_OPTIONS: Array<{ id: LeadSortKey; label: string }> = [
  { id: "lastLogin", label: "Last Login" },
  { id: "updated", label: "Recently Updated" },
  { id: "created", label: "Newest" },
  { id: "score", label: "Score" },
  { id: "name", label: "Name" },
  { id: "status", label: "Status" },
];

/**
 * Lead row tap opens Lead Detail.
 * Prefer parent-controlled overlay (AgentShell / CommandCentreShell) so the
 * white web-mobile modal chrome covers the shell — matching LeadQuickPopup.
 * Falls back to inline detail when used without onSelectLead.
 */

const STATUS_FILTERS: { key: LeadStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "NEW_LEAD", label: "New Leads" },
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
      return { bg: "#FEF2F2", text: "#B91C1C", border: "#FCA5A5", label: "NEW LEAD" };
    case "ATTEMPTED_CONTACT":
      return { bg: "#FFF7ED", text: "#C2410C", border: "#FDBA74", label: "ATTEMPTED" };
    case "CONTACTED":
      return { bg: "#F0FDF4", text: "#15803D", border: "#86EFAC", label: "CONTACTED" };
    case "APPT_SET":
      return { bg: "#F8FAFC", text: "#475569", border: "#CBD5E1", label: "APPT SET" };
    case "APPT_MET":
      return { bg: "#F8FAFC", text: "#475569", border: "#CBD5E1", label: "APPT MET" };
    case "ACTIVE_CLIENT":
      return { bg: "#F0FDFA", text: "#0F766E", border: "#99F6E4", label: "ACTIVE" };
    case "PENDING_CLIENT":
      return { bg: "#F1F5F9", text: "#334155", border: "#CBD5E1", label: "PENDING" };
    case "PAST_CLIENT":
      return { bg: "#F8FAFC", text: "#94A3B8", border: "#E2E8F0", label: "PAST" };
    default:
      return { bg: "#F8FAFC", text: "#475569", border: "#CBD5E1", label: status };
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
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
    return "—";
  }
}

// Lead list cache lives in ../lib/lead-list-cache (shared with LeadDetailScreen).

interface LeadsScreenProps {
  initialStatusFilter?: string;
  selectedLeadId?: string | null;
  /** Called with lead id + ordered list ids for prev/next navigation (web modal parity). */
  onSelectLead?: (leadId: string, leadIds: string[]) => void;
  onBackFromDetail?: () => void;
  onPlanViewings?: (leadId: string, leadName?: string, mlsNumbers?: string[]) => void;
}

export function LeadsScreen({
  initialStatusFilter,
  selectedLeadId: controlledLeadId,
  onSelectLead,
  onBackFromDetail,
  onPlanViewings,
}: LeadsScreenProps) {
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id;

  const [internalSelectedLeadId, setInternalSelectedLeadId] = useState<string | null>(null);
  const activeLeadId = controlledLeadId !== undefined ? controlledLeadId : internalSelectedLeadId;

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

  const [selectedStatus, setSelectedStatus] = useState<LeadStatus | "ALL">(() => {
    if (initialStatusFilter && (initialStatusFilter as any) !== "ALL") {
      return initialStatusFilter as LeadStatus;
    }
    return "ALL";
  });

  const [viewFilter, setViewFilter] = useState<LeadViewFilter>("all");
  const [sortKey, setSortKey] = useState<LeadSortKey>("lastLogin");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersBackdropOpacity = useRef(new Animated.Value(0)).current;
  const filtersSheetTranslateY = useRef(new Animated.Value(56)).current;

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Launchpad / CALL NEW / VIEW CRM can re-enter Leads with a new filter.
  useEffect(() => {
    if (!initialStatusFilter) return;
    if (initialStatusFilter === "ALL") {
      setSelectedStatus("ALL");
      return;
    }
    setSelectedStatus(initialStatusFilter as LeadStatus);
  }, [initialStatusFilter]);

  // Debounce search query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // After Lead Detail closes, rehydrate list from cache (status patches applied there).
  useEffect(() => {
    if (controlledLeadId !== null && controlledLeadId !== undefined) return;
    if (leadCacheStore && leadCacheStore.workspaceId === workspaceId) {
      setLeads(leadCacheStore.leads);
      setTotalCount(leadCacheStore.totalCount);
    }
  }, [controlledLeadId, workspaceId]);

  const fetchLeads = useCallback(
    async (isPullToRefresh = false) => {
      if (!isPullToRefresh && (!leadCacheStore || leadCacheStore.workspaceId !== workspaceId)) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const queryParts: string[] = [
          "limit=50",
          "page=1",
          `sort=${encodeURIComponent(sortKey)}`,
          "dir=desc",
          `view=${encodeURIComponent(viewFilter)}`,
        ];
        if (selectedStatus !== "ALL") {
          queryParts.push(`status=${encodeURIComponent(selectedStatus)}`);
        }
        if (debouncedSearch.length > 0) {
          queryParts.push(`q=${encodeURIComponent(debouncedSearch)}`);
        }

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

        // Only cache the default dashboard query so stale sorted/filtered lists
        // are not shown as the default Last Login view on cold start.
        if (
          workspaceId &&
          selectedStatus === "ALL" &&
          debouncedSearch === "" &&
          viewFilter === "all" &&
          sortKey === "lastLogin"
        ) {
          setLeadCacheStore({
            workspaceId,
            leads: fetchedLeads,
            totalCount: count,
            timestamp: Date.now(),
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error loading leads";
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [workspaceId, selectedStatus, debouncedSearch, viewFilter, sortKey],
  );

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchLeads(true);
  };

  const handleSelectLead = (leadId: string) => {
    const leadIds = leads.map((l) => l.id);
    if (onSelectLead) {
      onSelectLead(leadId, leadIds);
      return;
    }
    setInternalSelectedLeadId(leadId);
  };

  const handleBackFromDetail = () => {
    if (onBackFromDetail) {
      onBackFromDetail();
      return;
    }
    setInternalSelectedLeadId(null);
  };

  // Parent-controlled: list stays mounted under shell overlay (preserves scroll/filter).
  const showInlineDetail = !onSelectLead && Boolean(activeLeadId);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (viewFilter !== "all") n += 1;
    if (sortKey !== "lastLogin") n += 1;
    return n;
  }, [viewFilter, sortKey]);

  const sortLabel =
    SORT_OPTIONS.find((o) => o.id === sortKey)?.label ?? "Last Login";
  const viewLabel =
    VIEW_FILTERS.find((o) => o.id === viewFilter)?.label ?? "All leads";

  const openFilters = useCallback(() => {
    filtersBackdropOpacity.setValue(0);
    filtersSheetTranslateY.setValue(56);
    setFiltersOpen(true);
  }, [filtersBackdropOpacity, filtersSheetTranslateY]);

  const closeFilters = useCallback(() => {
    Animated.parallel([
      Animated.timing(filtersBackdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(filtersSheetTranslateY, {
        toValue: 56,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setFiltersOpen(false);
    });
  }, [filtersBackdropOpacity, filtersSheetTranslateY]);

  useEffect(() => {
    if (!filtersOpen) return;
    Animated.parallel([
      Animated.timing(filtersBackdropOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(filtersSheetTranslateY, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [filtersOpen, filtersBackdropOpacity, filtersSheetTranslateY]);

  const renderLeadCard = ({ item }: { item: MobileLeadSummary }) => {
    const statusStyle = getStatusStyle(item.status);
    const customerName = item.customer?.name?.trim() || "Inquiry (No Name)";
    const contactEmail = item.customer?.email;
    const contactPhone = item.customer?.phone;
    const showBuyer =
      item.customer?.isBuyer ?? item.intent === "BUYER";
    const showSeller =
      item.customer?.isSeller ?? item.intent === "SELLER";
    const lastLoginText = item.isOnline
      ? "Online"
      : formatDate(item.lastSeenAt);

    return (
      <TouchableOpacity
        style={styles.leadCard}
        activeOpacity={0.8}
        onPress={() => handleSelectLead(item.id)}
      >
        {/* Top Card Row: Name + Status Pill */}
        <View style={styles.cardTopRow}>
          <View style={styles.nameContainer}>
            <View style={styles.nameWithVerify}>
              <Text style={styles.leadName} numberOfLines={1}>
                {customerName}
              </Text>
              {item.customer ? (
                <LeadAccountVerifyMenu
                  compact
                  leadId={item.id}
                  emailVerified={Boolean(item.customer.emailVerified)}
                  accountCreatedAt={item.customer.createdAt}
                  onVerifiedChange={(verified) => {
                    if (item.customer?.id) {
                      updateCustomerEmailVerifiedInListCache(
                        workspaceId,
                        item.customer.id,
                        verified,
                      );
                    }
                    setLeads((prev) =>
                      prev.map((row) => {
                        if (!row.customer || row.customer.id !== item.customer?.id) {
                          return row;
                        }
                        return {
                          ...row,
                          customer: {
                            ...row.customer,
                            emailVerified: verified,
                          },
                        };
                      }),
                    );
                  }}
                />
              ) : null}
            </View>
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: statusStyle.bg,
                    borderColor: statusStyle.border,
                  },
                ]}
              >
                <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                  {statusStyle.label}
                </Text>
              </View>

              {showBuyer ? (
                <View style={[styles.intentBadge, styles.buyerBadge]}>
                  <Text style={[styles.intentBadgeText, styles.buyerBadgeText]}>
                    BUYER
                  </Text>
                </View>
              ) : null}
              {showSeller ? (
                <View style={[styles.intentBadge, styles.sellerBadge]}>
                  <Text style={[styles.intentBadgeText, styles.sellerBadgeText]}>
                    SELLER
                  </Text>
                </View>
              ) : null}

              {item.source ? (
                <Text style={styles.sourceText} numberOfLines={1}>
                  • {formatSource(item.source)}
                </Text>
              ) : null}
            </View>
          </View>

          {item.isOnline ? (
            <View style={styles.onlinePill}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Online</Text>
            </View>
          ) : (
            <Text style={styles.dateText}>Login {lastLoginText}</Text>
          )}
        </View>

        {/* Contact info row */}
        <View style={styles.contactRow}>
          {contactEmail ? (
            <View style={styles.contactItem}>
              <ContactMailIcon color="#475569" size={12} />
              <Text style={styles.contactText} numberOfLines={1}>
                {contactEmail}
              </Text>
            </View>
          ) : null}
          {contactPhone ? (
            <View style={styles.contactItem}>
              <ContactPhoneIcon color="#475569" size={12} />
              <Text style={styles.contactText} numberOfLines={1}>
                {contactPhone}
              </Text>
            </View>
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

  if (showInlineDetail && activeLeadId) {
    return (
      <LeadDetailScreen
        leadId={activeLeadId}
        leadIds={leads.map((l) => l.id)}
        onNavigateLead={(id) => setInternalSelectedLeadId(id)}
        onBack={handleBackFromDetail}
        onPlanViewings={onPlanViewings}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Title Count Header */}
      <View style={styles.titleCountRow}>
        <Text style={styles.titleText}>Leads</Text>
        <Text style={styles.countText}>{totalCount} leads</Text>
      </View>

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

      {/* Pipeline status chips — full width; Filters lives on the summary row */}
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
                style={[
                  styles.filterChip,
                  isSelected && styles.filterChipActive,
                  f.key === "NEW_LEAD" && isSelected && styles.filterChipRedActive,
                ]}
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

        <View style={styles.sortSummaryRow}>
          <Text style={styles.sortSummaryText} numberOfLines={1}>
            {viewLabel} · Sorted by {sortLabel}
          </Text>
          <TouchableOpacity
            style={[
              styles.filtersBtn,
              activeFilterCount > 0 && styles.filtersBtnActive,
            ]}
            onPress={openFilters}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
          >
            <Text
              style={[
                styles.filtersBtnText,
                activeFilterCount > 0 && styles.filtersBtnTextActive,
              ]}
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={filtersOpen}
        animationType="none"
        transparent
        onRequestClose={closeFilters}
      >
        <View style={styles.modalRoot}>
          <Animated.View
            style={[styles.modalBackdrop, { opacity: filtersBackdropOpacity }]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeFilters}
              accessibilityRole="button"
              accessibilityLabel="Dismiss filters"
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.modalSheet,
              { transform: [{ translateY: filtersSheetTranslateY }] },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Filters</Text>

            <Text style={styles.modalSectionLabel}>View</Text>
            <View style={styles.modalOptions}>
              {VIEW_FILTERS.map((opt) => {
                const active = viewFilter === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.modalOption, active && styles.modalOptionActive]}
                    onPress={() => setViewFilter(opt.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        active && styles.modalOptionTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.modalSectionLabel}>Sort by</Text>
            <View style={styles.modalOptions}>
              {SORT_OPTIONS.map((opt) => {
                const active = sortKey === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.modalOption, active && styles.modalOptionActive]}
                    onPress={() => setSortKey(opt.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        active && styles.modalOptionTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.modalDone}
              onPress={closeFilters}
              activeOpacity={0.8}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* Body Area */}
      <View style={styles.listContainer}>
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#0F6B4C" />
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
            ) : selectedStatus !== "ALL" || viewFilter !== "all" ? (
              <>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>No leads match filters</Text>
                <Text style={styles.emptySubtitle}>
                  Try another status, view, or clear filters.
                </Text>
                <TouchableOpacity
                  style={styles.clearFilterBtn}
                  onPress={() => {
                    setSelectedStatus("ALL");
                    setViewFilter("all");
                    setSortKey("lastLogin");
                  }}
                >
                  <Text style={styles.clearFilterBtnText}>Reset Filters</Text>
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
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                colors={["#0F6B4C"]}
                tintColor="#0F6B4C"
              />
            }
          >
            {leads.map((item) => (
              <React.Fragment key={item.id}>
                {renderLeadCard({ item })}
              </React.Fragment>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F6F8", // Mist background
  },
  titleCountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  titleText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E2A38",
  },
  countText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5B6775",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D8DEE6",
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
    color: "#1E2A38",
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
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filtersBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8DEE6",
    flexShrink: 0,
  },
  filtersBtnActive: {
    backgroundColor: "#0F6B4C",
    borderColor: "#0F6B4C",
  },
  filtersBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F6B4C",
  },
  filtersBtnTextActive: {
    color: "#FFFFFF",
  },
  sortSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sortSummaryText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "android" ? 28 : 36,
    paddingTop: 10,
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1E2A38",
    marginBottom: 16,
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 4,
  },
  modalOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  modalOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  modalOptionActive: {
    backgroundColor: "#ECFDF5",
    borderColor: "#0F6B4C",
  },
  modalOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  modalOptionTextActive: {
    color: "#0F6B4C",
    fontWeight: "700",
  },
  modalDone: {
    marginTop: 4,
    backgroundColor: "#0F6B4C",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalDoneText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  onlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
  },
  onlineText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8DEE6",
  },
  filterChipActive: {
    backgroundColor: "#1E2A38",
    borderColor: "#1E2A38",
  },
  filterChipRedActive: {
    backgroundColor: "#E11D48",
    borderColor: "#E11D48",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5B6775",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 14,
    paddingBottom: Platform.OS === "android" ? 36 : 24,
    gap: 10,
  },
  leadCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    shadowColor: "rgba(15, 23, 42, 0.04)",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
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
    color: "#1E2A38",
    flexShrink: 1,
  },
  nameWithVerify: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginBottom: 4,
    maxWidth: "100%",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  intentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  intentBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  buyerBadge: {
    backgroundColor: "#64748B",
  },
  buyerBadgeText: {
    color: "#FFFFFF",
  },
  sellerBadge: {
    backgroundColor: "#5A9A6E",
  },
  sellerBadgeText: {
    color: "#FFFFFF",
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
    alignItems: "center",
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    flexShrink: 1,
  },
  contactText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
    flexShrink: 1,
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
    color: "#1E2A38",
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
    color: "#1E2A38",
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
    backgroundColor: "#0F6B4C",
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
    color: "#1E2A38",
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
    color: "#0F6B4C",
    fontWeight: "700",
  },
});
