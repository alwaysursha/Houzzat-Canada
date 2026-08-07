"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BellRing,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Mail,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Phone,
  PhoneCall,
  Pin,
  Search,
  X,
} from "lucide-react";
import { CrmTimeline } from "@/components/agent/CrmTimeline";
import { HandoffClient } from "@/components/agent/HandoffClient";
import { LeadActions } from "@/components/agent/LeadActions";
import { LeadAccountVerifyMenu } from "@/components/agent/LeadAccountVerifyMenu";
import { PipelineStatusMenu } from "@/components/agent/PipelineStatusMenu";
import { EngagementMatchboard } from "@/components/agent/EngagementMatchboard";
import { ActivityFilters } from "@/components/agent/ActivityFilters";
import { LeadEmailForm } from "@/components/agent/LeadEmailForm";
import { SavedSearchEditor } from "@/components/agent/SavedSearchEditor";
import { TaskForm } from "@/components/agent/TaskForm";
import {
  buyerIntentToSearchHref,
  hasUsableSearchCriteria,
} from "@/lib/agent/intent-to-search";
import {
  ALL_ACTIVITY_FILTER_IDS,
  DEFAULT_ACTIVITY_FILTER_IDS,
  filterIdsForTimelineType,
  timelineItemMatchesFilters,
} from "@/lib/agent/activity-filters";
import { ReassignSelect } from "@/components/agent/TeamAdminClient";
import type { TimelineItem } from "@/lib/agent/customer-timeline";
import {
  INQUIRY_TAG_LABEL,
  INQUIRY_TAG_STYLE,
} from "@/lib/agent/inquiry-tag";
import type { LeadSummary } from "@/lib/agent/lead-summary";
import {
  PURCHASE_TIMEFRAMES,
  purchaseTimeframeLabel,
  type PurchaseTimeframeValue,
} from "@/lib/agent/timeframe";
import { cn } from "@/lib/utils";

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
  { id: "reminders", label: "Reminders+Plans" },
  { id: "appointments", label: "Appointments" },
  { id: "conversations", label: "Conversations" },
  { id: "engagement", label: "Engagement" },
];

function relativeAgo(iso: string | null) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(0, mins)} Min Ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} Hour${hours === 1 ? "" : "s"} Ago`;
  const days = Math.floor(hours / 24);
  return `${days} Day${days === 1 ? "" : "s"} Ago`;
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
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <div
        className="relative flex size-14 shrink-0 items-center justify-center rounded-full sm:size-16"
        style={{
          background: `conic-gradient(${tone} ${pct * 3.6}deg, #dbeafe 0deg)`,
        }}
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-[#e0f2fe] text-[11px] font-bold tabular-nums text-[#0c4a6e] sm:size-12 sm:text-[12px]">
          {pct}%
        </div>
      </div>
      <p className="max-w-[4.5rem] text-center text-[10px] font-semibold leading-tight text-[#0369a1]">
        {label}
      </p>
    </div>
  );
}

function ContactDisplayRow({
  icon: Icon,
  value,
  href,
  canEdit,
  onEdit,
  editLabel,
  updateRequested,
  canRequestUpdate,
  onRequestUpdate,
  requestLabel,
  requestPending,
  multiline = false,
}: {
  icon: typeof Phone;
  value: string | null | undefined;
  href?: string;
  canEdit: boolean;
  onEdit: () => void;
  editLabel: string;
  updateRequested?: boolean;
  canRequestUpdate?: boolean;
  onRequestUpdate?: () => void;
  requestLabel?: string;
  requestPending?: boolean;
  multiline?: boolean;
}) {
  const valueClass = multiline
    ? "min-w-0 break-words leading-snug"
    : "min-w-0 truncate";

  return (
    <div className="w-full min-w-0">
      <div className="flex w-full min-w-0 items-center gap-1.5">
        {href && value ? (
          <a
            href={href}
            target={multiline ? "_blank" : undefined}
            rel={multiline ? "noopener noreferrer" : undefined}
            className={cn(
              "flex min-w-0 text-[13px] text-[#2b6cb0] hover:underline",
              multiline ? "items-start gap-1.5" : "items-center gap-1.5",
              updateRequested ? "max-w-[40%]" : "flex-1",
            )}
          >
            <Icon className="mt-0.5 size-3.5 shrink-0" />
            <span className={valueClass}>{value}</span>
          </a>
        ) : (
          <span
            className={cn(
              "flex min-w-0 text-[13px] text-[#94a3b8]",
              multiline ? "items-start gap-1.5" : "items-center gap-1.5",
              updateRequested ? "shrink-0" : "flex-1",
            )}
          >
            <Icon className="mt-0.5 size-3.5 shrink-0" />
            <span className={valueClass}>{value || "N/A"}</span>
          </span>
        )}
        {updateRequested ? (
          <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-wide text-amber-800">
            Update requested
          </span>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={editLabel}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#1e2a38]"
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
        {canRequestUpdate && onRequestUpdate ? (
          <button
            type="button"
            onClick={onRequestUpdate}
            disabled={requestPending}
            aria-label={requestLabel ?? "Request update"}
            title={
              updateRequested
                ? "Update already requested"
                : (requestLabel ?? "Request update")
            }
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md transition disabled:opacity-50",
              updateRequested
                ? "bg-amber-100 text-amber-800"
                : "text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e2a38]",
            )}
          >
            <BellRing className="size-3.5" />
            {updateRequested ? (
              <span className="sr-only">Update requested</span>
            ) : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ContactEditRow({
  type,
  value,
  pending,
  onChange,
  onSave,
  onCancel,
}: {
  type: "tel" | "email" | "text";
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const placeholder =
    type === "tel"
      ? "Phone number"
      : type === "email"
        ? "Email address"
        : "Home address";

  return (
    <div className="flex items-center gap-1">
      <input
        type={type}
        value={value}
        autoFocus
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-[#cbd5e1] px-2 py-1 text-[13px] text-[#1e2a38] outline-none focus:border-[#0d9488]"
        placeholder={placeholder}
      />
      <button
        type="button"
        disabled={pending || (type === "email" && !value.trim())}
        onClick={onSave}
        aria-label="Save"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-[#0d9488] text-white disabled:opacity-50"
      >
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onCancel}
        aria-label="Cancel"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[#64748b] hover:bg-[#f1f5f9]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-[#eef2f6] py-2 text-[13px] last:border-0 xl:grid-cols-[132px_1fr]">
      <dt className="font-medium text-[#94a3b8]">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-[#1e2a38]">
        {value || "—"}
      </dd>
    </div>
  );
}

function DetailColumn({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h4 className="mb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-[#64748b]">
        {title}
      </h4>
      <dl>{children}</dl>
    </div>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-[#e2e8f0] bg-white px-4 py-3",
        className,
      )}
    >
      <h3 className="mb-3 text-[13px] font-bold text-[#1e2a38]">{title}</h3>
      {children}
    </section>
  );
}

export function CustomerProfile({
  leadId,
  variant = "page",
  onClose,
  onNavigateLead,
  leadIds,
  initialData,
}: {
  leadId: string;
  variant?: "page" | "modal";
  onClose?: () => void;
  /** Jump to another lead in the current list (popup). */
  onNavigateLead?: (leadId: string) => void;
  leadIds?: string[];
  initialData?: LeadSummary | null;
}) {
  const [data, setData] = useState<LeadSummary | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("info");
  const [noteBody, setNoteBody] = useState("");
  const [noteCategory, setNoteCategory] = useState<"GENERAL" | "CALL">(
    "GENERAL",
  );
  const [notePinned, setNotePinned] = useState(false);
  const [notePending, setNotePending] = useState(false);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);
  const [pinPendingId, setPinPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialData);
  const [editingContact, setEditingContact] = useState<
    "phone" | "email" | "address" | null
  >(null);
  const [contactDraft, setContactDraft] = useState("");
  const [contactPending, setContactPending] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [reminderPending, setReminderPending] = useState<
    "phone" | "email" | null
  >(null);
  const [profileFlagPending, setProfileFlagPending] = useState<
    "buyer" | "seller" | "timeframe" | null
  >(null);
  const [activityFilters, setActivityFilters] = useState(
    () => new Set(DEFAULT_ACTIVITY_FILTER_IDS),
  );

  const reload = useCallback(async () => {
    const res = await fetch(`/api/agent/leads/${leadId}/summary`);
    const json = (await res.json()) as LeadSummary & { error?: string };
    if (!res.ok) throw new Error(json.error || "Failed to load");
    setData(json);
    return json;
  }, [leadId]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!initialData) setLoading(true);
    fetch(`/api/agent/leads/${leadId}/summary`)
      .then(async (res) => {
        const json = (await res.json()) as LeadSummary & { error?: string };
        if (!res.ok) throw new Error(json.error || "Failed to load");
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [leadId, initialData]);

  const onUpdated = useCallback(() => {
    void reload().catch(() => undefined);
  }, [reload]);

  async function toggleProfileFlag(flag: "buyer" | "seller") {
    if (!data?.lead.customer || profileFlagPending) return;
    const next =
      flag === "buyer"
        ? !data.lead.customer.isBuyer
        : !data.lead.customer.isSeller;
    setProfileFlagPending(flag);
    setData((prev) => {
      if (!prev?.lead.customer) return prev;
      return {
        ...prev,
        lead: {
          ...prev.lead,
          customer: {
            ...prev.lead.customer,
            isBuyer: flag === "buyer" ? next : prev.lead.customer.isBuyer,
            isSeller: flag === "seller" ? next : prev.lead.customer.isSeller,
          },
        },
      };
    });
    try {
      const res = await fetch("/api/agent/leads/profile-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          ...(flag === "buyer" ? { isBuyer: next } : { isSeller: next }),
        }),
      });
      if (!res.ok) {
        await reload().catch(() => undefined);
        return;
      }
      onUpdated();
    } catch {
      await reload().catch(() => undefined);
    } finally {
      setProfileFlagPending(null);
    }
  }

  async function setPurchaseTimeframe(
    next: PurchaseTimeframeValue | null,
  ) {
    if (!data?.lead.customer || profileFlagPending) return;
    setProfileFlagPending("timeframe");
    setData((prev) => {
      if (!prev?.lead.customer) return prev;
      return {
        ...prev,
        lead: {
          ...prev.lead,
          customer: {
            ...prev.lead.customer,
            purchaseTimeframe: next,
          },
        },
      };
    });
    try {
      const res = await fetch("/api/agent/leads/profile-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          purchaseTimeframe: next,
        }),
      });
      if (!res.ok) {
        await reload().catch(() => undefined);
        return;
      }
      onUpdated();
    } catch {
      await reload().catch(() => undefined);
    } finally {
      setProfileFlagPending(null);
    }
  }

  const timelineItems = useMemo(
    () =>
      (data?.timeline ?? []).map(
        (item): TimelineItem => ({
          ...item,
          source: item.source as TimelineItem["source"],
          createdAt: new Date(item.createdAt),
          pinnedAt: item.pinnedAt ? new Date(item.pinnedAt) : null,
        }),
      ),
    [data?.timeline],
  );

  const activityFilterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of ALL_ACTIVITY_FILTER_IDS) counts[id] = 0;
    for (const item of timelineItems) {
      for (const id of filterIdsForTimelineType(item.type)) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
    return counts;
  }, [timelineItems]);

  const filteredTimelineItems = useMemo(
    () =>
      timelineItems.filter((item) =>
        timelineItemMatchesFilters(item.type, activityFilters),
      ),
    [timelineItems, activityFilters],
  );

  function startEditContact(field: "phone" | "email" | "address") {
    const customer = data?.lead.customer;
    setEditingContact(field);
    setContactDraft(
      field === "phone"
        ? (customer?.phone ?? "")
        : field === "email"
          ? (customer?.email ?? "")
          : (customer?.homeAddress ?? ""),
    );
    setContactError(null);
  }

  function cancelEditContact() {
    setEditingContact(null);
    setContactDraft("");
    setContactError(null);
  }

  async function saveContact() {
    if (!editingContact || !data?.lead.customer) return;
    setContactPending(true);
    setContactError(null);
    try {
      const trimmed = contactDraft.trim();
      const payload =
        editingContact === "phone"
          ? { leadId, phone: trimmed }
          : editingContact === "email"
            ? { leadId, email: trimmed }
            : { leadId, address: trimmed };
      const res = await fetch("/api/agent/leads/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not update contact");
      await reload();
      cancelEditContact();
    } catch (err) {
      setContactError(
        err instanceof Error ? err.message : "Could not update contact",
      );
    } finally {
      setContactPending(false);
    }
  }

  async function requestContactUpdate(channel: "phone" | "email") {
    if (!data?.lead.customer) return;
    setReminderPending(channel);
    setContactError(null);
    try {
      const res = await fetch("/api/agent/leads/contact-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, channel }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not request update");
      await reload();
    } catch (err) {
      setContactError(
        err instanceof Error ? err.message : "Could not request update",
      );
    } finally {
      setReminderPending(null);
    }
  }

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    if (!noteBody.trim()) return;
    setNotePending(true);
    setNoteMessage(null);
    try {
      const res = await fetch("/api/agent/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          body: noteBody.trim(),
          category: noteCategory,
          pinned: notePinned,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || "Could not save note");
      }
      setNoteBody("");
      setNotePinned(false);
      setNoteMessage(
        notePinned
          ? `${noteCategory === "CALL" ? "Call" : "General"} note pinned`
          : `${noteCategory === "CALL" ? "Call" : "General"} note saved`,
      );
      await reload();
      setTimeout(() => setNoteMessage(null), 2000);
    } catch (err) {
      setNoteMessage(err instanceof Error ? err.message : "Could not save note");
    } finally {
      setNotePending(false);
    }
  }

  async function toggleNotePin(noteId: string, pinned: boolean) {
    if (pinPendingId) return;
    setPinPendingId(noteId);
    try {
      const res = await fetch("/api/agent/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, pinned }),
      });
      if (!res.ok) return;
      await reload();
    } finally {
      setPinPendingId(null);
    }
  }

  const name =
    data?.lead.customer?.name ||
    data?.lead.customer?.email ||
    data?.lead.source.replaceAll("_", " ") ||
    "Lead";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const phone = data?.lead.customer?.phone;
  const email = data?.lead.customer?.email;
  const address = data?.lead.customer?.homeAddress;
  const openRate = data
    ? Math.min(100, data.stats.emails > 0 ? data.hot.hotness : 0)
    : 0;
  const clickRate = data
    ? Math.min(100, Math.round(data.hot.views24h * 6 + data.stats.saves * 10))
    : 0;
  const alertRate = data
    ? Math.min(100, data.stats.alerts > 0 ? 40 + data.stats.alerts * 8 : 0)
    : 0;

  type ActionItem = {
    icon: typeof Phone;
    href?: string;
    className: string;
    label: string;
    onClick?: () => void;
  };

  const actions: ActionItem[] = [
    {
      icon: Phone,
      href: phone ? `tel:${phone}` : undefined,
      className: "bg-[#0d9488]",
      label: "Call",
    },
    {
      icon: PhoneCall,
      href: phone ? `tel:${phone}` : undefined,
      className: "bg-[#14b8a6]",
      label: "Dial",
    },
    {
      icon: MessageSquare,
      href: phone ? `sms:${phone}` : undefined,
      className: "bg-[#0ea5e9]",
      label: "Text",
    },
    {
      icon: Mail,
      href: email ? `mailto:${email}` : undefined,
      className: "bg-[#38bdf8]",
      label: "Email",
    },
    {
      icon: MoreHorizontal,
      className: "bg-[#64748b]",
      label: "More",
      onClick: () => setTab("conversations"),
    },
  ];

  function renderAction(action: ActionItem, size: "rail" | "inline") {
    const Icon = action.icon;
    const className = cn(
      "flex items-center justify-center rounded-full text-white shadow-md transition hover:scale-105",
      size === "rail" ? "size-11" : "size-10",
      action.className,
      !action.href && !action.onClick && "pointer-events-none opacity-40",
    );
    if (action.href) {
      if (action.href.startsWith("/")) {
        return (
          <Link
            key={action.label}
            href={action.href}
            className={className}
            title={action.label}
            aria-label={action.label}
          >
            <Icon className="size-4" />
          </Link>
        );
      }
      return (
        <a
          key={action.label}
          href={action.href}
          className={className}
          title={action.label}
          aria-label={action.label}
        >
          <Icon className="size-4" />
        </a>
      );
    }
    if (action.onClick) {
      return (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className={className}
          title={action.label}
          aria-label={action.label}
        >
          <Icon className="size-4" />
        </button>
      );
    }
    return (
      <span key={action.label} className={className} title={action.label}>
        <Icon className="size-4" />
      </span>
    );
  }

  const shellClass =
    variant === "modal"
      ? "flex h-full max-h-none w-full max-w-[1280px] flex-col overflow-hidden rounded-none border-0 bg-white shadow-none sm:max-h-[min(960px,96vh)] sm:rounded-xl sm:border sm:border-[#c9d2dc] sm:shadow-[0_24px_70px_rgb(15_23_42/0.35)]"
      : "flex h-full min-h-0 w-full flex-col overflow-hidden bg-white";

  const navIndex =
    leadIds && leadIds.length > 1 ? leadIds.indexOf(leadId) : -1;
  const prevLeadId =
    navIndex > 0 ? leadIds![navIndex - 1]! : null;
  const nextLeadId =
    navIndex >= 0 && navIndex < (leadIds?.length ?? 0) - 1
      ? leadIds![navIndex + 1]!
      : null;
  const showLeadNav =
    Boolean(onNavigateLead) && navIndex >= 0 && (leadIds?.length ?? 0) > 1;

  return (
    <div
      className={cn(
        "relative w-full",
        variant === "modal" && "flex h-full items-stretch",
        variant === "page" &&
          "h-[calc(100dvh-7.25rem-env(safe-area-inset-bottom))] lg:h-dvh",
      )}
    >
      {variant === "modal" ? (
        <div className="absolute -left-1 top-24 z-20 hidden flex-col gap-2 sm:flex md:-left-3">
          {actions.map((action) => renderAction(action, "rail"))}
        </div>
      ) : null}

      <div role="region" aria-label={name} className={shellClass}>
        {variant === "modal" ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-[#e8edf2] px-2 py-2 sm:px-4">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#1e2a38]"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            ) : (
              <span className="size-8" />
            )}

            <p className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-[#94a3b8]">
              Lead profile
            </p>

            {showLeadNav ? (
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  disabled={!prevLeadId}
                  onClick={() => prevLeadId && onNavigateLead?.(prevLeadId)}
                  className="rounded-md p-1.5 text-[#1e2a38] transition hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Previous lead"
                >
                  <ChevronLeft className="size-6" strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  disabled={!nextLeadId}
                  onClick={() => nextLeadId && onNavigateLead?.(nextLeadId)}
                  className="rounded-md p-1.5 text-[#1e2a38] transition hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Next lead"
                >
                  <ChevronRight className="size-6" strokeWidth={2.25} />
                </button>
              </div>
            ) : (
              <span className="size-8 shrink-0" aria-hidden />
            )}
          </div>
        ) : null}

        {error ? (
          <p className="m-6 rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
            {error}
          </p>
        ) : loading || !data ? (
          <p className="py-16 text-center text-sm text-[#94a3b8]">
            Loading profile…
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[380px_minmax(0,1fr)]">
            <aside className="shrink-0 border-b border-[#e8edf2] bg-white px-4 py-3 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5 lg:py-4">
              {variant === "page" ? (
                <Link
                  href="/agent/leads"
                  className="mb-3 inline-flex text-[12px] font-semibold text-[#2b6cb0] hover:underline"
                >
                  ← Leads
                </Link>
              ) : null}
              <div className="flex flex-col items-stretch text-left lg:items-center lg:text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#334155] text-xl font-bold text-white sm:size-[72px]">
                  {initials || "?"}
                </div>
                <div className="relative z-10 mt-3 flex max-w-full items-center justify-center gap-1.5 px-1">
                  <h2 className="min-w-0 break-words text-center text-[22px] font-bold leading-tight text-[#1e2a38] sm:text-[26px]">
                    {name}
                  </h2>
                  {data.lead.customer ? (
                    <LeadAccountVerifyMenu
                      leadId={leadId}
                      emailVerified={Boolean(data.lead.customer.emailVerified)}
                      accountCreatedAt={data.lead.customer.createdAt}
                      onUpdated={onUpdated}
                    />
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                  {data.hot.isOnline ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      ONLINE
                    </span>
                  ) : null}
                  {data.hot.binge ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                      BINGE · {data.hot.distinctListings24h} homes
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex w-full min-w-0 flex-col items-stretch gap-2.5 px-0">
                  {editingContact === "phone" ? (
                    <ContactEditRow
                      type="tel"
                      value={contactDraft}
                      pending={contactPending}
                      onChange={setContactDraft}
                      onSave={() => void saveContact()}
                      onCancel={cancelEditContact}
                    />
                  ) : (
                    <ContactDisplayRow
                      icon={Phone}
                      value={phone}
                      href={phone ? `tel:${phone}` : undefined}
                      canEdit={Boolean(data.lead.customer)}
                      onEdit={() => startEditContact("phone")}
                      editLabel="Edit phone"
                      updateRequested={Boolean(
                        data.lead.customer?.phoneUpdateRequestedAt,
                      )}
                      canRequestUpdate={Boolean(data.lead.customer)}
                      onRequestUpdate={() =>
                        void requestContactUpdate("phone")
                      }
                      requestLabel="Request phone update on next visit"
                      requestPending={reminderPending === "phone"}
                    />
                  )}
                  {editingContact === "email" ? (
                    <ContactEditRow
                      type="email"
                      value={contactDraft}
                      pending={contactPending}
                      onChange={setContactDraft}
                      onSave={() => void saveContact()}
                      onCancel={cancelEditContact}
                    />
                  ) : (
                    <ContactDisplayRow
                      icon={Mail}
                      value={email}
                      href={email ? `mailto:${email}` : undefined}
                      canEdit={Boolean(data.lead.customer)}
                      onEdit={() => startEditContact("email")}
                      editLabel="Edit email"
                      updateRequested={Boolean(
                        data.lead.customer?.emailUpdateRequestedAt,
                      )}
                      canRequestUpdate={Boolean(data.lead.customer)}
                      onRequestUpdate={() =>
                        void requestContactUpdate("email")
                      }
                      requestLabel="Request email update on next visit"
                      requestPending={reminderPending === "email"}
                    />
                  )}
                  {editingContact === "address" ? (
                    <ContactEditRow
                      type="text"
                      value={contactDraft}
                      pending={contactPending}
                      onChange={setContactDraft}
                      onSave={() => void saveContact()}
                      onCancel={cancelEditContact}
                    />
                  ) : (
                    <ContactDisplayRow
                      icon={MapPin}
                      value={address}
                      href={
                        address
                          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
                          : undefined
                      }
                      canEdit={Boolean(data.lead.customer)}
                      onEdit={() => startEditContact("address")}
                      editLabel="Edit address"
                      multiline
                    />
                  )}
                  {contactError ? (
                    <p className="text-center text-[11px] text-red-600">
                      {contactError}
                    </p>
                  ) : null}
                </div>
              </div>

              {variant === "page" ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  {actions.map((action) => renderAction(action, "inline"))}
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-medium text-[#1e2a38]">
                <button
                  type="button"
                  disabled={!data.lead.customer || profileFlagPending !== null}
                  aria-pressed={Boolean(data.lead.customer?.isBuyer)}
                  aria-label={
                    data.lead.customer?.isBuyer
                      ? "Deactivate buyer profile"
                      : "Activate buyer profile"
                  }
                  title={
                    data.lead.customer?.isBuyer
                      ? "Buyer profile active — click to deactivate"
                      : "Buyer profile inactive — click to activate"
                  }
                  onClick={() => void toggleProfileFlag("buyer")}
                  className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-[#f1f5f9] disabled:cursor-default disabled:opacity-50"
                >
                  <span
                    className={cn(
                      "inline-flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                      data.lead.customer?.isBuyer
                        ? "border-[#0d9488] bg-white"
                        : "border-[#cbd5e1] bg-white",
                    )}
                  >
                    {data.lead.customer?.isBuyer ? (
                      <span className="size-2 rounded-full bg-[#0d9488]" />
                    ) : null}
                  </span>
                  Buyer
                </button>
                <button
                  type="button"
                  disabled={!data.lead.customer || profileFlagPending !== null}
                  aria-pressed={Boolean(data.lead.customer?.isSeller)}
                  aria-label={
                    data.lead.customer?.isSeller
                      ? "Deactivate seller profile"
                      : "Activate seller profile"
                  }
                  title={
                    data.lead.customer?.isSeller
                      ? "Seller profile active — click to deactivate"
                      : "Seller profile inactive — click to activate"
                  }
                  onClick={() => void toggleProfileFlag("seller")}
                  className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-[#f1f5f9] disabled:cursor-default disabled:opacity-50"
                >
                  <span
                    className={cn(
                      "inline-flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                      data.lead.customer?.isSeller
                        ? "border-[#0d9488] bg-white"
                        : "border-[#cbd5e1] bg-white",
                    )}
                  >
                    {data.lead.customer?.isSeller ? (
                      <span className="size-2 rounded-full bg-[#0d9488]" />
                    ) : null}
                  </span>
                  Seller
                </button>
              </div>

              {data.lead.inquiryTag ? (
                <div className="mt-3 flex justify-center">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-bold",
                      INQUIRY_TAG_STYLE[data.lead.inquiryTag].soft,
                    )}
                  >
                    {INQUIRY_TAG_LABEL[data.lead.inquiryTag]}
                  </span>
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-center gap-5 text-[#64748b]">
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold">
                  <Heart className="size-4 text-[#e11d48]" />
                  {data.stats.saves}
                </span>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold">
                  <Eye className="size-4" />
                  {data.hot.views24h}
                </span>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold">
                  <Search className="size-4" />
                  {data.savedSearches.length}
                </span>
              </div>

              <PipelineStatusMenu
                className="mt-4"
                leadId={leadId}
                status={data.lead.status}
                statusChangedAt={data.lead.statusChangedAt}
                createdAt={data.lead.createdAt}
                onUpdated={onUpdated}
              />

              {data.permissions.canClaim ? (
                <div className="mt-3 flex justify-center">
                  <LeadActions
                    leadId={leadId}
                    status={data.lead.status}
                    canClaim
                    onUpdated={onUpdated}
                  />
                </div>
              ) : null}

              {data.permissions.canAssignLeads ? (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[12px] text-[#64748b]">
                  <span className="font-semibold text-[#475569]">Assign</span>
                  <ReassignSelect
                    leadId={leadId}
                    members={data.teamMembers}
                    currentId={data.lead.assignedAgentId}
                    onUpdated={onUpdated}
                  />
                </div>
              ) : (
                <p className="mt-3 text-center text-[13px] font-medium text-[#1e2a38]">
                  Assigned to:{" "}
                  <span className="font-semibold">
                    {data.lead.assignedAgent?.name ||
                      data.lead.assignedAgent?.email ||
                      "Unassigned"}
                  </span>
                </p>
              )}

              {data.buyerIntent ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-[#c7e0d4] bg-[linear-gradient(165deg,#f3faf6_0%,#ffffff_55%)] text-left shadow-[0_1px_0_rgb(15_118_90/0.06)]">
                  <div className="flex items-start justify-between gap-2 border-b border-[#d8ebe2] px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0f766e]">
                        Looking for
                      </p>
                      {data.buyerIntent.headline ? (
                        <p className="mt-0.5 truncate text-[13px] font-semibold text-[#134e4a]">
                          {data.buyerIntent.headline}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        data.buyerIntent.source === "saved"
                          ? "bg-[#0f766e]/12 text-[#0f766e]"
                          : data.buyerIntent.source === "thin"
                            ? "bg-[#f1f5f9] text-[#64748b]"
                            : "bg-[#ecfdf5] text-[#047857]",
                      )}
                    >
                      {data.buyerIntent.sourceLabel}
                    </span>
                  </div>
                  <div className="px-3.5 py-3">
                    <p className="text-[12.5px] leading-relaxed text-[#334155]">
                      {data.buyerIntent.summary}
                    </p>
                    {data.buyerIntent.chips.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {data.buyerIntent.chips.map((chip) => (
                          <span
                            key={chip}
                            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0f766e] ring-1 ring-[#c7e0d4]"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {data.lead.listingMls ? (
                      <p className="mt-2 text-[11px] font-medium text-[#64748b]">
                        Inquiry listing · MLS {data.lead.listingMls}
                      </p>
                    ) : null}
                    {hasUsableSearchCriteria(data.buyerIntent.criteria) ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={buyerIntentToSearchHref(data.buyerIntent.criteria)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg bg-[#0f766e] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0d9488]"
                        >
                          View matching homes
                        </Link>
                        <button
                          type="button"
                          onClick={() => setTab("engagement")}
                          className="rounded-lg border border-[#c7e0d4] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0f766e] hover:bg-[#f0fdf4]"
                        >
                          Shortlist & email
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {data.nextReminder ? (
                <div className="mt-3 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-left text-[12px]">
                  <p className="font-semibold text-[#92400e]">Next reminder</p>
                  <p className="text-[#78350f]">{data.nextReminder.title}</p>
                  <p className="text-[#a16207]">
                    {new Date(data.nextReminder.dueAt).toLocaleString("en-CA", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ) : null}

              <div className="mt-3 rounded-md bg-[#e0f2fe] px-3 py-3">
                <div className="mb-3 flex flex-wrap justify-between gap-2 text-[11px] font-semibold text-[#0369a1]">
                  <span>{relativeAgo(data.lastTouchAt)} (Last Touch)</span>
                  <span>
                    {relativeAgo(data.hot.lastSeenAt)} (Last Visit)
                    {data.hot.isOnline ? " · Online" : ""}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  {[
                    ["Views", data.hot.views24h],
                    ["Saves", data.stats.saves],
                    ["Alerts", data.stats.alerts],
                    ["Emails", data.stats.emails],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <p className="text-xl font-bold text-[#0c4a6e]">{value}</p>
                      <p className="text-[10px] font-semibold text-[#0284c7]">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 isolate rounded-md bg-[#e0f2fe] px-3 py-4">
                <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-wide text-[#0369a1]">
                  Email information
                </p>
                <div className="flex items-start justify-between gap-2">
                  <RingStat label="Email Clicks" value={clickRate} tone="#0ea5e9" />
                  <RingStat label="Email Opens" value={openRate} tone="#0284c7" />
                  <RingStat label="Alert Opens" value={alertRate} tone="#0369a1" />
                </div>
              </div>
            </aside>

            <section className="flex min-w-0 flex-col bg-[#f7f9fb] lg:min-h-0 lg:overflow-hidden">
              <form
                onSubmit={submitNote}
                className="shrink-0 border-b border-[#e8edf2] bg-white px-4 py-2.5"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div
                    className="inline-flex rounded-md border border-[#d8dee6] bg-[#f8fafc] p-0.5"
                    role="group"
                    aria-label="Note category"
                  >
                    {(
                      [
                        ["GENERAL", "General"],
                        ["CALL", "Call"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setNoteCategory(value)}
                        className={cn(
                          "rounded px-2.5 py-1 text-[11px] font-semibold transition",
                          noteCategory === value
                            ? "bg-white text-[#1e2a38] shadow-sm"
                            : "text-[#64748b] hover:text-[#1e2a38]",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotePinned((v) => !v)}
                    aria-pressed={notePinned}
                    title={notePinned ? "Unpin note" : "Pin note to top of activity"}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition",
                      notePinned
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-[#d8dee6] bg-white text-[#64748b] hover:bg-[#f8fafc] hover:text-[#1e2a38]",
                    )}
                  >
                    <Pin
                      className={cn(
                        "size-3.5",
                        notePinned && "fill-amber-500 text-amber-700",
                      )}
                    />
                    {notePinned ? "Pinned" : "Pin"}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder={
                      noteCategory === "CALL"
                        ? "Add a call note..."
                        : "Add a note..."
                    }
                    className="min-w-0 flex-1 rounded-md border border-[#d8dee6] bg-white px-3 py-2 text-[13px] text-[#1e2a38] outline-none placeholder:text-[#94a3b8] focus:border-[#2b6cb0]"
                  />
                  <button
                    type="submit"
                    disabled={notePending || !noteBody.trim()}
                    className="shrink-0 rounded-md bg-[#1e2a38] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40"
                  >
                    {notePending ? "…" : "Save"}
                  </button>
                </div>
                {noteMessage ? (
                  <p className="mt-1.5 text-[11px] font-medium text-[#64748b]">
                    {noteMessage}
                  </p>
                ) : null}
              </form>

              <div className="shrink-0 border-b border-[#e8edf2] bg-white">
                <div className="flex gap-0.5 overflow-x-auto overscroll-x-contain px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {TABS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={cn(
                        "relative shrink-0 px-3 py-2.5 text-[12px] font-semibold transition sm:px-3.5",
                        tab === item.id
                          ? "text-[#2b6cb0]"
                          : "text-[#64748b] hover:text-[#1e2a38]",
                      )}
                    >
                      {item.label}
                      {tab === item.id ? (
                        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#2b6cb0]" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 space-y-4 px-4 py-4 sm:px-5 lg:flex-1 lg:overflow-y-auto">
                {tab === "activity" ? (
                  <Panel title="Activity timeline">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] text-[#94a3b8]">
                        Views, saves, searches, emails, calls, appointments —
                        filter by type.
                      </p>
                      <ActivityFilters
                        selected={activityFilters}
                        onChange={setActivityFilters}
                        counts={activityFilterCounts}
                      />
                    </div>
                    <CrmTimeline
                      items={filteredTimelineItems}
                      empty={
                        timelineItems.length === 0
                          ? "No activity yet."
                          : "No activity matches these filters. Adjust Filters to see more."
                      }
                    />
                  </Panel>
                ) : null}

                {tab === "info" ? (
                  <>
                    <div className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3">
                      <div className="mb-3 flex items-center justify-between border-b border-[#eef2f6] pb-2">
                        <h3 className="text-[14px] font-bold text-[#1e2a38]">
                          Details
                        </h3>
                      </div>
                      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                        <DetailColumn title="Key info">
                          <InfoRow
                            label="First name"
                            value={data.lead.customer?.name?.split(/\s+/)[0]}
                          />
                          <InfoRow
                            label="Last name"
                            value={data.lead.customer?.name
                              ?.split(/\s+/)
                              .slice(1)
                              .join(" ")}
                          />
                          <InfoRow
                            label="Email"
                            value={data.lead.customer?.email}
                          />
                          <InfoRow
                            label="Phone"
                            value={data.lead.customer?.phone}
                          />
                          <InfoRow
                            label="Address"
                            value={data.lead.customer?.homeAddress}
                          />
                          <InfoRow
                            label="Listing"
                            value={
                              data.lead.listingMls ? (
                                <Link
                                  href={`/listing/${data.lead.listingMls}`}
                                  className="text-[#2b6cb0] hover:underline"
                                >
                                  {data.lead.listingMls}
                                </Link>
                              ) : null
                            }
                          />
                          <InfoRow
                            label="Timeframe"
                            value={
                              data.lead.customer ? (
                                <select
                                  className="w-full max-w-[11rem] rounded-md border border-[#d8dee6] bg-white px-2 py-1 text-[13px] font-medium text-[#1e2a38]"
                                  value={
                                    data.lead.customer.purchaseTimeframe ?? ""
                                  }
                                  disabled={profileFlagPending !== null}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    void setPurchaseTimeframe(
                                      v === ""
                                        ? null
                                        : (v as PurchaseTimeframeValue),
                                    );
                                  }}
                                  aria-label="Purchase timeframe"
                                >
                                  <option value="">Not set</option>
                                  {PURCHASE_TIMEFRAMES.map((tf) => (
                                    <option key={tf} value={tf}>
                                      {purchaseTimeframeLabel(tf)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                "—"
                              )
                            }
                          />
                        </DetailColumn>

                        <DetailColumn title="Assignment">
                          <InfoRow
                            label="Agent assigned"
                            value={
                              data.lead.assignedAgent?.name ||
                              data.lead.assignedAgent?.email
                            }
                          />
                          <InfoRow
                            label="Source"
                            value={data.lead.source.replaceAll("_", " ")}
                          />
                          <InfoRow
                            label="Score"
                            value={String(data.lead.score)}
                          />
                          <InfoRow
                            label="Hotness"
                            value={String(data.hot.hotness)}
                          />
                          <InfoRow
                            label="Search"
                            value={data.savedSearchLabel}
                          />
                          <InfoRow
                            label="Campaign"
                            value={data.lead.adCampaign?.name}
                          />
                        </DetailColumn>

                        <DetailColumn title="User data">
                          <InfoRow
                            label="Registered"
                            value={new Date(
                              data.lead.createdAt,
                            ).toLocaleString("en-CA")}
                          />
                          <InfoRow
                            label="Last visit"
                            value={
                              data.hot.lastSeenAt
                                ? new Date(
                                    data.hot.lastSeenAt,
                                  ).toLocaleString("en-CA")
                                : null
                            }
                          />
                          <InfoRow
                            label="Last touch"
                            value={relativeAgo(data.lastTouchAt)}
                          />
                          <InfoRow
                            label="SLA open"
                            value={
                              data.hot.slaHoursOpen != null
                                ? `${data.hot.slaHoursOpen.toFixed(1)}h`
                                : null
                            }
                          />
                          <InfoRow
                            label="Terms accepted at"
                            value={
                              data.lead.customer?.termsAcceptedAt
                                ? new Date(
                                    data.lead.customer.termsAcceptedAt,
                                  ).toLocaleString("en-CA")
                                : null
                            }
                          />
                          <InfoRow
                            label="PropTx agreement accepted at"
                            value={
                              data.lead.customer?.vowAcceptedAt
                                ? new Date(
                                    data.lead.customer.vowAcceptedAt,
                                  ).toLocaleString("en-CA")
                                : null
                            }
                          />
                          <InfoRow
                            label="Email & phone consent accepted at"
                            value={
                              data.lead.customer?.caslConsentAt
                                ? new Date(
                                    data.lead.customer.caslConsentAt,
                                  ).toLocaleString("en-CA")
                                : data.lead.contactConsentAt
                                  ? new Date(
                                      data.lead.contactConsentAt,
                                    ).toLocaleString("en-CA")
                                  : null
                            }
                          />
                          <InfoRow
                            label="Win reason"
                            value={data.lead.winReason}
                          />
                          <InfoRow
                            label="Lost reason"
                            value={data.lead.lostReason}
                          />
                        </DetailColumn>
                      </div>

                      {data.lead.notes ? (
                        <div className="mt-5 border-t border-[#eef2f6] pt-4">
                          <h4 className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-[#64748b]">
                            Intake notes
                          </h4>
                          <p className="whitespace-pre-wrap text-[13px] text-[#334155]">
                            {data.lead.notes}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {(data.lead.utmSource ||
                      data.lead.utmCampaign ||
                      data.lead.adCampaign) && (
                      <Panel title="Attribution">
                        <dl className="grid gap-2 text-[13px] sm:grid-cols-3">
                          <div>
                            <dt className="text-[#94a3b8]">Campaign</dt>
                            <dd className="font-medium text-[#1e2a38]">
                              {data.lead.adCampaign?.name ?? "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#94a3b8]">utm_source</dt>
                            <dd className="font-medium text-[#1e2a38]">
                              {data.lead.utmSource ?? "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#94a3b8]">utm_campaign</dt>
                            <dd className="font-medium text-[#1e2a38]">
                              {data.lead.utmCampaign ?? "—"}
                            </dd>
                          </div>
                        </dl>
                      </Panel>
                    )}

                    <Panel title="Partner handoff">
                      <HandoffClient leadId={leadId} />
                    </Panel>
                  </>
                ) : null}

                {tab === "reminders" ? (
                  <div className="space-y-4">
                    <Panel title="Set reminder">
                      <TaskForm
                        leadId={leadId}
                        compact
                        onUpdated={onUpdated}
                      />
                    </Panel>
                    {data.tasks.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
                        No reminders yet.
                      </p>
                    ) : (
                      data.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[14px] font-semibold text-[#1e2a38]">
                              {task.title}
                            </p>
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                                task.status === "OPEN"
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-slate-100 text-slate-600",
                              )}
                            >
                              {task.status}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] text-[#64748b]">
                            {task.type} · due{" "}
                            {new Date(task.dueAt).toLocaleString("en-CA")}
                          </p>
                        </div>
                      ))
                    )}
                    {data.notes.length > 0 ? (
                      <Panel title="Follow-up notes">
                        <ul className="space-y-2">
                          {data.notes.map((n) => (
                            <li
                              key={n.id}
                              className={cn(
                                "rounded-md border px-3 py-2 text-[13px]",
                                n.pinned
                                  ? "border-amber-200 bg-amber-50/70"
                                  : "border-[#eef2f6] bg-[#f8fafc]",
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[11px] text-[#94a3b8]">
                                  <span
                                    className={cn(
                                      "mr-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                      n.category === "CALL"
                                        ? "bg-[#e0f2fe] text-[#0369a1]"
                                        : "bg-[#e2e8f0] text-[#475569]",
                                    )}
                                  >
                                    {n.category === "CALL" ? "Call" : "General"}
                                  </span>
                                  {n.author.name || n.author.email} ·{" "}
                                  {new Date(n.createdAt).toLocaleString("en-CA")}
                                </p>
                                <button
                                  type="button"
                                  disabled={pinPendingId === n.id}
                                  onClick={() =>
                                    void toggleNotePin(n.id, !n.pinned)
                                  }
                                  title={
                                    n.pinned
                                      ? "Unpin from activity top"
                                      : "Pin to top of activity"
                                  }
                                  className={cn(
                                    "inline-flex size-7 shrink-0 items-center justify-center rounded-md transition disabled:opacity-50",
                                    n.pinned
                                      ? "bg-amber-100 text-amber-800"
                                      : "text-[#94a3b8] hover:bg-white hover:text-[#1e2a38]",
                                  )}
                                >
                                  <Pin
                                    className={cn(
                                      "size-3.5",
                                      n.pinned && "fill-amber-500",
                                    )}
                                  />
                                </button>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-[#334155]">
                                {n.body}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </Panel>
                    ) : null}
                  </div>
                ) : null}

                {tab === "appointments" ? (
                  <div className="space-y-3">
                    {data.appointments.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
                        No appointments.
                      </p>
                    ) : (
                      data.appointments.map((a) => (
                        <div
                          key={a.id}
                          className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
                        >
                          <p className="text-[14px] font-semibold text-[#1e2a38]">
                            {a.type.replaceAll("_", " ")} · {a.status}
                          </p>
                          <p className="mt-1 text-[12px] text-[#64748b]">
                            {a.startsAt
                              ? new Date(a.startsAt).toLocaleString("en-CA")
                              : "Unscheduled"}
                            {a.listingMls ? ` · ${a.listingMls}` : ""}
                          </p>
                          {a.videoJoinUrl ? (
                            <a
                              href={a.videoJoinUrl}
                              className="mt-1 inline-block text-[12px] font-semibold text-[#2b6cb0] hover:underline"
                            >
                              Join link
                            </a>
                          ) : null}
                          {a.notes ? (
                            <p className="mt-2 text-[12px] text-[#475569]">
                              {a.notes}
                            </p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}

                {tab === "conversations" ? (
                  <div className="space-y-4">
                    <Panel title="Send email">
                      <LeadEmailForm
                        leadId={leadId}
                        defaultTo={data.lead.customer?.email}
                        consented={data.permissions.consented}
                        onUpdated={onUpdated}
                      />
                    </Panel>
                    {data.emails.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
                        No emails logged yet.
                      </p>
                    ) : (
                      data.emails.map((e) => (
                        <div
                          key={e.id}
                          className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-[14px] font-semibold text-[#1e2a38]">
                              {e.subject}
                            </p>
                            <time className="text-[11px] text-[#94a3b8]">
                              {new Date(e.createdAt).toLocaleString("en-CA")}
                            </time>
                          </div>
                          <p className="mt-0.5 text-[12px] text-[#64748b]">
                            To {e.toEmail}
                          </p>
                          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[13px] text-[#475569]">
                            {e.body}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}

                {tab === "engagement" ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        ["Views (24h)", data.hot.views24h],
                        ["Saved homes", data.stats.saves],
                        ["Alerts", data.stats.alerts],
                        ["Emails sent", data.stats.emails],
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="rounded-lg border border-[#bae6fd] bg-[#e0f2fe] px-4 py-3"
                        >
                          <p className="text-2xl font-bold text-[#0c4a6e]">
                            {value}
                          </p>
                          <p className="text-[12px] font-semibold text-[#0284c7]">
                            {label}
                          </p>
                        </div>
                      ))}
                    </div>

                    {data.buyerIntent ? (
                      <Panel title="Criteria · matches · shortlist">
                        <EngagementMatchboard
                          leadId={leadId}
                          buyerIntent={data.buyerIntent}
                          savedSearches={data.savedSearches}
                          consented={data.permissions.consented}
                          customerEmail={data.lead.customer?.email}
                          onUpdated={onUpdated}
                        />
                      </Panel>
                    ) : null}

                    <Panel title="Saved searches / alerts">
                      {data.savedSearches.length === 0 ? (
                        <p className="text-[13px] text-[#94a3b8]">
                          No saved searches yet — use “Save as search” above to
                          create one from Looking for.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {data.savedSearches.map((s) => (
                            <SavedSearchEditor
                              key={s.id}
                              leadId={leadId}
                              search={s}
                              onUpdated={onUpdated}
                            />
                          ))}
                        </div>
                      )}
                    </Panel>

                    <Panel title="Saved homes">
                      <div className="flex flex-wrap gap-1.5">
                        {data.savedListings.length === 0 ? (
                          <span className="text-[13px] text-[#94a3b8]">None</span>
                        ) : (
                          data.savedListings.map((s) => (
                            <Link
                              key={s.id}
                              href={`/listing/${s.mlsNumber}`}
                              className="rounded-md bg-[#eef2f6] px-2 py-0.5 text-[12px] font-semibold text-[#2b6cb0] hover:underline"
                            >
                              {s.mlsNumber}
                            </Link>
                          ))
                        )}
                      </div>
                    </Panel>

                    <Panel title="Property watches">
                      <div className="flex flex-wrap gap-1.5">
                        {data.propertyMonitors.length === 0 ? (
                          <span className="text-[13px] text-[#94a3b8]">None</span>
                        ) : (
                          data.propertyMonitors.map((m) => (
                            <Link
                              key={m.id}
                              href={`/listing/${m.mlsNumber}`}
                              className="rounded-md bg-[#eef2f6] px-2 py-0.5 text-[12px] font-semibold text-[#2b6cb0] hover:underline"
                            >
                              {m.mlsNumber}
                            </Link>
                          ))
                        )}
                      </div>
                    </Panel>

                    <Panel title="Area monitors">
                      <p className="text-[13px] text-[#475569]">
                        {data.areaMonitors.length === 0
                          ? "None"
                          : data.areaMonitors
                              .map((a) => a.name || a.city || a.id.slice(0, 8))
                              .join(" · ")}
                      </p>
                    </Panel>

                    <Panel title="Route planner">
                      {data.tours.length === 0 ? (
                        <p className="text-[13px] text-[#94a3b8]">No tours</p>
                      ) : (
                        <div className="space-y-1">
                          {data.tours.map((t) => (
                            <p
                              key={t.id}
                              className="text-[12px] text-[#475569]"
                            >
                              {t.name} · {t.status} · {t.stops.length} stops
                              {t.stops.length
                                ? ` (${t.stops.map((s) => s.mlsNumber).join(", ")})`
                                : ""}
                            </p>
                          ))}
                        </div>
                      )}
                    </Panel>

                    <Panel title="Customer listing notes">
                      {data.listingNotes.length === 0 ? (
                        <p className="text-[13px] text-[#94a3b8]">None</p>
                      ) : (
                        <div className="space-y-1">
                          {data.listingNotes.map((n) => (
                            <p
                              key={n.id}
                              className="text-[12px] text-[#475569]"
                            >
                              <Link
                                href={`/listing/${n.mlsNumber}`}
                                className="font-semibold text-[#2b6cb0] hover:underline"
                              >
                                {n.mlsNumber}
                              </Link>
                              : {n.body.slice(0, 120)}
                            </p>
                          ))}
                        </div>
                      )}
                    </Panel>

                    <Panel title="Alerts inbox">
                      <p className="text-[13px] text-[#475569]">
                        {data.alerts.length === 0
                          ? "None"
                          : `${data.alerts.length} recent · latest: ${data.alerts[0]?.title || data.alerts[0]?.kind}`}
                      </p>
                    </Panel>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
