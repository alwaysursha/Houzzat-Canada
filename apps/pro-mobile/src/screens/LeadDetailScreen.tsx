/**
 * Stage 4.4 — Native Lead Detail & CRM Record Screen.
 *
 * Faithfully matches the APPROVED HouzzatPRO visual design:
 * - Top header with safe back navigation and compact status pill
 * - Primary Contact Card (Name, Email, Phone, Buyer/Seller intent badge, Source)
 * - Pipeline & Assignment Card (Current Status, Status Updated, Assigned Agent / Pond, Hotness score)
 * - Property & Inquiry Context (MLS #, Inquiry tag, notes)
 * - Activity Summary Card (Counts for notes/tasks/appointments, recent activity timeline)
 * - Action Placeholders (Call, SMS, Note - visual only, disabled with 'Coming next')
 * - In-memory caching keyed by workspaceId + leadId
 * - Robust error handling (404, 403, network errors)
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { useAuth } from "../state/AuthContext";
import type {
  BackendEnvelope,
  LeadDetailResponseData,
  LeadStatus,
  MobileLeadDetail,
} from "../types/api";

// In-memory cache keyed by `${workspaceId}:${leadId}`
const detailCache = new Map<string, { data: MobileLeadDetail; timestamp: number }>();

export function clearLeadDetailCache(workspaceId?: string) {
  if (!workspaceId) {
    detailCache.clear();
    return;
  }
  for (const key of detailCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      detailCache.delete(key);
    }
  }
}

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
      return "Property Inquiry";
    case "SHOWING_REQUEST":
      return "Showing Request";
    case "VIRTUAL_VIEWING":
      return "Virtual Viewing";
    case "HOME_VALUATION":
      return "Home Valuation";
    case "BUYER_SESSION":
      return "Buyer Session";
    case "SAVED_SEARCH":
      return "Saved Search";
    case "LANDING_PAGE":
      return "Landing Page";
    case "OPEN_HOUSE":
      return "Open House";
    case "PAID_AD":
      return "Paid Ad";
    case "AFFORDABILITY":
      return "Affordability";
    case "SELLER_READINESS":
      return "Seller Readiness";
    case "SIGNUP":
      return "Signup";
    default:
      return source ? source.replace(/_/g, " ").toLowerCase() : "Direct";
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export function LeadDetailScreen({
  leadId,
  onBack,
}: {
  leadId: string;
  onBack: () => void;
}) {
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id;

  const cacheKey = workspaceId ? `${workspaceId}:${leadId}` : "";
  const cachedEntry = cacheKey ? detailCache.get(cacheKey) : undefined;

  const [lead, setLead] = useState<MobileLeadDetail | null>(cachedEntry?.data || null);
  const [isLoading, setIsLoading] = useState(!cachedEntry);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const fetchLeadDetail = useCallback(
    async (isPullToRefresh = false) => {
      if (!workspaceId || !leadId) return;

      if (!isPullToRefresh && !detailCache.has(cacheKey)) {
        setIsLoading(true);
      }
      setError(null);
      setErrorCode(null);

      try {
        const res = await mobileApiClient.get<
          BackendEnvelope<LeadDetailResponseData> | { ok: boolean; lead: MobileLeadDetail }
        >(`/leads/${encodeURIComponent(leadId)}`);

        if (!res.ok) {
          setError(res.message || "Failed to load lead details");
          setErrorCode((res as any).code || "ERROR");
          return;
        }

        const data: any = res.data;
        const fetchedLead: MobileLeadDetail =
          data?.lead || data?.data?.lead || (data as any);

        if (!fetchedLead || !fetchedLead.id) {
          setError("Lead record is empty or invalid");
          return;
        }

        setLead(fetchedLead);

        // Store in cache
        detailCache.set(cacheKey, {
          data: fetchedLead,
          timestamp: Date.now(),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error loading lead details";
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [workspaceId, leadId, cacheKey],
  );

  useEffect(() => {
    fetchLeadDetail();
  }, [fetchLeadDetail]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchLeadDetail(true);
  };

  const statusStyle = lead ? getStatusStyle(lead.status) : getStatusStyle("NEW_LEAD");
  const isBuyer = lead?.intent === "BUYER";
  const contactName = lead?.customer?.name?.trim() || "Unnamed Contact";
  const contactEmail = lead?.customer?.email?.trim() || null;
  const contactPhone = lead?.customer?.phone?.trim() || null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E2A38" />

      {/* Top Header matching HouzzatPRO Dark Slate Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backButtonText}>← Leads</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {lead ? contactName : "Lead Detail"}
          </Text>
        </View>

        {lead ? (
          <View
            style={[
              styles.headerStatusBadge,
              { backgroundColor: statusStyle.bg, borderColor: statusStyle.border },
            ]}
          >
            <Text style={[styles.headerStatusText, { color: statusStyle.text }]}>
              {statusStyle.label}
            </Text>
          </View>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* Content Area */}
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#0F6B4C" />
          <Text style={styles.loadingText}>Loading lead record…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorIcon}>
            {errorCode === "LEAD_NOT_FOUND" ? "🔍" : "⚠️"}
          </Text>
          <Text style={styles.errorTitle}>
            {errorCode === "LEAD_NOT_FOUND" ? "Lead Unavailable" : "Unable to Load Lead"}
          </Text>
          <Text style={styles.errorSubtitle}>
            {errorCode === "LEAD_NOT_FOUND"
              ? "This lead does not exist or you do not have permission to access it."
              : error}
          </Text>
          <View style={styles.errorButtonRow}>
            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchLeadDetail()}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backErrorBtn} onPress={onBack}>
              <Text style={styles.backErrorBtnText}>Back to Leads</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : !lead ? (
        <View style={styles.centerState}>
          <Text style={styles.errorIcon}>📄</Text>
          <Text style={styles.errorTitle}>Lead Not Found</Text>
          <TouchableOpacity style={styles.backErrorBtn} onPress={onBack}>
            <Text style={styles.backErrorBtnText}>Back to Leads</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
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
          {/* Card 1: Primary Contact Details */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardSectionTag}>CONTACT INFORMATION</Text>
              <View style={styles.tagRow}>
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
                    {lead.intent}
                  </Text>
                </View>
                {lead.score > 0 ? (
                  <View style={styles.scoreBadge}>
                    <Text style={styles.scoreText}>🔥 {lead.score}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <Text style={styles.contactName}>{contactName}</Text>

            <View style={styles.detailRowList}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Email</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {contactEmail || "No email provided"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Phone</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {contactPhone || "No phone provided"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Source</Text>
                <Text style={styles.detailValueHighlight}>
                  {formatSource(lead.source)}
                </Text>
              </View>

              {lead.customer?.homeAddress ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Location</Text>
                  <Text style={styles.detailValue} numberOfLines={2}>
                    {lead.customer.homeAddress}
                  </Text>
                </View>
              ) : null}

              {lead.customer?.purchaseTimeframe ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Timeframe</Text>
                  <Text style={styles.detailValue}>
                    {lead.customer.purchaseTimeframe.replace(/_/g, " ")}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Card 2: Pipeline & Assignment Context */}
          <View style={styles.card}>
            <Text style={styles.cardSectionTag}>PIPELINE & ASSIGNMENT</Text>

            <View style={styles.pipelineGrid}>
              <View style={styles.pipelineItem}>
                <Text style={styles.pipelineItemLabel}>Current Stage</Text>
                <View
                  style={[
                    styles.stageBadge,
                    { backgroundColor: statusStyle.bg, borderColor: statusStyle.border },
                  ]}
                >
                  <Text style={[styles.stageBadgeText, { color: statusStyle.text }]}>
                    {statusStyle.label}
                  </Text>
                </View>
              </View>

              <View style={styles.pipelineItem}>
                <Text style={styles.pipelineItemLabel}>Stage Updated</Text>
                <Text style={styles.pipelineItemValue}>
                  {formatRelativeTime(lead.statusChangedAt)}
                </Text>
              </View>

              <View style={styles.pipelineItem}>
                <Text style={styles.pipelineItemLabel}>Assigned Agent</Text>
                {lead.assignedAgent ? (
                  <Text style={styles.agentValue} numberOfLines={1}>
                    👤 {lead.assignedAgent.name || lead.assignedAgent.email}
                  </Text>
                ) : (
                  <Text style={styles.pondValue}>🌊 Pond (Unassigned)</Text>
                )}
              </View>

              <View style={styles.pipelineItem}>
                <Text style={styles.pipelineItemLabel}>First Response SLA</Text>
                <Text style={styles.pipelineItemValue}>
                  {lead.firstRespondedAt ? formatRelativeTime(lead.firstRespondedAt) : "Pending"}
                </Text>
              </View>
            </View>
          </View>

          {/* Card 3: Property & Inquiry Context */}
          {lead.listingMls || lead.inquiryTag || lead.notes ? (
            <View style={styles.card}>
              <Text style={styles.cardSectionTag}>INQUIRY CONTEXT</Text>

              {lead.inquiryTag ? (
                <View style={styles.inquiryTagRow}>
                  <Text style={styles.inquiryTagLabel}>Inquiry Type:</Text>
                  <View style={styles.inquiryTagBadge}>
                    <Text style={styles.inquiryTagBadgeText}>{lead.inquiryTag}</Text>
                  </View>
                </View>
              ) : null}

              {lead.listingMls ? (
                <View style={styles.mlsBox}>
                  <Text style={styles.mlsLabel}>Associated MLS® Listing:</Text>
                  <Text style={styles.mlsValue}>#{lead.listingMls}</Text>
                </View>
              ) : null}

              {lead.notes ? (
                <View style={styles.notesBox}>
                  <Text style={styles.notesLabel}>Initial Inquiry Note:</Text>
                  <Text style={styles.notesBody}>{lead.notes}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Card 4: Activity Summary */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardSectionTag}>ACTIVITY SUMMARY</Text>
              <Text style={styles.createdDateText}>
                Created {formatRelativeTime(lead.createdAt)}
              </Text>
            </View>

            {/* Quick Count Badges */}
            <View style={styles.countsRow}>
              <View style={styles.countBox}>
                <Text style={styles.countNumber}>{lead.counts.notes}</Text>
                <Text style={styles.countLabel}>Notes</Text>
              </View>
              <View style={styles.countBox}>
                <Text style={styles.countNumber}>{lead.counts.tasks}</Text>
                <Text style={styles.countLabel}>Tasks</Text>
              </View>
              <View style={styles.countBox}>
                <Text style={styles.countNumber}>{lead.counts.appointments}</Text>
                <Text style={styles.countLabel}>Appts</Text>
              </View>
            </View>

            {/* Recent Timeline Items */}
            <View style={styles.timelineSection}>
              <Text style={styles.timelineTitle}>Recent Events</Text>
              {lead.recentActivities && lead.recentActivities.length > 0 ? (
                lead.recentActivities.map((act) => (
                  <View key={act.id} style={styles.activityItem}>
                    <View style={styles.activityDot} />
                    <View style={styles.activityContent}>
                      <View style={styles.activityTopRow}>
                        <Text style={styles.activityType}>{act.type.replace(/_/g, " ")}</Text>
                        <Text style={styles.activityTime}>
                          {formatRelativeTime(act.createdAt)}
                        </Text>
                      </View>
                      {act.body ? (
                        <Text style={styles.activityBody} numberOfLines={2}>
                          {act.body}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyActivityBox}>
                  <Text style={styles.emptyActivityText}>
                    Lead created {formatDate(lead.createdAt)}. No further activity recorded.
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Action Placeholders: Read-only visually styled "Coming next" */}
          <View style={styles.actionPlaceholderCard}>
            <Text style={styles.actionPlaceholderTitle}>LEAD ACTIONS (COMING NEXT)</Text>
            <View style={styles.actionButtonGroup}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDisabled]}
                disabled={true}
                activeOpacity={1}
              >
                <Text style={styles.actionBtnText}>📞 Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDisabled]}
                disabled={true}
                activeOpacity={1}
              >
                <Text style={styles.actionBtnText}>💬 SMS</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDisabled]}
                disabled={true}
                activeOpacity={1}
              >
                <Text style={styles.actionBtnText}>📝 Add Note</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.actionDisclaimer}>
              Editing, messaging, and pipeline mutation will arrive in upcoming stages.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const topHeaderPadding = Platform.OS === "android" ? Math.max(StatusBar.currentHeight || 0, 42) + 8 : 12;
const bottomPadding = Platform.OS === "android" ? 54 : 24;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  header: {
    backgroundColor: "#1E2A38",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: topHeaderPadding,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  headerTitleGroup: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  headerStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  headerStatusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerSpacer: {
    width: 60,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: bottomPadding + 20,
    gap: 14,
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#475569",
    fontWeight: "600",
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1E2A38",
    marginBottom: 6,
  },
  errorSubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 18,
  },
  errorButtonRow: {
    flexDirection: "row",
    gap: 12,
  },
  retryBtn: {
    backgroundColor: "#0F6B4C",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  backErrorBtn: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backErrorBtnText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardSectionTag: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.8,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  intentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  intentBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  scoreBadge: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  scoreText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#B45309",
  },
  contactName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1E2A38",
    marginBottom: 12,
  },
  detailRowList: {
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E2A38",
    maxWidth: "65%",
    textAlign: "right",
  },
  detailValueHighlight: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F766E",
    maxWidth: "65%",
    textAlign: "right",
  },
  pipelineGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    gap: 12,
  },
  pipelineItem: {
    width: "47%",
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pipelineItemLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  pipelineItemValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E2A38",
  },
  stageBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  stageBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  agentValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F766E",
  },
  pondValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#D97706",
  },
  inquiryTagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  inquiryTagLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  inquiryTagBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  inquiryTagBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  mlsBox: {
    marginTop: 10,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    padding: 10,
    borderRadius: 8,
  },
  mlsLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F766E",
    marginBottom: 2,
  },
  mlsValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#134E4A",
  },
  notesBox: {
    marginTop: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 4,
  },
  notesBody: {
    fontSize: 13,
    color: "#334155",
    lineHeight: 18,
  },
  createdDateText: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
  },
  countsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 6,
    marginBottom: 14,
  },
  countBox: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  countNumber: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1E2A38",
  },
  countLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },
  timelineSection: {
    marginTop: 4,
  },
  timelineTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0F766E",
    marginTop: 5,
    marginRight: 10,
  },
  activityContent: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  activityTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  activityType: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E2A38",
    textTransform: "capitalize",
  },
  activityTime: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "600",
  },
  activityBody: {
    fontSize: 12,
    color: "#475569",
    marginTop: 2,
  },
  emptyActivityBox: {
    paddingVertical: 12,
    alignItems: "center",
  },
  emptyActivityText: {
    fontSize: 12,
    color: "#94A3B8",
    fontStyle: "italic",
    textAlign: "center",
  },
  actionPlaceholderCard: {
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    alignItems: "center",
  },
  actionPlaceholderTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 1,
    marginBottom: 10,
  },
  actionButtonGroup: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    justifyContent: "center",
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  actionDisclaimer: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 8,
    textAlign: "center",
    fontStyle: "italic",
  },
});
