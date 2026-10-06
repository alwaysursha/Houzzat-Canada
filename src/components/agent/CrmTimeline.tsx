"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  Bookmark,
  Calendar,
  Eye,
  Heart,
  Mail,
  MailOpen,
  MessageSquare,
  MousePointerClick,
  Pin,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  UserRound,
  Workflow,
} from "lucide-react";
import { leadActivityDisplayTitle } from "@/lib/agent/activity-display";
import { friendlyActivityTypeLabel } from "@/lib/agent/activity-filters";
import type { TimelineItem } from "@/lib/agent/customer-timeline";
import { isCallOutcomeActivityTitle } from "@/lib/agent/call-outcome-presentation";
import {
  conversationActivityHeadline,
  conversationActivityFromLeadActivity,
} from "@/lib/agent/conversation-activity";
import { propertyAlertEmailLabel } from "@/lib/agent/email-alert-kinds";
import {
  EmailPreviewModal,
  emailLogIdFromTimelineItem,
} from "@/components/agent/EmailPreviewModal";
import { cn } from "@/lib/utils";

type QuickCategory =
  | "all"
  | "alerts"
  | "emails"
  | "views"
  | "saves"
  | "calls"
  | "notes"
  | "pipeline";

const QUICK_CATEGORIES: Array<{
  id: QuickCategory;
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
        u === "PROPERTY_ALERT_OPENED" ||
        u === "PROPERTY_ALERT_CLICKED" ||
        u === "PROPERTY_ALERT_VIEW"
      );
    },
  },
  {
    id: "emails",
    label: "Emails",
    match: (t) => {
      const u = t.toUpperCase();
      return (
        u === "EMAIL" ||
        u === "EMAIL_SENT" ||
        u === "SHORTLIST_EMAILED" ||
        u === "AGENT_MESSAGE" ||
        u === "PROPERTY_ALERT_EMAIL" ||
        u === "DIGEST_EMAIL" ||
        u === "EMAIL_OPENED" ||
        u === "EMAIL_CLICKED" ||
        u === "PROPERTY_ALERT_OPENED" ||
        u === "PROPERTY_ALERT_CLICKED" ||
        u === "PROPERTY_ALERT_VIEW"
      );
    },
  },
  {
    id: "views",
    label: "Views",
    match: (t) => {
      const u = t.toUpperCase();
      return u === "LISTING_VIEW" || u === "PROPERTY_ALERT_VIEW";
    },
  },
  {
    id: "saves",
    label: "Saves",
    match: (t) => {
      const u = t.toUpperCase();
      return u === "SAVE_LISTING" || u === "UNSAVE_LISTING" || u === "SAVE_SEARCH";
    },
  },
  {
    id: "calls",
    label: "Calls",
    match: (t) => {
      const u = t.toUpperCase();
      return u === "CALL_NOTE" || u === "CALL";
    },
  },
  {
    id: "notes",
    label: "Notes",
    match: (t) => {
      const u = t.toUpperCase();
      return u === "NOTE" || u === "CALL_NOTE" || u === "NOTE_PIN";
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
        u === "REMINDER_SET"
      );
    },
  },
];

function conversationView(item: TimelineItem) {
  return conversationActivityFromLeadActivity({
    type: item.type,
    conversationChannel: item.conversationChannel,
    conversationDirection: item.conversationDirection,
    automationKey: item.conversationAutomationKey,
    recipient: item.conversationRecipient,
  });
}

function categoryMeta(type: string, item?: TimelineItem): {
  icon: typeof Mail;
  chip: string;
  dot: string;
  rail: string;
} {
  const conversation = item
    ? conversationView(item)
    : conversationActivityFromLeadActivity({ type });
  if (conversation.isAgentNotification) {
    return {
      icon: Workflow,
      chip: "bg-[#f1f5f9] text-[#334155] ring-[#cbd5e1]",
      dot: "bg-[#64748b]",
      rail: "from-[#94a3b8]/30 to-transparent",
    };
  }
  if (conversation.isAutomatedLeadSms) {
    return {
      icon: Workflow,
      chip: "bg-[#ede9fe] text-[#5b21b6] ring-[#c4b5fd]",
      dot: "bg-[#7c3aed]",
      rail: "from-[#7c3aed]/30 to-transparent",
    };
  }
  if (conversation.isConversation) {
    const received = conversation.conversationDirection === "inbound";
    return received
      ? {
          icon: ArrowDownLeft,
          chip: "bg-[#f1f5f9] text-[#334155] ring-[#cbd5e1]",
          dot: "bg-[#64748b]",
          rail: "from-[#94a3b8]/30 to-transparent",
        }
      : {
          icon: ArrowUpRight,
          chip: "bg-[#dbeafe] text-[#1e40af] ring-[#93c5fd]",
          dot: "bg-[#2b6cb0]",
          rail: "from-[#2b6cb0]/30 to-transparent",
        };
  }
  const t = type.toUpperCase();
  if (t === "DIGEST_EMAIL" || t === "PROPERTY_ALERT_EMAIL") {
    return {
      icon: Bell,
      chip: "bg-[#cffafe] text-[#0e7490] ring-[#67e8f9]",
      dot: "bg-[#06b6d4]",
      rail: "from-[#06b6d4]/40 to-transparent",
    };
  }
  if (t === "EMAIL_OPENED") {
    return {
      icon: MailOpen,
      chip: "bg-[#d1fae5] text-[#047857] ring-[#6ee7b7]",
      dot: "bg-[#10b981]",
      rail: "from-[#10b981]/35 to-transparent",
    };
  }
  if (t === "EMAIL_CLICKED") {
    return {
      icon: MousePointerClick,
      chip: "bg-[#fef3c7] text-[#b45309] ring-[#fcd34d]",
      dot: "bg-[#f59e0b]",
      rail: "from-[#f59e0b]/35 to-transparent",
    };
  }
  if (t.includes("EMAIL") || t === "SHORTLIST_EMAILED" || t === "AGENT_MESSAGE") {
    return {
      icon: Mail,
      chip: "bg-[#dbeafe] text-[#1e40af] ring-[#93c5fd]",
      dot: "bg-[#3b82f6]",
      rail: "from-[#3b82f6]/35 to-transparent",
    };
  }
  if (t === "CALL_NOTE" || t === "CALL") {
    return {
      icon: MessageSquare,
      chip: "bg-[#bae6fd] text-[#075985] ring-[#7dd3fc]",
      dot: "bg-[#0ea5e9]",
      rail: "from-[#0ea5e9]/35 to-transparent",
    };
  }
  if (t.includes("NOTE")) {
    return {
      icon: MessageSquare,
      chip: "bg-[#e2e8f0] text-[#334155] ring-[#cbd5e1]",
      dot: "bg-[#64748b]",
      rail: "from-[#94a3b8]/30 to-transparent",
    };
  }
  if (t === "LISTING_VIEW" || t === "PROPERTY_ALERT_VIEW") {
    return {
      icon: Eye,
      chip: "bg-[#e2e8f0] text-[#1e293b] ring-[#94a3b8]",
      dot: "bg-[#475569]",
      rail: "from-[#64748b]/25 to-transparent",
    };
  }
  if (t.includes("SAVE") || t.includes("WATCH") || t.includes("HEART")) {
    return {
      icon: t.includes("SEARCH") ? Search : Heart,
      chip: "bg-[#fecdd3] text-[#9f1239] ring-[#fda4af]",
      dot: "bg-[#f43f5e]",
      rail: "from-[#f43f5e]/30 to-transparent",
    };
  }
  if (t === "APPOINTMENT") {
    return {
      icon: Calendar,
      chip: "bg-[#bbf7d0] text-[#166534] ring-[#86efac]",
      dot: "bg-[#22c55e]",
      rail: "from-[#22c55e]/30 to-transparent",
    };
  }
  if (t.includes("STATUS") || t.includes("ASSIGN") || t === "TODO") {
    return {
      icon: Workflow,
      chip: "bg-[#99f6e4] text-[#115e59] ring-[#5eead4]",
      dot: "bg-[#0f766e]",
      rail: "from-[#0f766e]/25 to-transparent",
    };
  }
  if (t === "SIGN_IN" || t === "SIGN_UP" || t === "CREATED") {
    return {
      icon: UserRound,
      chip: "bg-[#cbd5e1] text-[#0f172a] ring-[#94a3b8]",
      dot: "bg-[#334155]",
      rail: "from-[#475569]/25 to-transparent",
    };
  }
  return {
    icon: Bookmark,
    chip: "bg-[#e2e8f0] text-[#334155] ring-[#cbd5e1]",
    dot: "bg-[#64748b]",
    rail: "from-[#94a3b8]/20 to-transparent",
  };
}

function typeLabel(item: TimelineItem) {
  const conversation = conversationActivityHeadline({
    type: item.type,
    conversationChannel: item.conversationChannel,
    conversationDirection: item.conversationDirection,
    automationKey: item.conversationAutomationKey,
    recipient: item.conversationRecipient,
  });
  if (conversation) return conversation;
  if (item.source === "note") {
    return item.noteCategory === "CALL" ? "Call note" : "General note";
  }
  if (item.type === "DIGEST_EMAIL" || item.type === "PROPERTY_ALERT_EMAIL") {
    return propertyAlertEmailLabel(item.emailKind);
  }
  if (item.type === "contact_update_request") return "Contact update requested";
  if (
    item.type === "contact_updated_by_customer" ||
    item.type === "unsubscribe" ||
    item.type === "property_watch_removed" ||
    item.type === "area_watch_removed" ||
    item.type === "saved_search_removed"
  ) {
    return leadActivityDisplayTitle({
      type: item.type,
      body: item.body,
    });
  }
  if (item.type === "lead_info_updated") return "Lead info updated";
  if (item.type === "contact_update") return "Contact updated";
  if (item.type === "note_pin") return "Note pin";
  if (item.type === "CALL" && isCallOutcomeActivityTitle(item.title)) return "Call";
  return friendlyActivityTypeLabel(item.type);
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayHeading(date: Date) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startToday.getTime() - startThat.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function timeLabel(date: Date) {
  return date.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isListingRow(item: TimelineItem) {
  return Boolean(item.mlsNumber);
}

export function CrmTimeline({
  items,
  empty = "No activity yet.",
}: {
  items: TimelineItem[];
  empty?: string;
}) {
  const [category, setCategory] = useState<QuickCategory>("all");
  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null);

  const categoryCounts = useMemo(() => {
    const counts: Record<QuickCategory, number> = {
      all: items.length,
      alerts: 0,
      emails: 0,
      views: 0,
      saves: 0,
      calls: 0,
      notes: 0,
      pipeline: 0,
    };
    for (const item of items) {
      for (const cat of QUICK_CATEGORIES) {
        if (cat.id === "all") continue;
        if (cat.match(item.type)) counts[cat.id] += 1;
      }
    }
    return counts;
  }, [items]);

  const visible = useMemo(() => {
    const matcher =
      QUICK_CATEGORIES.find((c) => c.id === category)?.match ?? (() => true);
    return items.filter((item) => matcher(item.type));
  }, [items, category]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: TimelineItem[] }>();
    for (const item of visible) {
      const key = dayKey(item.createdAt);
      const existing = map.get(key);
      if (existing) existing.items.push(item);
      else
        map.set(key, {
          label: dayHeading(item.createdAt),
          items: [item],
        });
    }
    return [...map.entries()].map(([key, value]) => ({ key, ...value }));
  }, [visible]);

  if (!items.length) {
    return (
      <p className="rounded-xl border border-dashed border-[#d8dee6] bg-[#f8fafc] px-4 py-10 text-center text-sm text-[#94a3b8]">
        {empty}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {QUICK_CATEGORIES.map((cat) => {
          const count = categoryCounts[cat.id];
          const active = category === cat.id;
          if (cat.id !== "all" && count === 0) return null;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
                active
                  ? "bg-[#0f172a] text-white shadow-sm"
                  : "bg-white text-[#475569] ring-1 ring-[#e2e8f0] hover:bg-[#f8fafc]",
              )}
            >
              {cat.label}
              <span
                className={cn(
                  "tabular-nums text-[10px] font-bold",
                  active ? "text-white/70" : "text-[#94a3b8]",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#d8dee6] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#94a3b8]">
          Nothing in this category. Try another chip or adjust Filters.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group, groupIndex) => (
            <section
              key={group.key}
              className="motion-safe:animate-[crmTimelineIn_0.35s_ease-out_both]"
              style={{ animationDelay: `${Math.min(groupIndex, 4) * 40}ms` }}
            >
              <div className="sticky top-0 z-[1] -mx-1 mb-3 flex items-center gap-3 bg-gradient-to-b from-white via-white to-white/80 px-1 py-1 backdrop-blur-sm">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#64748b]">
                  {group.label}
                </h3>
                <div className="h-px flex-1 bg-[#e2e8f0]" />
                <span className="text-[11px] font-semibold tabular-nums text-[#94a3b8]">
                  {group.items.length}
                </span>
              </div>

              <ol className="relative space-y-0 border-l border-[#e2e8f0] pl-5 sm:pl-6">
                {group.items.map((item, index) => {
                  const meta = categoryMeta(item.type, item);
                  const conversation = conversationView(item);
                  const Icon = meta.icon;
                  const listingHref = item.mlsNumber
                    ? `/listing/${item.mlsNumber}`
                    : item.path;
                  const showListingCard = isListingRow(item);
                  const emailId = emailLogIdFromTimelineItem(item);
                  const canPreview = Boolean(emailId);

                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "relative pb-5 last:pb-0",
                        item.pinned &&
                          "rounded-r-xl bg-amber-50/80 py-2.5 pr-2 pl-1",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute -left-[1.55rem] top-0.5 flex size-7 items-center justify-center rounded-full bg-white ring-4 ring-white sm:-left-[1.7rem]",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full text-white shadow-sm",
                            meta.dot,
                          )}
                        >
                          <Icon className="size-3" strokeWidth={2.5} />
                        </span>
                      </span>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {item.pinned ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-[13px] font-bold text-amber-900 ring-1 ring-amber-200">
                            <Pin className="size-3.5 fill-amber-500" />
                            Pinned
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-bold tracking-tight ring-1",
                            meta.chip,
                          )}
                        >
                          <Icon className="size-3.5 shrink-0" strokeWidth={2.5} />
                          {typeLabel(item)}
                        </span>
                        <time className="text-[13px] font-semibold text-[#64748b]">
                          {timeLabel(item.createdAt)}
                        </time>
                        {item.emailKind &&
                        item.type !== "DIGEST_EMAIL" &&
                        item.type !== "PROPERTY_ALERT_EMAIL" ? (
                          <span className="text-[12px] font-medium capitalize text-[#94a3b8]">
                            {item.emailKind.replaceAll("_", " ")}
                          </span>
                        ) : null}
                      </div>

                      {showListingCard ? (
                        <div className="relative z-0 mt-2 overflow-hidden rounded-xl border border-[#e2e8f0] bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                          {listingHref ? (
                            <Link
                              href={listingHref}
                              className="group flex gap-3 p-2.5 transition hover:bg-[#f8fafc]"
                            >
                              <ListingCover
                                imageUrl={item.imageUrl}
                                title={item.title}
                              />
                              <div className="min-w-0 flex-1 self-center py-0.5">
                                <p className="text-sm font-semibold leading-snug text-[#0f172a] group-hover:text-[#0e7490]">
                                  {item.title}
                                </p>
                                {item.path ? (
                                  <p className="mt-0.5 truncate text-xs text-[#94a3b8]">
                                    {item.path}
                                  </p>
                                ) : null}
                                {item.body && item.body !== item.path ? (
                                  <p className="mt-1 line-clamp-2 text-xs text-[#64748b]">
                                    {item.body}
                                  </p>
                                ) : null}
                                {item.mlsNumber ? (
                                  <p className="mt-1.5 text-xs font-semibold text-[#0e7490]">
                                    {item.mlsNumber}
                                  </p>
                                ) : null}
                              </div>
                            </Link>
                          ) : (
                            <div className="flex gap-3 p-2.5">
                              <ListingCover
                                imageUrl={item.imageUrl}
                                title={item.title}
                              />
                              <div className="min-w-0 flex-1 self-center py-0.5">
                                <p className="text-sm font-semibold leading-snug text-[#0f172a]">
                                  {item.title}
                                </p>
                                {item.mlsNumber ? (
                                  <p className="mt-1.5 text-xs font-semibold text-[#0e7490]">
                                    {item.mlsNumber}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          )}
                          {canPreview || item.source === "email" ? (
                            <div className="flex flex-wrap items-center gap-2 border-t border-[#eef2f6] px-2.5 py-2">
                              {canPreview ? (
                                <PreviewButton
                                  onClick={() => setPreviewEmailId(emailId)}
                                />
                              ) : null}
                              <EmailEngagementBadges item={item} />
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "mt-1.5 rounded-xl border px-2.5 py-2 transition hover:border-[#eef2f6] hover:bg-[#f8fafc]/80",
                            conversation.isAgentNotification
                              ? "border-l-[3px] border-[#cbd5e1] border-y-transparent border-r-transparent bg-[#f8fafc]"
                              : conversation.isAutomatedLeadSms
                                ? "border-l-[3px] border-[#c4b5fd] border-y-transparent border-r-transparent bg-[#faf8ff]"
                              : conversation.isConversation
                              ? conversation.conversationDirection === "inbound"
                                ? "border-l-[3px] border-[#cbd5e1] border-y-transparent border-r-transparent bg-[#f8fafc]"
                                : "border-l-[3px] border-[#93c5fd] border-y-transparent border-r-transparent bg-[#f8fbff]"
                              : "border-transparent",
                          )}
                        >
                          {conversation.isConversation ? null : (
                            <p className="text-sm font-semibold text-[#0f172a]">
                              {item.title}
                            </p>
                          )}
                          {item.body ? (
                            <p
                              className={cn(
                                "line-clamp-3 text-[13px] leading-relaxed text-[#64748b]",
                                conversation.isConversation
                                  ? "text-sm font-medium text-[#0f172a]"
                                  : "mt-0.5",
                              )}
                            >
                              {item.body}
                            </p>
                          ) : null}
                          {conversation.automationName ? (
                            <p className="mt-1 text-[11px] font-medium text-[#64748b]">
                              {conversation.automationName}
                            </p>
                          ) : null}
                          {item.lastClickedUrl &&
                          item.type === "EMAIL_CLICKED" ? (
                            <p className="mt-1 truncate text-[12px] font-medium text-[#b45309]">
                              {item.lastClickedUrl}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {canPreview ? (
                              <PreviewButton
                                onClick={() => setPreviewEmailId(emailId)}
                              />
                            ) : null}
                            <EmailEngagementBadges item={item} />
                          </div>
                        </div>
                      )}

                      {index < group.items.length - 1 ? (
                        <span
                          className={cn(
                            "pointer-events-none absolute -left-[1px] top-8 h-[calc(100%-1.5rem)] w-px bg-gradient-to-b",
                            meta.rail,
                          )}
                          aria-hidden
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      <EmailPreviewModal
        emailId={previewEmailId}
        onClose={() => setPreviewEmailId(null)}
      />
    </div>
  );
}

function PreviewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f172a] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#1e293b]"
    >
      <Eye className="size-3.5" />
      Preview
    </button>
  );
}

function EmailEngagementBadges({ item }: { item: TimelineItem }) {
  if (item.source !== "email") return null;
  const opened = Boolean(item.emailOpenedAt);
  const clicked = Boolean(item.emailClickedAt);
  if (!opened && !clicked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#f1f5f9] px-2 py-1 text-[11px] font-semibold text-[#94a3b8]">
        Not opened yet
      </span>
    );
  }
  return (
    <>
      {opened ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-[#d1fae5] px-2 py-1 text-[11px] font-bold text-[#047857] ring-1 ring-[#6ee7b7]">
          <MailOpen className="size-3" />
          Opened
          {(item.emailOpenCount ?? 0) > 1
            ? ` · ${item.emailOpenCount}×`
            : ""}
        </span>
      ) : null}
      {clicked ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-[#fef3c7] px-2 py-1 text-[11px] font-bold text-[#b45309] ring-1 ring-[#fcd34d]">
          <MousePointerClick className="size-3" />
          Clicked
          {(item.emailClickCount ?? 0) > 1
            ? ` · ${item.emailClickCount}×`
            : ""}
        </span>
      ) : null}
    </>
  );
}

function ListingCover({
  imageUrl,
  title,
}: {
  imageUrl: string | null;
  title: string;
}) {
  return (
    <div className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-[#0f172a]/[0.06] ring-1 ring-[#0f172a]/10 sm:size-[5.25rem]">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={title}
          fill
          sizes="84px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(145deg,#e8eef2_0%,#d5dde4_55%,#c7d0d8_100%)]">
          <span className="text-[10px] font-semibold tracking-wide text-[#94a3b8]">
            No photo
          </span>
        </div>
      )}
    </div>
  );
}
