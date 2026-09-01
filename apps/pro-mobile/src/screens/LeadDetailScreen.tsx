/**
 * Stage 4.4B / 4.5 / 4.6 — Native Lead Detail (web-mobile visual parity + actions).
 *
 * Visual authority: src/components/agent/CustomerProfile.tsx (variant="modal")
 * + LeadQuickPopup mobile shell.
 *
 * Data: GET /api/mobile/v2/leads/[leadId]
 * Actions: native tel/sms/mailto + POST notes + PATCH status + tasks.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { AppointmentsTab } from "../components/AppointmentsTab";
import { TasksRemindersTab } from "../components/TasksRemindersTab";
import { updateLeadStatusInListCache } from "../lib/lead-list-cache";
import { useAuth } from "../state/AuthContext";
import type {
  BackendEnvelope,
  LeadDetailResponseData,
  LeadStatus,
  MobileLeadActivity,
  MobileLeadDetail,
} from "../types/api";

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

function patchLeadDetailCache(
  cacheKey: string,
  patch: Partial<MobileLeadDetail> & {
    recentActivities?: MobileLeadActivity[];
    counts?: MobileLeadDetail["counts"];
  },
) {
  const existing = detailCache.get(cacheKey);
  if (!existing) return;
  detailCache.set(cacheKey, {
    data: { ...existing.data, ...patch },
    timestamp: Date.now(),
  });
}

const PIPELINE_STATUSES: LeadStatus[] = [
  "NEW_LEAD",
  "ATTEMPTED_CONTACT",
  "CONTACTED",
  "APPT_SET",
  "APPT_MET",
  "ACTIVE_CLIENT",
  "PENDING_CLIENT",
  "PAST_CLIENT",
];

type TabId =
  | "activity"
  | "info"
  | "reminders"
  | "appointments"
  | "conversations"
  | "engagement";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "activity", label: "Activity" },
  { id: "info", label: "Info" },
  { id: "reminders", label: "Task & Reminders" },
  { id: "appointments", label: "Appointments" },
  { id: "conversations", label: "Conversations" },
  { id: "engagement", label: "Engagement" },
];

/** Canonical pipeline banner colors from src/lib/agent/pipeline.ts */
function pipelineBanner(status: LeadStatus): { bg: string; label: string } {
  switch (status) {
    case "NEW_LEAD":
      return { bg: "#E11D48", label: "New Lead" };
    case "ATTEMPTED_CONTACT":
      return { bg: "#EA580C", label: "Attempted Contact" };
    case "CONTACTED":
      return { bg: "#16A34A", label: "Contacted" };
    case "APPT_SET":
      return { bg: "#64748B", label: "Appt Set" };
    case "APPT_MET":
      return { bg: "#64748B", label: "Appt Met" };
    case "ACTIVE_CLIENT":
      return { bg: "#0F766E", label: "Active Client" };
    case "PENDING_CLIENT":
      return { bg: "#475569", label: "Pending Client" };
    case "PAST_CLIENT":
      return { bg: "#94A3B8", label: "Past Client" };
    default: {
      const _exhaustive: never = status;
      return { bg: "#64748B", label: String(_exhaustive) };
    }
  }
}

function inquiryTagStyle(tag: string): { bg: string; text: string; label: string } {
  switch (tag) {
    case "VIEWING":
      return { bg: "#EDE9FE", text: "#5B21B6", label: "Viewing" };
    case "HOME_VALUE":
      return { bg: "#FEF3C7", text: "#78350F", label: "Home Value" };
    case "PROPERTY_DETAILS":
      return { bg: "#E0F2FE", text: "#0C4A6E", label: "Property details" };
    case "GENERAL":
      return { bg: "#E2E8F0", text: "#1E293B", label: "General" };
    default:
      return { bg: "#E2E8F0", text: "#1E293B", label: tag.replace(/_/g, " ") };
  }
}

function relativeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(0, mins)} Min Ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} Hour${hours === 1 ? "" : "s"} Ago`;
  const days = Math.floor(hours / 24);
  return `${days} Day${days === 1 ? "" : "s"} Ago`;
}

function pipelineStatusDate(statusChangedAt: string, createdAt: string): string {
  const raw = statusChangedAt || createdAt;
  try {
    return new Date(raw).toLocaleDateString("en-US");
  } catch {
    return raw;
  }
}

function purchaseTimeframeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  switch (value) {
    case "NOW":
      return "Now";
    case "ONE_TO_THREE_MONTHS":
      return "1–3 months";
    case "SIX_TO_TWELVE_MONTHS":
      return "6–12 months";
    case "TWELVE_PLUS_MONTHS":
      return "12+ months";
    default:
      return value.replace(/_/g, " ");
  }
}

function formatSource(source: string): string {
  return source.replace(/_/g, " ");
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function RingStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <View style={styles.ringStat}>
      <View style={[styles.ringOuter, { borderColor: tone }]}>
        <View style={styles.ringInner}>
          <Text style={styles.ringPct}>{pct}%</Text>
        </View>
      </View>
      <Text style={styles.ringLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value && value.trim() ? value : "—"}</Text>
    </View>
  );
}

function DetailColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.detailColumn}>
      <Text style={styles.detailColumnTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ComingSoonPanel({ title, hint }: { title: string; hint: string }) {
  return (
    <Panel title={title}>
      <View style={styles.comingSoonBox}>
        <Text style={styles.comingSoonText}>{hint}</Text>
        <Text style={styles.comingSoonSub}>Coming next · visual shell only</Text>
      </View>
    </Panel>
  );
}

type ActivityQuickCategory =
  | "all"
  | "alerts"
  | "emails"
  | "views"
  | "saves"
  | "calls"
  | "notes"
  | "pipeline";

const ACTIVITY_QUICK_CATEGORIES: Array<{
  id: ActivityQuickCategory;
  label: string;
  match: (type: string) => boolean;
}> = [
  { id: "all", label: "All", match: () => true },
  {
    id: "alerts",
    label: "Alerts",
    match: (t) => {
      const u = t.toUpperCase();
      return (
        u === "PROPERTY_ALERT_EMAIL" ||
        u === "DIGEST_EMAIL" ||
        u === "WATCH_PROPERTY" ||
        u === "WATCH_AREA" ||
        u === "PROPERTY_ALERT" ||
        u.includes("ALERT")
      );
    },
  },
  {
    id: "emails",
    label: "Emails",
    match: (t) => {
      const u = t.toUpperCase();
      return (
        u.includes("EMAIL") ||
        u === "SHORTLIST_EMAILED" ||
        u === "AGENT_MESSAGE" ||
        u === "DIGEST_EMAIL"
      );
    },
  },
  {
    id: "views",
    label: "Views",
    match: (t) => {
      const u = t.toUpperCase();
      return u === "LISTING_VIEW" || u === "PROPERTY_ALERT_VIEW" || u.includes("VIEW");
    },
  },
  {
    id: "saves",
    label: "Saves",
    match: (t) => {
      const u = t.toUpperCase();
      return u.includes("SAVE") || u.includes("WATCH") || u.includes("HEART");
    },
  },
  {
    id: "calls",
    label: "Calls",
    match: (t) => {
      const u = t.toUpperCase();
      return u === "CALL_NOTE" || u === "CALL" || u.includes("CALL");
    },
  },
  {
    id: "notes",
    label: "Notes",
    match: (t) => {
      const u = t.toUpperCase();
      return u === "NOTE" || u === "CALL_NOTE" || u === "NOTE_PIN" || u.includes("NOTE");
    },
  },
  {
    id: "pipeline",
    label: "Pipeline",
    match: (t) => {
      const u = t.toUpperCase();
      return (
        u === "STATUS_CHANGE" ||
        u.includes("ASSIGN") ||
        u === "APPOINTMENT" ||
        u === "TODO" ||
        u === "REMINDER_SET" ||
        u.includes("STATUS")
      );
    },
  },
];

/** Mirrors src/components/agent/CrmTimeline categoryMeta for native chips/icons. */
function activityCategoryMeta(type: string): {
  icon: string;
  chipBg: string;
  chipText: string;
  chipRing: string;
  dot: string;
  label: string;
} {
  const t = type.toUpperCase();
  if (t === "DIGEST_EMAIL" || t === "PROPERTY_ALERT_EMAIL") {
    return {
      icon: "🔔",
      chipBg: "#CFFAFE",
      chipText: "#0E7490",
      chipRing: "#67E8F9",
      dot: "#06B6D4",
      label: t === "DIGEST_EMAIL" ? "Digest email" : "Property alert email",
    };
  }
  if (t === "EMAIL_OPENED" || t.includes("OPENED")) {
    return {
      icon: "📭",
      chipBg: "#D1FAE5",
      chipText: "#047857",
      chipRing: "#6EE7B7",
      dot: "#10B981",
      label: "Email opened",
    };
  }
  if (t === "EMAIL_CLICKED" || t.includes("CLICKED")) {
    return {
      icon: "🖱",
      chipBg: "#FEF3C7",
      chipText: "#B45309",
      chipRing: "#FCD34D",
      dot: "#F59E0B",
      label: "Email clicked",
    };
  }
  if (t.includes("EMAIL") || t === "SHORTLIST_EMAILED" || t === "AGENT_MESSAGE") {
    return {
      icon: "✉",
      chipBg: "#DBEAFE",
      chipText: "#1E40AF",
      chipRing: "#93C5FD",
      dot: "#3B82F6",
      label: t === "SHORTLIST_EMAILED" ? "Shortlist emailed" : t === "AGENT_MESSAGE" ? "Agent message" : "Email sent",
    };
  }
  if (t === "CALL_NOTE" || t === "CALL") {
    return {
      icon: "📞",
      chipBg: "#BAE6FD",
      chipText: "#075985",
      chipRing: "#7DD3FC",
      dot: "#0EA5E9",
      label: t === "CALL_NOTE" ? "Call note" : "Call",
    };
  }
  if (t.includes("NOTE")) {
    return {
      icon: "📝",
      chipBg: "#E2E8F0",
      chipText: "#334155",
      chipRing: "#CBD5E1",
      dot: "#64748B",
      label: "Note",
    };
  }
  if (t === "LISTING_VIEW" || t === "PROPERTY_ALERT_VIEW" || t.includes("VIEW")) {
    return {
      icon: "👁",
      chipBg: "#E2E8F0",
      chipText: "#1E293B",
      chipRing: "#94A3B8",
      dot: "#475569",
      label: "Listing view",
    };
  }
  if (t.includes("SAVE") || t.includes("WATCH") || t.includes("HEART")) {
    return {
      icon: t.includes("SEARCH") ? "🔍" : "♥",
      chipBg: "#FECDD3",
      chipText: "#9F1239",
      chipRing: "#FDA4AF",
      dot: "#F43F5E",
      label: t.includes("SEARCH") ? "Saved search" : "Saved listing",
    };
  }
  if (t === "APPOINTMENT") {
    return {
      icon: "📅",
      chipBg: "#BBF7D0",
      chipText: "#166534",
      chipRing: "#86EFAC",
      dot: "#22C55E",
      label: "Appointment",
    };
  }
  if (t.includes("STATUS") || t.includes("ASSIGN") || t === "TODO") {
    return {
      icon: "↗",
      chipBg: "#99F6E4",
      chipText: "#115E59",
      chipRing: "#5EEAD4",
      dot: "#0F766E",
      label: t.includes("ASSIGN") ? "Assignment" : "Pipeline update",
    };
  }
  if (t === "SIGN_IN" || t === "SIGN_UP" || t === "CREATED" || t.includes("INQUIRY")) {
    return {
      icon: "👤",
      chipBg: "#CBD5E1",
      chipText: "#0F172A",
      chipRing: "#94A3B8",
      dot: "#334155",
      label: type.replace(/_/g, " "),
    };
  }
  return {
    icon: "🔖",
    chipBg: "#E2E8F0",
    chipText: "#334155",
    chipRing: "#CBD5E1",
    dot: "#64748B",
    label: type.replace(/_/g, " "),
  };
}

function activityTimeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return relativeAgo(iso);
  }
}

function dayHeading(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function ContactActionRow({
  icon,
  value,
  muted,
  multiline,
  showEdit,
  showBell,
  onEdit,
  onRequestUpdate,
}: {
  icon: string;
  value: string | null;
  muted?: boolean;
  multiline?: boolean;
  showEdit?: boolean;
  showBell?: boolean;
  onEdit?: () => void;
  onRequestUpdate?: () => void;
}) {
  return (
    <View style={styles.contactRow}>
      <Text style={styles.contactIcon}>{icon}</Text>
      <Text
        style={[
          styles.contactValue,
          muted && styles.contactMuted,
          multiline && styles.contactMultiline,
          (showEdit || showBell) && styles.contactValueFlex,
        ]}
        numberOfLines={multiline ? 2 : 1}
      >
        {value || "N/A"}
      </Text>
      {showEdit ? (
        <TouchableOpacity
          style={styles.contactActionBtn}
          onPress={onEdit}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Edit"
        >
          <Text style={styles.contactActionIcon}>✎</Text>
        </TouchableOpacity>
      ) : null}
      {showBell ? (
        <TouchableOpacity
          style={styles.contactActionBtn}
          onPress={onRequestUpdate}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Request update"
        >
          <Text style={styles.contactBellIcon}>🔔</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function LeadDetailScreen({
  leadId,
  leadIds,
  onNavigateLead,
  onBack,
}: {
  leadId: string;
  leadIds?: string[];
  onNavigateLead?: (leadId: string) => void;
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
  const [tab, setTab] = useState<TabId>("activity");
  const [activityCategory, setActivityCategory] =
    useState<ActivityQuickCategory>("all");
  const [noteBody, setNoteBody] = useState("");
  const [noteCategory, setNoteCategory] = useState<"GENERAL" | "CALL">("GENERAL");
  const [notePinned, setNotePinned] = useState(false);
  const [notePending, setNotePending] = useState(false);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const mainScrollRef = useRef<{
    scrollTo: (opts: { y: number; animated?: boolean }) => void;
  } | null>(null);
  const rightColumnOffsetY = useRef(0);
  const tabSectionOffsetY = useRef(0);

  const selectTab = (next: TabId) => {
    setTab(next);
    // After leaving a long Activity timeline, scroll offset can sit past the
    // shorter Appointments / Task & Reminders content — bring the tab into view.
    if (next === "reminders" || next === "appointments") {
      requestAnimationFrame(() => {
        mainScrollRef.current?.scrollTo({
          y: Math.max(0, tabSectionOffsetY.current - 12),
          animated: true,
        });
      });
    }
  };

  const navIndex =
    leadIds && leadIds.length > 1 ? leadIds.indexOf(leadId) : -1;
  const prevLeadId =
    navIndex > 0 && leadIds ? leadIds[navIndex - 1]! : null;
  const nextLeadId =
    navIndex >= 0 && leadIds && navIndex < leadIds.length - 1
      ? leadIds[navIndex + 1]!
      : null;
  const showLeadNav =
    Boolean(onNavigateLead) && navIndex >= 0 && (leadIds?.length ?? 0) > 1;

  const showComingNext = (feature: string) => {
    Alert.alert(
      feature,
      "This action will arrive in an upcoming stage. Visual control matches the web mobile CRM.",
      [{ text: "OK" }],
    );
  };

  const openNativeUrl = async (url: string, unavailableTitle: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(unavailableTitle, "No compatible app is available on this device.");
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert(unavailableTitle, "Could not open the device app.");
    }
  };

  const handleCall = () => {
    const phone = lead?.customer?.phone?.trim();
    if (!phone) return;
    void openNativeUrl(`tel:${phone}`, "Call unavailable");
  };

  const handleSms = () => {
    const phone = lead?.customer?.phone?.trim();
    if (!phone) return;
    // Native SMS composer only — no canned body invented.
    void openNativeUrl(`sms:${phone}`, "SMS unavailable");
  };

  const handleEmail = () => {
    const email = lead?.customer?.email?.trim();
    if (!email) return;
    void openNativeUrl(`mailto:${encodeURIComponent(email)}`, "Email unavailable");
  };

  const handleSaveNote = async () => {
    const trimmed = noteBody.trim();
    if (!trimmed || notePending || !lead) return;
    setNotePending(true);
    setNoteMessage(null);
    try {
      const res = await mobileApiClient.post<{
        ok: boolean;
        note?: { id: string; body: string; category: string; pinned: boolean; createdAt: string };
        message?: string;
      }>(`/leads/${encodeURIComponent(leadId)}/notes`, {
        body: trimmed,
        category: noteCategory,
        pinned: notePinned,
      });

      if (!res.ok) {
        setNoteMessage(res.message || "Could not save note");
        return;
      }

      const created = (res.data as {
        note?: {
          id: string;
          body: string;
          category?: string;
          pinned?: boolean;
          createdAt: string;
        };
      })?.note;
      const wasPinned = Boolean(created?.pinned ?? notePinned);
      const activityItem: MobileLeadActivity = {
        id: created?.id || `note_${Date.now()}`,
        type: "note",
        body: trimmed.slice(0, 500),
        createdAt: created?.createdAt || new Date().toISOString(),
        ...(wasPinned ? { pinned: true } : {}),
      };

      setLead((prev) => {
        if (!prev) return prev;
        const merged = [activityItem, ...(prev.recentActivities || [])];
        const pinnedItems = merged.filter((a) => a.pinned);
        const rest = merged.filter((a) => !a.pinned);
        const next: MobileLeadDetail = {
          ...prev,
          recentActivities: [...pinnedItems, ...rest].slice(0, 10),
          counts: {
            ...prev.counts,
            notes: prev.counts.notes + 1,
          },
        };
        if (cacheKey) patchLeadDetailCache(cacheKey, next);
        return next;
      });

      setNoteBody("");
      setNotePinned(false);
      setNoteMessage(
        wasPinned
          ? `${noteCategory === "CALL" ? "Call" : "General"} note pinned`
          : `${noteCategory === "CALL" ? "Call" : "General"} note saved`,
      );
      setTimeout(() => setNoteMessage(null), 2000);
      // Background reconcile with server detail (activities + counts).
      void fetchLeadDetail(true);
    } catch (err: unknown) {
      setNoteMessage(err instanceof Error ? err.message : "Could not save note");
    } finally {
      setNotePending(false);
    }
  };

  const handleSelectStatus = async (next: LeadStatus) => {
    if (!lead || statusPending || next === lead.status) {
      setStatusMenuOpen(false);
      return;
    }
    setStatusPending(true);
    const previous = lead.status;
    const previousChangedAt = lead.statusChangedAt;
    const optimisticAt = new Date().toISOString();

    // Optimistic local update
    setLead((prev) => {
      if (!prev) return prev;
      const patched = { ...prev, status: next, statusChangedAt: optimisticAt };
      if (cacheKey) patchLeadDetailCache(cacheKey, patched);
      return patched;
    });
    setStatusMenuOpen(false);

    try {
      const res = await mobileApiClient.patch<{
        ok: boolean;
        lead?: {
          id: string;
          status: LeadStatus;
          statusChangedAt: string;
          firstRespondedAt: string | null;
        };
        message?: string;
      }>(`/leads/${encodeURIComponent(leadId)}/status`, { status: next });

      if (!res.ok) {
        setLead((prev) => {
          if (!prev) return prev;
          const rolled = {
            ...prev,
            status: previous,
            statusChangedAt: previousChangedAt,
          };
          if (cacheKey) patchLeadDetailCache(cacheKey, rolled);
          return rolled;
        });
        Alert.alert("Status update failed", res.message || "Could not update pipeline status");
        return;
      }

      const serverLead = (res.data as { lead?: {
        status: LeadStatus;
        statusChangedAt: string;
        firstRespondedAt: string | null;
      } })?.lead;

      setLead((prev) => {
        if (!prev) return prev;
        const activityItem: MobileLeadActivity = {
          id: `status_${Date.now()}`,
          type: "status_change",
          body: serverLead?.status || next,
          createdAt: serverLead?.statusChangedAt || optimisticAt,
        };
        const patched: MobileLeadDetail = {
          ...prev,
          status: serverLead?.status || next,
          statusChangedAt: serverLead?.statusChangedAt || optimisticAt,
          firstRespondedAt:
            serverLead?.firstRespondedAt !== undefined
              ? serverLead.firstRespondedAt
              : prev.firstRespondedAt,
          recentActivities: [activityItem, ...(prev.recentActivities || [])].slice(0, 10),
        };
        if (cacheKey) patchLeadDetailCache(cacheKey, patched);
        return patched;
      });

      updateLeadStatusInListCache(
        workspaceId,
        leadId,
        serverLead?.status || next,
        serverLead?.statusChangedAt || optimisticAt,
      );
    } catch (err: unknown) {
      setLead((prev) => {
        if (!prev) return prev;
        const rolled = {
          ...prev,
          status: previous,
          statusChangedAt: previousChangedAt,
        };
        if (cacheKey) patchLeadDetailCache(cacheKey, rolled);
        return rolled;
      });
      Alert.alert(
        "Status update failed",
        err instanceof Error ? err.message : "Network error",
      );
    } finally {
      setStatusPending(false);
    }
  };

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
          setErrorCode((res as { code?: string }).code || "ERROR");
          return;
        }

        const data: unknown = res.data;
        const fetchedLead: MobileLeadDetail =
          (data as { lead?: MobileLeadDetail })?.lead ||
          (data as { data?: { lead?: MobileLeadDetail } })?.data?.lead ||
          (data as MobileLeadDetail);

        if (!fetchedLead || !fetchedLead.id) {
          setError("Lead record is empty or invalid");
          return;
        }

        setLead(fetchedLead);
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
    const nextCached = cacheKey ? detailCache.get(cacheKey) : undefined;
    if (nextCached) {
      setLead(nextCached.data);
      setIsLoading(false);
      setError(null);
    } else {
      setLead(null);
      setIsLoading(true);
    }
    fetchLeadDetail();
  }, [fetchLeadDetail, cacheKey]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchLeadDetail(true);
  };

  const activities = lead?.recentActivities ?? [];
  const activityCounts = useMemo(() => {
    const counts: Record<ActivityQuickCategory, number> = {
      all: activities.length,
      alerts: 0,
      emails: 0,
      views: 0,
      saves: 0,
      calls: 0,
      notes: 0,
      pipeline: 0,
    };
    for (const act of activities) {
      for (const cat of ACTIVITY_QUICK_CATEGORIES) {
        if (cat.id === "all") continue;
        if (cat.match(act.type)) counts[cat.id] += 1;
      }
    }
    return counts;
  }, [activities]);

  const visibleActivities = useMemo(() => {
    const matcher =
      ACTIVITY_QUICK_CATEGORIES.find((c) => c.id === activityCategory)?.match ??
      (() => true);
    return activities.filter((a) => matcher(a.type));
  }, [activities, activityCategory]);

  const activityGroups = useMemo(() => {
    const map = new Map<string, { label: string; items: MobileLeadActivity[] }>();
    for (const item of visibleActivities) {
      const key = item.createdAt.slice(0, 10);
      const existing = map.get(key);
      if (existing) existing.items.push(item);
      else
        map.set(key, {
          label: dayHeading(item.createdAt),
          items: [item],
        });
    }
    return [...map.entries()].map(([key, value]) => ({ key, ...value }));
  }, [visibleActivities]);

  const name =
    lead?.customer?.name ||
    lead?.customer?.email ||
    (lead?.source ? formatSource(lead.source) : null) ||
    "Lead";
  const initials = initialsFromName(name);
  const phone = lead?.customer?.phone?.trim() || null;
  const email = lead?.customer?.email?.trim() || null;
  const address = lead?.customer?.homeAddress?.trim() || null;
  const isBuyer =
    lead?.customer?.isBuyer ?? (lead?.intent === "BUYER");
  const isSeller =
    lead?.customer?.isSeller ?? (lead?.intent === "SELLER");
  const banner = lead ? pipelineBanner(lead.status) : null;
  const tagStyle = lead?.inquiryTag ? inquiryTagStyle(lead.inquiryTag) : null;

  const firstName = lead?.customer?.name?.split(/\s+/)[0] || null;
  const lastName =
    lead?.customer?.name?.split(/\s+/).slice(1).join(" ") || null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Modal header — matches LeadQuickPopup / CustomerProfile modal chrome */}
      <View style={styles.modalHeader}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onBack}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Close"
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>

        <View style={styles.modalHeaderCenter}>
          <Text style={styles.modalHeaderLabel}>LEAD PROFILE</Text>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={isLoading || isRefreshing}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.refreshLink,
                (isLoading || isRefreshing) && styles.refreshLinkDisabled,
              ]}
            >
              {isRefreshing ? "Refreshing…" : "Refresh profile"}
            </Text>
          </TouchableOpacity>
        </View>

        {showLeadNav ? (
          <View style={styles.leadNavGroup}>
            <TouchableOpacity
              style={[styles.leadNavBtn, !prevLeadId && styles.leadNavBtnDisabled]}
              disabled={!prevLeadId || isLoading}
              onPress={() => prevLeadId && onNavigateLead?.(prevLeadId)}
              activeOpacity={0.7}
              accessibilityLabel="Previous lead"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.leadNavChevron}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.leadNavBtn, !nextLeadId && styles.leadNavBtnDisabled]}
              disabled={!nextLeadId || isLoading}
              onPress={() => nextLeadId && onNavigateLead?.(nextLeadId)}
              activeOpacity={0.7}
              accessibilityLabel="Next lead"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.leadNavChevron}>›</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.modalHeaderSpacer} />
        )}
      </View>

      {isLoading && !lead ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#2B6CB0" />
          <Text style={styles.loadingText}>Loading profile…</Text>
        </View>
      ) : error && !lead ? (
        <View style={styles.centerState}>
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>
              {errorCode === "LEAD_NOT_FOUND" ? "Lead unavailable" : "Unable to load"}
            </Text>
            <Text style={styles.errorBody}>
              {errorCode === "LEAD_NOT_FOUND"
                ? "This lead does not exist or you do not have permission to access it."
                : error}
            </Text>
            <View style={styles.errorActions}>
              <TouchableOpacity style={styles.retryBtn} onPress={() => fetchLeadDetail()}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.backBtn} onPress={onBack}>
                <Text style={styles.backBtnText}>Back to Leads</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : !lead ? (
        <View style={styles.centerState}>
          <Text style={styles.loadingText}>Lead not found</Text>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>Back to Leads</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          ref={mainScrollRef as any}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={["#2B6CB0"]}
              tintColor="#2B6CB0"
            />
          }
        >
          {/* ===== PROFILE ASIDE (web mobile stacked column) ===== */}
          <View style={styles.aside}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials || "?"}</Text>
            </View>

            <Text style={styles.name}>{name}</Text>

            {/* Contact rows — web ContactDisplayRow parity (value + pen + bell) */}
            <View style={styles.contactStack}>
              <ContactActionRow
                icon="📞"
                value={phone}
                muted={!phone}
                showEdit={Boolean(lead.customer)}
                showBell={Boolean(lead.customer)}
                onEdit={() => showComingNext("Edit phone")}
                onRequestUpdate={() =>
                  showComingNext("Request phone update")
                }
              />
              <ContactActionRow
                icon="✉"
                value={email}
                muted={!email}
                showEdit={Boolean(lead.customer)}
                showBell={Boolean(lead.customer)}
                onEdit={() => showComingNext("Edit email")}
                onRequestUpdate={() =>
                  showComingNext("Request email update")
                }
              />
              <ContactActionRow
                icon="📍"
                value={address}
                muted={!address}
                multiline
                showEdit={Boolean(lead.customer)}
                onEdit={() => showComingNext("Edit address")}
              />
            </View>

            {/* Quick actions — Call / Dial / Text / Email via native OS composers */}
            <View style={styles.actionRow}>
              {[
                {
                  label: "Call",
                  bg: "#0D9488",
                  icon: "📞",
                  enabled: Boolean(phone),
                  onPress: handleCall,
                },
                {
                  label: "Dial",
                  bg: "#14B8A6",
                  icon: "📱",
                  enabled: Boolean(phone),
                  onPress: handleCall,
                },
                {
                  label: "Text",
                  bg: "#0EA5E9",
                  icon: "💬",
                  enabled: Boolean(phone),
                  onPress: handleSms,
                },
                {
                  label: "Email",
                  bg: "#38BDF8",
                  icon: "✉",
                  enabled: Boolean(email),
                  onPress: handleEmail,
                },
                {
                  label: "More",
                  bg: "#64748B",
                  icon: "⋯",
                  enabled: true,
                  onPress: () => setTab("conversations"),
                },
              ].map((action) => (
                <TouchableOpacity
                  key={action.label}
                  style={[
                    styles.actionCircle,
                    { backgroundColor: action.bg },
                    !action.enabled && styles.actionDisabled,
                  ]}
                  disabled={!action.enabled}
                  activeOpacity={0.85}
                  onPress={action.onPress}
                  accessibilityLabel={action.label}
                >
                  <Text style={styles.actionIcon}>{action.icon}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Buyer / Seller radio presentation (read-only) */}
            <View style={styles.buyerSellerRow}>
              <View style={styles.buyerSellerItem}>
                <View
                  style={[
                    styles.radioOuter,
                    isBuyer ? styles.radioOuterActive : styles.radioOuterIdle,
                  ]}
                >
                  {isBuyer ? <View style={styles.radioInner} /> : null}
                </View>
                <Text style={styles.buyerSellerLabel}>Buyer</Text>
              </View>
              <View style={styles.buyerSellerItem}>
                <View
                  style={[
                    styles.radioOuter,
                    isSeller ? styles.radioOuterActive : styles.radioOuterIdle,
                  ]}
                >
                  {isSeller ? <View style={styles.radioInner} /> : null}
                </View>
                <Text style={styles.buyerSellerLabel}>Seller</Text>
              </View>
            </View>

            {tagStyle ? (
              <View style={styles.inquiryTagWrap}>
                <View style={[styles.inquiryTag, { backgroundColor: tagStyle.bg }]}>
                  <Text style={[styles.inquiryTagText, { color: tagStyle.text }]}>
                    {tagStyle.label}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Engagement micro-stats — web shows saves / views / searches.
                DTO has counts.notes / tasks / appointments; engagement metrics absent → 0. */}
            <View style={styles.microStats}>
              <View style={styles.microStat}>
                <Text style={styles.microStatIcon}>♥</Text>
                <Text style={styles.microStatValue}>{lead.counts.notes}</Text>
              </View>
              <View style={styles.microStat}>
                <Text style={styles.microStatIcon}>👁</Text>
                <Text style={styles.microStatValue}>—</Text>
              </View>
              <View style={styles.microStat}>
                <Text style={styles.microStatIcon}>🔍</Text>
                <Text style={styles.microStatValue}>{lead.counts.tasks}</Text>
              </View>
            </View>

            {/* Pipeline banner — functional status selector (read+write) */}
            {banner ? (
              <TouchableOpacity
                style={[
                  styles.pipelineBanner,
                  { backgroundColor: banner.bg },
                  statusPending && { opacity: 0.7 },
                ]}
                activeOpacity={0.9}
                disabled={statusPending}
                onPress={() => setStatusMenuOpen(true)}
              >
                <Text style={styles.pipelineBannerText} numberOfLines={1}>
                  {banner.label} ({pipelineStatusDate(lead.statusChangedAt, lead.createdAt)})
                </Text>
                <Text style={styles.pipelineChevron}>▾</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={styles.assignedText}>
              Assigned to:{" "}
              <Text style={styles.assignedName}>
                {lead.assignedAgent?.name ||
                  lead.assignedAgent?.email ||
                  (lead.isPond ? "Unassigned" : "Unassigned")}
              </Text>
            </Text>

            {/* Inquiry listing context (lightweight substitute for buyerIntent card) */}
            {lead.listingMls || lead.notes ? (
              <View style={styles.lookingForCard}>
                <View style={styles.lookingForHeader}>
                  <Text style={styles.lookingForEyebrow}>INQUIRY CONTEXT</Text>
                </View>
                <View style={styles.lookingForBody}>
                  {lead.listingMls ? (
                    <Text style={styles.lookingForMls}>
                      Inquiry listing · MLS {lead.listingMls}
                    </Text>
                  ) : null}
                  {lead.notes ? (
                    <Text style={styles.lookingForSummary} numberOfLines={4}>
                      {lead.notes}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Last touch / engagement count strip */}
            <View style={styles.touchBox}>
              <View style={styles.touchMetaRow}>
                <Text style={styles.touchMeta}>
                  {relativeAgo(lead.updatedAt)} (Last Touch)
                </Text>
                <Text style={styles.touchMeta}>
                  {relativeAgo(lead.firstRespondedAt || lead.createdAt)} (Created)
                </Text>
              </View>
              <View style={styles.touchCounts}>
                {[
                  ["Views", "—"],
                  ["Saves", "—"],
                  ["Alerts", "—"],
                  ["Emails", "—"],
                ].map(([label, value]) => (
                  <View key={label} style={styles.touchCountItem}>
                    <Text style={styles.touchCountValue}>{value}</Text>
                    <Text style={styles.touchCountLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Email information rings — cosmetic empty until hotness DTO exists */}
            <View style={styles.emailInfoBox}>
              <Text style={styles.emailInfoTitle}>EMAIL INFORMATION</Text>
              <View style={styles.ringRow}>
                <RingStat label="Email Clicks" value={0} tone="#0EA5E9" />
                <RingStat label="Email Opens" value={0} tone="#0284C7" />
                <RingStat label="Alert Opens" value={0} tone="#0369A1" />
              </View>
            </View>
          </View>

          {/* ===== RIGHT COLUMN (tabs + content) ===== */}
          <View
            style={styles.rightColumn}
            onLayout={(e: { nativeEvent: { layout: { y: number } } }) => {
              rightColumnOffsetY.current = e.nativeEvent.layout.y;
            }}
          >
            {/* Note composer — functional */}
            <View style={styles.noteForm}>
              <View style={styles.noteCategoryRow}>
                <View style={styles.noteCategoryGroup}>
                  {(
                    [
                      ["GENERAL", "General"],
                      ["CALL", "Call"],
                    ] as const
                  ).map(([value, label]) => {
                    const active = noteCategory === value;
                    return (
                      <TouchableOpacity
                        key={value}
                        style={[
                          styles.noteCategoryChip,
                          active && styles.noteCategoryChipActive,
                        ]}
                        onPress={() => setNoteCategory(value)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={
                            active
                              ? styles.noteCategoryChipTextActive
                              : styles.noteCategoryChipText
                          }
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  style={[styles.pinChip, notePinned && styles.pinChipActive]}
                  onPress={() => setNotePinned((v) => !v)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.pinChipText, notePinned && styles.pinChipTextActive]}
                  >
                    📌 {notePinned ? "Pinned" : "Pin"}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.noteInputRow}>
                <TextInput
                  style={styles.noteInput}
                  value={noteBody}
                  onChangeText={setNoteBody}
                  placeholder={
                    noteCategory === "CALL" ? "Add a call note..." : "Add a note..."
                  }
                  placeholderTextColor="#94A3B8"
                  editable={!notePending}
                  multiline
                />
                <TouchableOpacity
                  style={[
                    styles.noteSaveBtn,
                    (notePending || !noteBody.trim()) && styles.noteSaveDisabled,
                  ]}
                  disabled={notePending || !noteBody.trim()}
                  onPress={() => void handleSaveNote()}
                  activeOpacity={0.85}
                >
                  <Text style={styles.noteSaveText}>
                    {notePending ? "…" : "Save"}
                  </Text>
                </TouchableOpacity>
              </View>
              {noteMessage ? (
                <Text style={styles.noteMessage}>{noteMessage}</Text>
              ) : null}
            </View>

            {/* Tabs */}
            <View
              onLayout={(e: { nativeEvent: { layout: { y: number } } }) => {
                tabSectionOffsetY.current =
                  rightColumnOffsetY.current + e.nativeEvent.layout.y;
              }}
            >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabBar}
              contentContainerStyle={styles.tabBarContent}
            >
              {TABS.map((item) => {
                const active = tab === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.tabItem}
                    onPress={() => selectTab(item.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                      {item.label}
                    </Text>
                    {active ? <View style={styles.tabUnderline} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.tabBody}>
              {tab === "activity" ? (
                <Panel title="Activity">
                  <Text style={styles.activityIntro}>
                    Day-by-day timeline of alerts, emails, views, and team touches —
                    use chips to focus.
                  </Text>

                  {activities.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.activityChipScroll}
                      contentContainerStyle={styles.activityChipRow}
                    >
                      {ACTIVITY_QUICK_CATEGORIES.map((cat) => {
                        const count = activityCounts[cat.id];
                        if (cat.id !== "all" && count === 0) return null;
                        const active = activityCategory === cat.id;
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            style={[
                              styles.activityChip,
                              active && styles.activityChipActive,
                            ]}
                            onPress={() => setActivityCategory(cat.id)}
                            activeOpacity={0.75}
                          >
                            <Text
                              style={[
                                styles.activityChipLabel,
                                active && styles.activityChipLabelActive,
                              ]}
                            >
                              {cat.label}
                            </Text>
                            <Text
                              style={[
                                styles.activityChipCount,
                                active && styles.activityChipCountActive,
                              ]}
                            >
                              {count}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  ) : null}

                  {activities.length === 0 ? (
                    <View style={styles.emptyTimelineBox}>
                      <Text style={styles.emptyTimeline}>No activity yet.</Text>
                    </View>
                  ) : visibleActivities.length === 0 ? (
                    <View style={styles.emptyTimelineBox}>
                      <Text style={styles.emptyTimeline}>
                        Nothing in this category. Try another chip.
                      </Text>
                    </View>
                  ) : (
                    activityGroups.map((group) => (
                      <View key={group.key} style={styles.dayGroup}>
                        <View style={styles.dayHeadingRow}>
                          <Text style={styles.dayHeading}>{group.label}</Text>
                          <View style={styles.dayHeadingRule} />
                          <Text style={styles.dayHeadingCount}>
                            {group.items.length}
                          </Text>
                        </View>

                        <View style={styles.timelineRail}>
                          {group.items.map((act) => {
                            const meta = activityCategoryMeta(act.type);
                            const isEmailFamily =
                              /EMAIL|SHORTLIST_EMAILED|AGENT_MESSAGE|DIGEST/i.test(
                                act.type,
                              );
                            return (
                              <View
                                key={act.id}
                                style={[
                                  styles.timelineItem,
                                  act.pinned && styles.timelineItemPinned,
                                ]}
                              >
                                <View
                                  style={[
                                    styles.timelineDot,
                                    { backgroundColor: meta.dot },
                                  ]}
                                >
                                  <Text style={styles.timelineDotIcon}>
                                    {meta.icon}
                                  </Text>
                                </View>
                                <View style={styles.timelineContent}>
                                  <View style={styles.timelineChipRow}>
                                    {act.pinned ? (
                                      <View style={styles.pinnedBadge}>
                                        <Text style={styles.pinnedBadgeText}>
                                          📌 Pinned
                                        </Text>
                                      </View>
                                    ) : null}
                                    <View
                                      style={[
                                        styles.activityTypeChip,
                                        {
                                          backgroundColor: meta.chipBg,
                                          borderColor: meta.chipRing,
                                        },
                                      ]}
                                    >
                                      <Text style={styles.activityTypeChipIcon}>
                                        {meta.icon}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.activityTypeChipText,
                                          { color: meta.chipText },
                                        ]}
                                      >
                                        {meta.label}
                                      </Text>
                                    </View>
                                    <Text style={styles.timelineTime}>
                                      {activityTimeLabel(act.createdAt)}
                                    </Text>
                                  </View>

                                  {isEmailFamily ? (
                                    <View style={styles.emailDetailCard}>
                                      <Text style={styles.emailDetailTitle}>
                                        Email activity
                                      </Text>
                                      {act.body ? (
                                        <Text
                                          style={styles.emailDetailBody}
                                          numberOfLines={4}
                                        >
                                          {act.body}
                                        </Text>
                                      ) : (
                                        <Text style={styles.emailDetailBodyMuted}>
                                          {meta.label} ·{" "}
                                          {relativeAgo(act.createdAt)}
                                        </Text>
                                      )}
                                      <View style={styles.emailDetailMetaRow}>
                                        <Text style={styles.emailDetailMeta}>
                                          {act.type.replace(/_/g, " ")}
                                        </Text>
                                        <Text style={styles.emailDetailMeta}>
                                          {relativeAgo(act.createdAt)}
                                        </Text>
                                      </View>
                                    </View>
                                  ) : act.body ? (
                                    <Text
                                      style={styles.timelineBody}
                                      numberOfLines={3}
                                    >
                                      {act.body}
                                    </Text>
                                  ) : null}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    ))
                  )}
                </Panel>
              ) : null}

              {tab === "info" ? (
                <View style={styles.infoCard}>
                  <Text style={styles.infoCardTitle}>Details</Text>
                  <DetailColumn title="Key info">
                    <InfoRow label="First name" value={firstName} />
                    <InfoRow label="Last name" value={lastName} />
                    <InfoRow label="Email" value={email} />
                    <InfoRow label="Phone" value={phone} />
                    <InfoRow label="Address" value={address} />
                    <InfoRow
                      label="Listing"
                      value={lead.listingMls ? lead.listingMls : null}
                    />
                    <InfoRow
                      label="Timeframe"
                      value={purchaseTimeframeLabel(lead.customer?.purchaseTimeframe)}
                    />
                  </DetailColumn>
                  <DetailColumn title="Assignment">
                    <InfoRow
                      label="Agent assigned"
                      value={
                        lead.assignedAgent?.name ||
                        lead.assignedAgent?.email ||
                        (lead.isPond ? "Pond · Unassigned" : null)
                      }
                    />
                    <InfoRow label="Source" value={formatSource(lead.source)} />
                    <InfoRow label="Score" value={String(lead.score)} />
                    <InfoRow label="Hotness" value="—" />
                    <InfoRow label="Campaign" value={lead.utmCampaign} />
                    <InfoRow label="UTM source" value={lead.utmSource} />
                  </DetailColumn>
                  <DetailColumn title="User data">
                    <InfoRow
                      label="Registered"
                      value={new Date(lead.createdAt).toLocaleString("en-CA")}
                    />
                    <InfoRow
                      label="Status changed"
                      value={new Date(lead.statusChangedAt).toLocaleString("en-CA")}
                    />
                    <InfoRow
                      label="First response"
                      value={
                        lead.firstRespondedAt
                          ? new Date(lead.firstRespondedAt).toLocaleString("en-CA")
                          : null
                      }
                    />
                    <InfoRow
                      label="Last touch"
                      value={relativeAgo(lead.updatedAt)}
                    />
                    <InfoRow
                      label="Email & phone consent"
                      value={
                        lead.contactConsentAt
                          ? new Date(lead.contactConsentAt).toLocaleString("en-CA")
                          : null
                      }
                    />
                    <InfoRow label="Win reason" value={lead.winReason} />
                    <InfoRow label="Lost reason" value={lead.lostReason} />
                  </DetailColumn>
                  <View style={styles.countsStrip}>
                    <View style={styles.countsStripItem}>
                      <Text style={styles.countsStripNum}>{lead.counts.notes}</Text>
                      <Text style={styles.countsStripLabel}>Notes</Text>
                    </View>
                    <View style={styles.countsStripItem}>
                      <Text style={styles.countsStripNum}>{lead.counts.tasks}</Text>
                      <Text style={styles.countsStripLabel}>Tasks</Text>
                    </View>
                    <View style={styles.countsStripItem}>
                      <Text style={styles.countsStripNum}>
                        {lead.counts.appointments}
                      </Text>
                      <Text style={styles.countsStripLabel}>Appts</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {tab === "reminders" ? (
                <TasksRemindersTab
                  leadId={leadId}
                  workspaceId={workspaceId}
                  onTaskCountChange={(totalCount) => {
                    setLead((prev) => {
                      if (!prev || prev.counts.tasks === totalCount) return prev;
                      const next = {
                        ...prev,
                        counts: { ...prev.counts, tasks: totalCount },
                      };
                      if (cacheKey) patchLeadDetailCache(cacheKey, next);
                      return next;
                    });
                  }}
                />
              ) : null}

              {tab === "appointments" ? (
                <AppointmentsTab
                  leadId={leadId}
                  workspaceId={workspaceId}
                  onAppointmentCountChange={(totalCount) => {
                    setLead((prev) => {
                      if (!prev || prev.counts.appointments === totalCount) {
                        return prev;
                      }
                      const next = {
                        ...prev,
                        counts: { ...prev.counts, appointments: totalCount },
                      };
                      if (cacheKey) patchLeadDetailCache(cacheKey, next);
                      return next;
                    });
                  }}
                />
              ) : null}

              {tab === "conversations" ? (
                <ComingSoonPanel
                  title="Conversations"
                  hint="Email and SMS threads will appear here in a later stage."
                />
              ) : null}

              {tab === "engagement" ? (
                <ComingSoonPanel
                  title="Engagement"
                  hint="Saved searches, listing views, and matchboard arrive in a later stage."
                />
              ) : null}
            </View>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Pipeline status selector — matches web PipelineStatusMenu list */}
      <Modal
        visible={statusMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusMenuOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setStatusMenuOpen(false)}>
          <View style={styles.statusMenuOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.statusMenuCard}>
                <Text style={styles.statusMenuTitle}>Pipeline status</Text>
                <ScrollView style={styles.statusMenuList}>
                  {PIPELINE_STATUSES.map((s) => {
                    const meta = pipelineBanner(s);
                    const current = lead?.status === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.statusMenuItem,
                          current && styles.statusMenuItemCurrent,
                        ]}
                        disabled={statusPending}
                        onPress={() => void handleSelectStatus(s)}
                        activeOpacity={0.75}
                      >
                        <View
                          style={[styles.statusMenuDot, { backgroundColor: meta.bg }]}
                        />
                        <Text style={styles.statusMenuItemText}>
                          {meta.label}
                          {current
                            ? ` (${pipelineStatusDate(
                                lead!.statusChangedAt,
                                lead!.createdAt,
                              )})`
                            : ""}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const topHeaderPadding =
  Platform.OS === "android" ? Math.max(StatusBar.currentHeight || 0, 42) + 4 : 8;
const bottomPadding = Platform.OS === "android" ? 48 : 24;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF2",
    paddingTop: topHeaderPadding,
    paddingBottom: 10,
    paddingHorizontal: 8,
    backgroundColor: "#FFFFFF",
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  closeBtnText: {
    fontSize: 16,
    color: "#94A3B8",
    fontWeight: "600",
  },
  modalHeaderCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
  },
  modalHeaderLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#94A3B8",
  },
  refreshLink: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2B6CB0",
  },
  refreshLinkDisabled: {
    opacity: 0.4,
  },
  modalHeaderSpacer: {
    width: 72,
  },
  leadNavGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  leadNavBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  leadNavBtnDisabled: {
    opacity: 0.3,
  },
  leadNavChevron: {
    fontSize: 28,
    fontWeight: "600",
    color: "#1E2A38",
    lineHeight: 32,
    marginTop: -2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: bottomPadding,
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
    color: "#94A3B8",
  },
  errorBox: {
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 20,
    width: "100%",
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#B91C1C",
    textAlign: "center",
    marginBottom: 6,
  },
  errorBody: {
    fontSize: 13,
    color: "#991B1B",
    textAlign: "center",
    marginBottom: 14,
  },
  errorActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  retryBtn: {
    backgroundColor: "#1E2A38",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  backBtn: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 13,
  },
  aside: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF2",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    alignItems: "center",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },
  name: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: "700",
    color: "#1E2A38",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  contactStack: {
    marginTop: 12,
    width: "100%",
    gap: 10,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  contactIcon: {
    fontSize: 14,
    width: 20,
    textAlign: "center",
  },
  contactValue: {
    flex: 1,
    fontSize: 13,
    color: "#2B6CB0",
    fontWeight: "500",
  },
  contactValueFlex: {
    flex: 1,
    minWidth: 0,
  },
  contactMuted: {
    color: "#94A3B8",
  },
  contactMultiline: {
    lineHeight: 18,
  },
  contactActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  contactActionIcon: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "700",
  },
  contactBellIcon: {
    fontSize: 13,
  },
  actionRow: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  actionCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionIcon: {
    fontSize: 14,
    color: "#FFFFFF",
  },
  actionHint: {
    marginTop: 6,
    fontSize: 10,
    color: "#94A3B8",
    fontStyle: "italic",
  },
  buyerSellerRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 28,
  },
  buyerSellerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: {
    borderColor: "#0D9488",
  },
  radioOuterIdle: {
    borderColor: "#CBD5E1",
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0D9488",
  },
  buyerSellerLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1E2A38",
  },
  inquiryTagWrap: {
    marginTop: 12,
  },
  inquiryTag: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  inquiryTagText: {
    fontSize: 11,
    fontWeight: "700",
  },
  microStats: {
    marginTop: 16,
    flexDirection: "row",
    gap: 28,
  },
  microStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  microStatIcon: {
    fontSize: 14,
    color: "#64748B",
  },
  microStatValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  pipelineBanner: {
    marginTop: 16,
    width: "100%",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pipelineBannerText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  pipelineChevron: {
    color: "#FFFFFF",
    fontSize: 12,
    opacity: 0.9,
  },
  assignedText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "500",
    color: "#1E2A38",
    textAlign: "center",
  },
  assignedName: {
    fontWeight: "700",
  },
  lookingForCard: {
    marginTop: 12,
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C7E0D4",
    backgroundColor: "#F3FAF6",
    overflow: "hidden",
  },
  lookingForHeader: {
    borderBottomWidth: 1,
    borderBottomColor: "#D8EBE2",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  lookingForEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "#0F766E",
  },
  lookingForBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  lookingForMls: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 4,
  },
  lookingForSummary: {
    fontSize: 12.5,
    lineHeight: 18,
    color: "#334155",
  },
  touchBox: {
    marginTop: 12,
    width: "100%",
    borderRadius: 8,
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  touchMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  touchMeta: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0369A1",
  },
  touchCounts: {
    flexDirection: "row",
  },
  touchCountItem: {
    flex: 1,
    alignItems: "center",
  },
  touchCountValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0C4A6E",
  },
  touchCountLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0284C7",
    marginTop: 2,
  },
  emailInfoBox: {
    marginTop: 12,
    width: "100%",
    borderRadius: 8,
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  emailInfoTitle: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#0369A1",
    marginBottom: 12,
  },
  ringRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  ringStat: {
    flex: 1,
    alignItems: "center",
  },
  ringOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#BAE6FD",
  },
  ringInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  ringPct: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0C4A6E",
  },
  ringLabel: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "600",
    color: "#0369A1",
    textAlign: "center",
    maxWidth: 72,
  },
  rightColumn: {
    backgroundColor: "#F7F9FB",
    minHeight: 320,
  },
  noteForm: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF2",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  noteCategoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  noteCategoryGroup: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#D8DEE6",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 2,
  },
  noteCategoryChip: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  noteCategoryChipActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  noteCategoryChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  noteCategoryChipTextActive: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1E2A38",
  },
  pinChip: {
    borderWidth: 1,
    borderColor: "#D8DEE6",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pinChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  noteInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  noteInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#1E2A38",
    maxHeight: 88,
  },
  noteSaveBtn: {
    backgroundColor: "#1E2A38",
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
    minHeight: 40,
  },
  noteSaveDisabled: {
    opacity: 0.4,
  },
  noteSaveText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  noteMessage: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  pinChipActive: {
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
  },
  pinChipTextActive: {
    color: "#92400E",
    fontWeight: "700",
  },
  timelineItemPinned: {
    backgroundColor: "rgba(255, 251, 235, 0.85)",
    borderRadius: 10,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  pinnedBadge: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pinnedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#92400E",
  },
  statusMenuOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  statusMenuCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    maxHeight: "70%",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  statusMenuTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#64748B",
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  statusMenuList: {
    paddingBottom: 8,
  },
  statusMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusMenuItemCurrent: {
    backgroundColor: "#F8FAFC",
  },
  statusMenuDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusMenuItemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  tabBar: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF2",
    maxHeight: 44,
  },
  tabBarContent: {
    paddingHorizontal: 8,
    alignItems: "center",
  },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: "relative",
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  tabLabelActive: {
    color: "#2B6CB0",
  },
  tabUnderline: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 0,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#2B6CB0",
  },
  tabBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
  },
  panel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E2A38",
    marginBottom: 12,
  },
  activityIntro: {
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
    marginBottom: 12,
  },
  activityChipScroll: {
    marginBottom: 12,
    maxHeight: 40,
  },
  activityChipRow: {
    gap: 6,
    paddingVertical: 2,
  },
  activityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  activityChipActive: {
    backgroundColor: "#0F172A",
    borderColor: "#0F172A",
  },
  activityChipLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  activityChipLabelActive: {
    color: "#FFFFFF",
  },
  activityChipCount: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94A3B8",
  },
  activityChipCountActive: {
    color: "rgba(255,255,255,0.7)",
  },
  dayGroup: {
    marginBottom: 18,
  },
  dayHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  dayHeading: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#64748B",
  },
  dayHeadingRule: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  dayHeadingCount: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
  },
  timelineRail: {
    borderLeftWidth: 1,
    borderLeftColor: "#E2E8F0",
    marginLeft: 12,
    paddingLeft: 20,
  },
  timelineItem: {
    position: "relative",
    paddingBottom: 16,
  },
  timelineDot: {
    position: "absolute",
    left: -32,
    top: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  timelineDotIcon: {
    fontSize: 10,
  },
  timelineContent: {
    flex: 1,
  },
  timelineChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  activityTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  activityTypeChipIcon: {
    fontSize: 12,
  },
  activityTypeChipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  timelineTime: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  timelineBody: {
    marginTop: 6,
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
  },
  emailDetailCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  emailDetailTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#1E40AF",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  emailDetailBody: {
    fontSize: 13,
    fontWeight: "500",
    color: "#0F172A",
    lineHeight: 18,
  },
  emailDetailBodyMuted: {
    fontSize: 12,
    color: "#64748B",
  },
  emailDetailMetaRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  emailDetailMeta: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    textTransform: "capitalize",
  },
  emptyTimelineBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D8DEE6",
    backgroundColor: "#F8FAFC",
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  emptyTimeline: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
  },
  comingSoonBox: {
    paddingVertical: 20,
    alignItems: "center",
  },
  comingSoonText: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
  },
  comingSoonSub: {
    marginTop: 8,
    fontSize: 11,
    color: "#94A3B8",
    fontStyle: "italic",
  },
  infoCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E2A38",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
    paddingBottom: 8,
    marginBottom: 12,
  },
  detailColumn: {
    marginBottom: 18,
  },
  detailColumnTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#64748B",
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 5,
  },
  infoLabel: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 13,
    color: "#1E2A38",
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
  },
  countsStrip: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
    paddingTop: 12,
    marginTop: 4,
  },
  countsStripItem: {
    flex: 1,
    alignItems: "center",
  },
  countsStripNum: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1E2A38",
  },
  countsStripLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },
});
