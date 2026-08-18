"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Eye,
  Globe,
  Heart,
  Mail,
  MailOpen,
  MessageSquare,
  MousePointerClick,
  Phone,
  StickyNote,
  Workflow,
  X,
} from "lucide-react";
import { openLeadProfileHref } from "@/components/agent/LeadQueryPopup";
import type {
  DeskActivityCategory,
  DeskActivityItem,
} from "@/lib/agent/desk-activity";
import { cn } from "@/lib/utils";

const CATEGORIES: Array<{ id: DeskActivityCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "notes", label: "Notes" },
  { id: "views_favorites", label: "Views & Favorites" },
  { id: "agent_actions", label: "Agent Actions" },
  { id: "communications", label: "Communications" },
  { id: "property_alerts", label: "Property Alerts" },
];

type Tab = "activity" | "dialer";

function formatStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Keep share tokens / long paths from blowing out the card. */
function formatDetail(detail: string | null): string | null {
  if (!detail?.trim()) return null;
  let text = detail.trim();
  text = text.replace(/https?:\/\/[^\s]+/gi, (url) => {
    try {
      const u = new URL(url);
      if (u.pathname.includes("/share/")) return "shared homes link";
      const path = u.pathname.length > 28 ? `${u.pathname.slice(0, 28)}…` : u.pathname;
      return u.host + path;
    } catch {
      return "link";
    }
  });
  text = text.replace(/\/(?:share\/homes\/)?eyJ[A-Za-z0-9_-]{20,}/g, "shared homes link");
  text = text.replace(/[A-Za-z0-9_-]{48,}/g, (token) => `${token.slice(0, 12)}…`);
  if (text.length > 90) text = `${text.slice(0, 87)}…`;
  return text;
}

function iconForItem(item: DeskActivityItem) {
  const t = item.type.toUpperCase();
  if (t === "CALL_NOTE" || t === "CALL") {
    return { Icon: Phone, tone: "bg-[#0284c7]" };
  }
  if (item.category === "notes" || t.includes("NOTE")) {
    return { Icon: StickyNote, tone: "bg-[#64748b]" };
  }
  if (t === "APPOINTMENT") {
    return { Icon: CalendarDays, tone: "bg-[#e11d48]" };
  }
  if (t === "EMAIL_OPENED" || t === "PROPERTY_ALERT_OPENED") {
    return { Icon: MailOpen, tone: "bg-[#059669]" };
  }
  if (
    t === "EMAIL_CLICKED" ||
    t === "PROPERTY_ALERT_CLICKED" ||
    t === "PROPERTY_ALERT_VIEW"
  ) {
    return { Icon: MousePointerClick, tone: "bg-[#d97706]" };
  }
  if (
    t === "PROPERTY_ALERT_EMAIL" ||
    t === "DIGEST_EMAIL" ||
    t === "PROPERTY_ALERT"
  ) {
    return { Icon: Bell, tone: "bg-[#0891b2]" };
  }
  if (
    t.includes("EMAIL") ||
    t === "SHORTLIST_EMAILED" ||
    t === "AGENT_MESSAGE"
  ) {
    return { Icon: Mail, tone: "bg-[#2563eb]" };
  }
  if (t === "LISTING_VIEW" || t === "SEARCH" || t === "PAGE_VIEW") {
    return { Icon: Eye, tone: "bg-[#475569]" };
  }
  if (t.includes("SAVE") || t.includes("WATCH") || t.includes("FAVORITE")) {
    return { Icon: Heart, tone: "bg-[#e11d48]" };
  }
  if (item.category === "communications") {
    return { Icon: MessageSquare, tone: "bg-[#7c3aed]" };
  }
  return { Icon: Workflow, tone: "bg-[#0f766e]" };
}

function ActivitySummary({ item }: { item: DeskActivityItem }) {
  const href = openLeadProfileHref(item.leadId, { view: "mine" });
  const actor = item.actorName?.trim() || null;
  const leadIsActor =
    !actor ||
    actor.toLowerCase() === item.leadName.trim().toLowerCase();
  const detail = formatDetail(item.detail);

  return (
    <p className="min-w-0 break-words text-[13px] leading-snug text-[#334155] [overflow-wrap:anywhere]">
      {leadIsActor ? (
        <>
          <Link
            href={href}
            className="font-semibold text-[#0d9488] hover:underline"
          >
            {item.leadName}
          </Link>{" "}
          {item.action}
        </>
      ) : (
        <>
          <span className="font-semibold text-[#0f172a]">{actor}</span>{" "}
          {item.action}{" "}
          <Link
            href={href}
            className="font-semibold text-[#0d9488] hover:underline"
          >
            {item.leadName}
          </Link>
        </>
      )}
      {detail ? (
        <>
          {" "}
          <span className="break-words text-[#0f766e] [overflow-wrap:anywhere]">
            {detail}
          </span>
        </>
      ) : null}
    </p>
  );
}

export function ActivityFeedDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("activity");
  const [category, setCategory] = useState<DeskActivityCategory>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [items, setItems] = useState<DeskActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const load = useCallback(async (cat: DeskActivityCategory) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/agent/activity?category=${encodeURIComponent(cat)}&take=60`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to load activity");
      const data = (await res.json()) as { items: DeskActivityItem[] };
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load(category);
  }, [open, category, load]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [menuOpen]);

  const categoryLabel =
    CATEGORIES.find((c) => c.id === category)?.label ?? "All";

  return (
    <div
      className={cn(
        "fixed inset-0 z-[85]",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={cn(
          "absolute inset-0 bg-[#0b1220]/35 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0",
        )}
        aria-label="Close activity feed"
        onClick={onClose}
      />

      <aside
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-[26rem] flex-col bg-[#f4f6f8] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-[-12px_0_40px_rgb(0_0_0/0.18)] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Activity feed"
      >
        <div className="flex items-center border-b border-[#d8dee6] bg-white">
          <button
            type="button"
            onClick={() => setTab("activity")}
            className={cn(
              "relative flex-1 px-3 py-3 text-center text-[13px] font-semibold transition",
              tab === "activity"
                ? "text-[#0d9488]"
                : "text-[#64748b] hover:text-[#334155]",
            )}
          >
            Activity
            {tab === "activity" ? (
              <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-[#0d9488]" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setTab("dialer")}
            className={cn(
              "relative flex-1 px-3 py-3 text-center text-[13px] font-semibold transition",
              tab === "dialer"
                ? "text-[#0d9488]"
                : "text-[#64748b] hover:text-[#334155]",
            )}
          >
            Dialer
            {tab === "dialer" ? (
              <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-[#0d9488]" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mr-2 rounded-md p-2 text-[#64748b] transition hover:bg-[#eef1f4] hover:text-[#0f172a]"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {tab === "activity" ? (
          <>
            <div className="border-b border-[#d8dee6] bg-white px-3 py-2.5">
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-md border border-[#d8dee6] bg-white px-3 py-2 text-left text-[13px] font-semibold text-[#0f172a] shadow-sm"
                  aria-haspopup="listbox"
                  aria-expanded={menuOpen}
                  aria-controls={listId}
                >
                  <span>{categoryLabel}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 text-[#64748b] transition",
                      menuOpen && "rotate-180",
                    )}
                  />
                </button>
                {menuOpen ? (
                  <ul
                    id={listId}
                    role="listbox"
                    className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 overflow-hidden rounded-md border border-[#d8dee6] bg-white py-1 shadow-lg"
                  >
                    {CATEGORIES.map((cat) => (
                      <li key={cat.id} role="option" aria-selected={category === cat.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setCategory(cat.id);
                            setMenuOpen(false);
                          }}
                          className={cn(
                            "flex w-full px-3 py-2 text-left text-[13px] font-medium transition",
                            category === cat.id
                              ? "bg-[#ecfdf5] text-[#0d9488]"
                              : "text-[#334155] hover:bg-[#f8fafc]",
                          )}
                        >
                          {cat.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
              {loading ? (
                <p className="px-2 py-10 text-center text-sm text-[#94a3b8]">
                  Loading activity…
                </p>
              ) : error ? (
                <p className="px-2 py-10 text-center text-sm text-[#b91c1c]">
                  {error}
                </p>
              ) : items.length === 0 ? (
                <p className="px-2 py-10 text-center text-sm text-[#94a3b8]">
                  No activity in this category yet.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {items.map((item) => {
                    const { Icon, tone } = iconForItem(item);
                    return (
                      <li
                        key={item.id}
                        className="overflow-hidden rounded-lg border border-[#e2e8f0] bg-white px-3 py-3 shadow-[0_1px_2px_rgb(15_23_42/0.04)]"
                      >
                        <div className="flex min-w-0 gap-2.5">
                          <span
                            className={cn(
                              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-white",
                              tone,
                            )}
                          >
                            <Icon className="size-3.5" strokeWidth={2.2} />
                          </span>
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <ActivitySummary item={item} />
                            <p className="mt-2 text-[11px] font-medium text-[#94a3b8]">
                              {formatStamp(item.createdAt)}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-[#ecfdf5] text-[#0d9488]">
              <Phone className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">Dialer</p>
              <p className="mt-1 text-[13px] text-[#64748b]">
                Power dialer is coming soon. Use Call new from Launchpad for
                now.
              </p>
            </div>
            <Link
              href="/agent/leads?view=mine&pipeline=NEW_LEAD"
              onClick={onClose}
              className="rounded-lg bg-[#e11d48] px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-white"
            >
              Call new leads
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}

export function ActivityGlobeButton({
  open,
  onClick,
  className,
}: {
  open: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-lg transition",
        open
          ? "bg-[#0d9488]/15 text-[#0d9488]"
          : "text-white/75 hover:bg-white/10 hover:text-white",
        className,
      )}
      aria-label={open ? "Close activity feed" : "Open activity feed"}
      aria-pressed={open}
      title="Activity feed"
    >
      <Globe className="size-5" strokeWidth={1.85} />
    </button>
  );
}
