"use client";

import { useState, type ReactNode } from "react";
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

  function toggle(id: ModuleId) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  const modules: Array<{
    id: ModuleId;
    title: string;
    subtitle: string;
    tone: Tone;
    icon: LucideIcon;
    href: string;
    linkLabel: string;
    body: ReactNode;
  }> = [
    {
      id: "callNew",
      title: "Call New Leads",
      subtitle: `${callNewCount} new leads to call`,
      tone: "danger",
      icon: Phone,
      href: callNewHref,
      linkLabel: "Open in leads dashboard",
      body: (
        <LeadList
          leads={callNewLeads}
          empty="No new leads to call right now."
          onSelect={setProfileId}
        />
      ),
    },
    {
      id: "contacted",
      title: "Contacted Leads",
      subtitle: `${contactedCount} clients to follow up with`,
      tone: "danger",
      icon: UserRound,
      href: contactedHref,
      linkLabel: "Open in leads dashboard",
      body: (
        <LeadList
          leads={contactedLeads}
          empty="No follow-up leads right now."
          onSelect={setProfileId}
        />
      ),
    },
    {
      id: "tasks",
      title: "Due Tasks",
      subtitle: `${overdueTaskCount} Overdue | ${dueTodayCount} Due Today`,
      tone: "warn",
      icon: CheckCircle2,
      href: tasksHref,
      linkLabel: "Open tasks page",
      body: (
        <TaskList
          tasks={tasks}
          empty="No open tasks due."
          onSelectLead={setProfileId}
        />
      ),
    },
    {
      id: "statistics",
      title: "Statistics",
      subtitle:
        avgResponseMins > 0
          ? `Response Time · ${avgResponseMins} mins`
          : "Response Time · —",
      tone: "info",
      icon: Timer,
      href: statsHref,
      linkLabel: "Open statistics",
      body: <StatisticsBody avgResponseMins={avgResponseMins} />,
    },
    {
      id: "online",
      title: "Online Leads",
      subtitle:
        onlineLeads.length === 0
          ? "No leads active on the site right now"
          : `${onlineLeads.length} lead${onlineLeads.length === 1 ? "" : "s"} active on the site`,
      tone: "live",
      icon: Radio,
      href: onlineHref,
      linkLabel: "Open in leads dashboard",
      body: (
        <LeadList
          leads={onlineLeads}
          empty="Nobody from your desk is on the website right now."
          onSelect={setProfileId}
          showOnline
        />
      ),
    },
    {
      id: "hot",
      title: "Hot pipeline",
      subtitle: `${hotCount} leads scoring hot right now`,
      tone: "ok",
      icon: TrendingUp,
      href: hotHref,
      linkLabel: "Open hot leads",
      body: (
        <LeadList
          leads={hotLeads}
          empty="No hot-scoring leads right now."
          onSelect={setProfileId}
        />
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {modules.map((mod) => {
          const open = openId === mod.id;
          return (
            <div
              key={mod.id}
              className={cn(
                "overflow-hidden rounded-xl border border-[#d8dee6] bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-shadow duration-300",
                open && "relative z-10 shadow-[0_8px_28px_rgb(15_23_42/0.12)]",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(mod.id)}
                aria-expanded={open}
                className={cn(
                  "flex w-full items-center gap-3 border-l-4 px-3.5 py-3.5 text-left transition hover:bg-[#f8fafc] sm:px-3 sm:py-3",
                  TONE_CLASS[mod.tone],
                )}
              >
                <mod.icon className="size-5 shrink-0" strokeWidth={1.9} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[#1e2a38] sm:text-[13px]">
                    {mod.title}
                  </p>
                  <p className="text-[13px] font-medium text-[#5b6775] sm:text-[12px] sm:font-normal">
                    {mod.subtitle}
                  </p>
                </div>
                <ChevronRight
                  className={cn(
                    "size-4 shrink-0 text-[#94a3b8] transition-transform duration-300 ease-out",
                    open && "rotate-90 text-[#2b6cb0]",
                  )}
                />
              </button>

              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                  open
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className={cn(
                      "border-t border-[#eef2f6] bg-[#fbfcfd] transition-transform duration-300 ease-out",
                      open ? "translate-y-0" : "-translate-y-1",
                    )}
                  >
                    <div className="max-h-[min(50vh,360px)] overflow-y-auto overscroll-contain px-1.5 py-1.5 sm:px-2">
                      {mod.body}
                    </div>
                    <div className="border-t border-[#eef2f6] bg-white px-3 py-2.5">
                      <Link
                        href={mod.href}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2b6cb0] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-[#255a94]"
                      >
                        {mod.linkLabel}
                        <ChevronRight className="size-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
      <p className="px-3 py-8 text-center text-sm text-[#94a3b8]">{empty}</p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {leads.map((lead) => {
        const name =
          lead.customer?.name || lead.customer?.email || "Lead";
        return (
          <li key={lead.id}>
            <button
              type="button"
              onClick={() => onSelect(lead.id)}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-white"
            >
              {showOnline ? (
                <span className="relative flex size-2.5 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[#1e2a38]">
                  {name}
                </p>
                <p className="truncate text-[11px] text-[#64748b]">
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
                <ChevronRight className="size-3.5 shrink-0 text-[#cbd5e1]" />
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
      <p className="px-3 py-8 text-center text-sm text-[#94a3b8]">{empty}</p>
    );
  }
  return (
    <ul className="space-y-0.5">
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
                "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition",
                task.lead
                  ? "hover:bg-white"
                  : "cursor-default opacity-90",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[#1e2a38]">
                  {task.title}
                </p>
                <p className="truncate text-[11px] text-[#64748b]">
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
                <ChevronRight className="mt-1 size-3.5 shrink-0 text-[#cbd5e1]" />
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
    <div className="space-y-2 px-2 py-2">
      <StatRow
        label="Average first response"
        value={
          avgResponseMins > 0 ? `${avgResponseMins} minutes` : "Not enough data"
        }
      />
      <p className="rounded-lg bg-white px-3 py-2.5 text-[12px] leading-relaxed text-[#64748b] ring-1 ring-[#eef2f6]">
        Open statistics for SLA, lead volume, and engagement trends.
      </p>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-[#eef2f6]">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
        {label}
      </p>
      <p className="mt-0.5 text-[16px] font-bold text-[#1e2a38]">{value}</p>
    </div>
  );
}
