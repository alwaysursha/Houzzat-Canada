"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  ChevronRight,
  Phone,
  Radio,
  Timer,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import { LeadQuickPopup } from "@/components/agent/LeadQuickPopup";
import { pipelineShortLabel } from "@/lib/agent/pipeline";
import type { LeadStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

export type QuickModuleLead = {
  id: string;
  status: string;
  customer: { name: string | null; email: string } | null;
  meta?: string | null;
};

export type QuickModuleTask = {
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

type ModuleId =
  | "callNew"
  | "contacted"
  | "tasks"
  | "statistics"
  | "online"
  | "hot";

type Tone = "danger" | "warn" | "info" | "ok" | "live";

const TONE_CLASS: Record<Tone, string> = {
  danger: "border-l-[#e11d48] text-[#e11d48]",
  warn: "border-l-[#f59e0b] text-[#d97706]",
  info: "border-l-[#2b6cb0] text-[#2b6cb0]",
  ok: "border-l-canopy text-canopy-deep",
  live: "border-l-emerald-500 text-emerald-600",
};

function relativeAgo(iso: string | null | undefined) {
  if (!iso) return "Just now";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function dueLabel(iso: string, overdue: boolean) {
  const d = new Date(iso);
  const time = d.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return overdue ? `Overdue · ${time}` : `Due ${time}`;
}

export function QuickModulesPanel({
  deskView,
  callNewCount,
  callNewLeads,
  contactedCount,
  contactedLeads,
  overdueTaskCount,
  dueTodayCount,
  tasks,
  avgResponseMins,
  onlineLeads,
  hotCount,
  hotLeads,
}: {
  deskView: string;
  callNewCount: number;
  callNewLeads: QuickModuleLead[];
  contactedCount: number;
  contactedLeads: QuickModuleLead[];
  overdueTaskCount: number;
  dueTodayCount: number;
  tasks: QuickModuleTask[];
  avgResponseMins: number;
  onlineLeads: Array<
    QuickModuleLead & { lastSeenAt: string | null; isOnline: boolean }
  >;
  hotCount: number;
  hotLeads: QuickModuleLead[];
}) {
  const [openId, setOpenId] = useState<ModuleId | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const titleId = useId();

  const callNewHref = `/agent/leads?view=${deskView}&pipeline=NEW_LEAD`;
  const contactedHref = `/agent/leads?view=${deskView}&pipeline=FOLLOW_UP`;
  const onlineHref = `/agent/leads?view=${deskView}&online=1`;
  const hotHref = "/agent/leads?view=mine";
  const tasksHref = "/agent/tasks";
  const statsHref = "/agent/statistics";

  const profileLeadIds = (() => {
    switch (openId) {
      case "callNew":
        return callNewLeads.map((l) => l.id);
      case "contacted":
        return contactedLeads.map((l) => l.id);
      case "online":
        return onlineLeads.map((l) => l.id);
      case "hot":
        return hotLeads.map((l) => l.id);
      case "tasks":
        return tasks.map((t) => t.lead?.id).filter(Boolean) as string[];
      default:
        return [];
    }
  })();

  useEffect(() => {
    if (!openId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !profileId) setOpenId(null);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [openId, profileId]);

  function openModule(id: ModuleId) {
    setOpenId(id);
  }

  function closeModule() {
    setOpenId(null);
  }

  const openMeta = openId
    ? {
        callNew: {
          title: "Call New Leads",
          eyebrow: "Action required",
          subtitle: `${callNewCount} new lead${callNewCount === 1 ? "" : "s"} to call`,
          href: callNewHref,
          linkLabel: "Open in leads dashboard",
          tone: "danger" as const,
        },
        contacted: {
          title: "Contacted Leads",
          eyebrow: "Follow up",
          subtitle: `${contactedCount} client${contactedCount === 1 ? "" : "s"} to follow up with`,
          href: contactedHref,
          linkLabel: "Open in leads dashboard",
          tone: "danger" as const,
        },
        tasks: {
          title: "Due Tasks",
          eyebrow: "Reminders",
          subtitle: `${overdueTaskCount} Overdue · ${dueTodayCount} Due Today`,
          href: tasksHref,
          linkLabel: "Open tasks page",
          tone: "warn" as const,
        },
        statistics: {
          title: "Statistics",
          eyebrow: "Desk performance",
          subtitle:
            avgResponseMins > 0
              ? `Avg response · ${avgResponseMins} mins`
              : "Avg response · —",
          href: statsHref,
          linkLabel: "Open statistics",
          tone: "info" as const,
        },
        online: {
          title: "Online Leads",
          eyebrow: "Live on site",
          subtitle: `${onlineLeads.length} active in the last 3 minutes`,
          href: onlineHref,
          linkLabel: "Open in leads dashboard",
          tone: "live" as const,
        },
        hot: {
          title: "Hot pipeline",
          eyebrow: "High intent",
          subtitle: `${hotCount} lead${hotCount === 1 ? "" : "s"} scoring hot right now`,
          href: hotHref,
          linkLabel: "Open hot leads",
          tone: "ok" as const,
        },
      }[openId]
    : null;

  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
        <ModuleTrigger
          title="Call New Leads"
          subtitle={`${callNewCount} new leads to call`}
          tone="danger"
          icon={Phone}
          active={openId === "callNew"}
          onClick={() => openModule("callNew")}
        />
        <ModuleTrigger
          title="Contacted Leads"
          subtitle={`${contactedCount} clients to follow up with`}
          tone="danger"
          icon={UserRound}
          active={openId === "contacted"}
          onClick={() => openModule("contacted")}
        />
        <ModuleTrigger
          title="Due Tasks"
          subtitle={`${overdueTaskCount} Overdue | ${dueTodayCount} Due Today`}
          tone="warn"
          icon={CheckCircle2}
          active={openId === "tasks"}
          onClick={() => openModule("tasks")}
        />
        <ModuleTrigger
          title="Statistics"
          subtitle={
            avgResponseMins > 0
              ? `Response Time · ${avgResponseMins} mins`
              : "Response Time · —"
          }
          tone="info"
          icon={Timer}
          active={openId === "statistics"}
          onClick={() => openModule("statistics")}
        />
        <ModuleTrigger
          title="Online Leads"
          subtitle={
            onlineLeads.length === 0
              ? "No leads active on the site right now"
              : `${onlineLeads.length} lead${onlineLeads.length === 1 ? "" : "s"} active on the site`
          }
          tone="live"
          icon={Radio}
          active={openId === "online"}
          onClick={() => openModule("online")}
        />
        <ModuleTrigger
          title="Hot pipeline"
          subtitle={`${hotCount} leads scoring hot right now`}
          tone="ok"
          icon={TrendingUp}
          active={openId === "hot"}
          onClick={() => openModule("hot")}
        />
      </div>

      {openId && openMeta ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-[#0f172a]/55 backdrop-blur-[2px]"
            aria-label={`Close ${openMeta.title}`}
            onClick={closeModule}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[#e2e8f0] bg-white shadow-[0_24px_80px_rgb(15_23_42/0.35)] sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#eef2f6] px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[11px] font-bold uppercase tracking-wide",
                    openMeta.tone === "danger" && "text-[#e11d48]",
                    openMeta.tone === "warn" && "text-[#d97706]",
                    openMeta.tone === "info" && "text-[#2b6cb0]",
                    openMeta.tone === "ok" && "text-canopy",
                    openMeta.tone === "live" && "text-emerald-600",
                  )}
                >
                  {openMeta.eyebrow}
                </p>
                <h2
                  id={titleId}
                  className="mt-0.5 text-[17px] font-bold text-[#1e2a38]"
                >
                  {openMeta.title}
                </h2>
                <p className="mt-0.5 text-[12px] text-[#64748b]">
                  {openMeta.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModule}
                className="rounded-lg p-1.5 text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#334155]"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 sm:px-3">
              {openId === "callNew" ? (
                <LeadList
                  leads={callNewLeads}
                  empty="No new leads to call right now."
                  onSelect={setProfileId}
                />
              ) : null}
              {openId === "contacted" ? (
                <LeadList
                  leads={contactedLeads}
                  empty="No follow-up leads right now."
                  onSelect={setProfileId}
                />
              ) : null}
              {openId === "online" ? (
                <LeadList
                  leads={onlineLeads}
                  empty="Nobody from your desk is on the website right now."
                  onSelect={setProfileId}
                  showOnline
                />
              ) : null}
              {openId === "hot" ? (
                <LeadList
                  leads={hotLeads}
                  empty="No hot-scoring leads right now."
                  onSelect={setProfileId}
                />
              ) : null}
              {openId === "tasks" ? (
                <TaskList
                  tasks={tasks}
                  empty="No open tasks due."
                  onSelectLead={setProfileId}
                />
              ) : null}
              {openId === "statistics" ? (
                <StatisticsBody avgResponseMins={avgResponseMins} />
              ) : null}
            </div>

            <div className="shrink-0 border-t border-[#eef2f6] px-4 py-3 sm:px-5">
              <Link
                href={openMeta.href}
                onClick={closeModule}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2b6cb0] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#255a94]"
              >
                {openMeta.linkLabel}
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {profileId ? (
        <LeadQuickPopup
          leadId={profileId}
          leadIds={profileLeadIds}
          onClose={() => setProfileId(null)}
          onNavigate={setProfileId}
        />
      ) : null}
    </>
  );
}

function ModuleTrigger({
  title,
  subtitle,
  tone,
  icon: Icon,
  active,
  onClick,
}: {
  title: string;
  subtitle: string;
  tone: Tone;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-[#d8dee6] border-l-4 bg-white px-3.5 py-3.5 text-left shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition active:scale-[0.99] hover:bg-[#f8fafc] sm:rounded-md sm:px-3 sm:py-3",
        TONE_CLASS[tone],
        active && "ring-2 ring-[#2b6cb0]/25",
      )}
    >
      <Icon className="size-5 shrink-0" strokeWidth={1.9} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[#1e2a38] sm:text-[13px]">
          {title}
        </p>
        <p className="text-[13px] font-medium text-[#5b6775] sm:text-[12px] sm:font-normal">
          {subtitle}
        </p>
      </div>
      <ChevronRight
        className={cn(
          "size-4 shrink-0 text-[#94a3b8] transition",
          active && "rotate-90 text-[#2b6cb0]",
        )}
      />
    </button>
  );
}

function LeadList({
  leads,
  empty,
  onSelect,
  showOnline = false,
}: {
  leads: Array<
    QuickModuleLead & { lastSeenAt?: string | null; isOnline?: boolean }
  >;
  empty: string;
  onSelect: (id: string) => void;
  showOnline?: boolean;
}) {
  if (leads.length === 0) {
    return (
      <p className="px-3 py-10 text-center text-sm text-[#94a3b8]">{empty}</p>
    );
  }
  return (
    <ul className="space-y-1">
      {leads.map((lead) => {
        const name =
          lead.customer?.name || lead.customer?.email || "Lead";
        return (
          <li key={lead.id}>
            <button
              type="button"
              onClick={() => onSelect(lead.id)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[#f8fafc]"
            >
              {showOnline ? (
                <span className="relative flex size-2.5 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-[#1e2a38]">
                  {name}
                </p>
                <p className="truncate text-[12px] text-[#64748b]">
                  {lead.customer?.email ? `${lead.customer.email} · ` : ""}
                  {pipelineShortLabel(lead.status as LeadStatus)}
                  {lead.meta ? ` · ${lead.meta}` : ""}
                  {showOnline
                    ? ` · ${relativeAgo(lead.lastSeenAt ?? null)}`
                    : ""}
                </p>
              </div>
              {showOnline ? (
                <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  ONLINE
                </span>
              ) : (
                <ChevronRight className="size-4 shrink-0 text-[#cbd5e1]" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TaskList({
  tasks,
  empty,
  onSelectLead,
}: {
  tasks: QuickModuleTask[];
  empty: string;
  onSelectLead: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <p className="px-3 py-10 text-center text-sm text-[#94a3b8]">{empty}</p>
    );
  }
  return (
    <ul className="space-y-1">
      {tasks.map((task) => {
        const name =
          task.lead?.customer?.name ||
          task.lead?.customer?.email ||
          "No linked lead";
        return (
          <li key={task.id}>
            <button
              type="button"
              disabled={!task.lead}
              onClick={() => {
                if (task.lead) onSelectLead(task.lead.id);
              }}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition",
                task.lead
                  ? "hover:bg-[#f8fafc]"
                  : "cursor-default opacity-90",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-[#1e2a38]">
                  {task.title}
                </p>
                <p className="truncate text-[12px] text-[#64748b]">
                  {task.type} · {name}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-[11px] font-semibold",
                    task.overdue ? "text-[#e11d48]" : "text-[#d97706]",
                  )}
                >
                  {dueLabel(task.dueAt, task.overdue)}
                </p>
              </div>
              {task.lead ? (
                <ChevronRight className="mt-1 size-4 shrink-0 text-[#cbd5e1]" />
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function StatisticsBody({ avgResponseMins }: { avgResponseMins: number }) {
  return (
    <div className="space-y-3 px-2 py-3 sm:px-3">
      <StatRow
        label="Average first response"
        value={
          avgResponseMins > 0 ? `${avgResponseMins} minutes` : "Not enough data"
        }
      />
      <p className="rounded-xl bg-[#f8fafc] px-3 py-3 text-[13px] leading-relaxed text-[#64748b]">
        Open the statistics page for SLA, lead volume, and engagement trends
        across your desk.
      </p>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#94a3b8]">
        {label}
      </p>
      <p className="mt-1 text-[18px] font-bold text-[#1e2a38]">{value}</p>
    </div>
  );
}
