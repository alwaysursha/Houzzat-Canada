"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  ChartColumn,
  CheckSquare,
  Flame,
  Inbox,
  LayoutDashboard,
  LineChart,
  Menu,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Users,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import { QuickModulesPanel } from "@/components/agent/QuickModulesPanel";
import { ContactRequestedPanel } from "@/components/agent/ContactRequestedPanel";
import { LaunchpadTodoCarousel } from "@/components/agent/LaunchpadTodoCarousel";
import { TaskForm, TaskCompleteButton } from "@/components/agent/TaskForm";
import { LeadQuickPopup } from "@/components/agent/LeadQuickPopup";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AgentAvailabilityControl } from "@/components/agent/presence/AgentAvailabilityControl";
import { fetchWithMobileCache, invalidateMobileCache } from "@/lib/mobile/mobile-cache";
import { hardGo } from "@/lib/mobile/nav-back";
import { pipelineLabel, pipelinePillClass } from "@/lib/agent/pipeline";
import { cn } from "@/lib/utils";

type ActiveTab = "launchpad" | "leads" | "tasks" | "calendar";

export function AgentMobileInstantShell({
  initialTab = "launchpad",
  brandDisplayName,
  orgName,
}: {
  initialTab?: ActiveTab;
  brandDisplayName: string;
  orgName: string;
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Launchpad State
  const [launchpadData, setLaunchpadData] = useState<any>(null);
  const [launchpadLoading, setLaunchpadLoading] = useState(true);

  // Leads State
  const [leads, setLeads] = useState<any[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadFilter, setLeadFilter] = useState<"ALL" | "NEW_LEAD" | "FOLLOW_UP" | "ONLINE">("ALL");

  // Tasks State
  const [tasks, setTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  // Selected lead popup
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Load Launchpad Data
  const loadLaunchpad = useCallback(async (force = false) => {
    try {
      setLaunchpadLoading(true);
      const data = await fetchWithMobileCache<any>("/api/agent/launchpad", { forceRefresh: force });
      setLaunchpadData(data);
    } catch (err) {
      console.error("Launchpad load error", err);
    } finally {
      setLaunchpadLoading(false);
    }
  }, []);

  // Load Leads Data
  const loadLeads = useCallback(async (force = false) => {
    try {
      setLeadsLoading(true);
      let url = "/api/agent/leads/list?view=mine";
      if (leadFilter === "NEW_LEAD") url += "&pipeline=NEW_LEAD";
      if (leadFilter === "FOLLOW_UP") url += "&pipeline=FOLLOW_UP";
      if (leadFilter === "ONLINE") url += "&online=1";

      const data = await fetchWithMobileCache<any>(url, { forceRefresh: force });
      if (data.ok) {
        setLeads(data.leads || []);
      }
    } catch (err) {
      console.error("Leads load error", err);
    } finally {
      setLeadsLoading(false);
    }
  }, [leadFilter]);

  // Load Tasks Data
  const loadTasks = useCallback(async (force = false) => {
    try {
      setTasksLoading(true);
      const data = await fetchWithMobileCache<any>("/api/agent/tasks", { forceRefresh: force });
      if (data.tasks) {
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error("Tasks load error", err);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  // Initial tab loading & prefetch
  useEffect(() => {
    loadLaunchpad();
    // Warm background cache for leads & tasks so transitions are 0ms instant
    setTimeout(() => {
      fetchWithMobileCache("/api/agent/leads/list?view=mine").catch(() => {});
      fetchWithMobileCache("/api/agent/tasks").catch(() => {});
    }, 500);
  }, [loadLaunchpad]);

  // Tab change trigger
  useEffect(() => {
    if (activeTab === "leads") {
      loadLeads();
    } else if (activeTab === "tasks") {
      loadTasks();
    }
  }, [activeTab, leadFilter, loadLeads, loadTasks]);

  function switchTab(tab: ActiveTab) {
    startTransition(() => {
      setActiveTab(tab);
    });
  }

  function handleRefresh() {
    invalidateMobileCache();
    if (activeTab === "launchpad") loadLaunchpad(true);
    if (activeTab === "leads") loadLeads(true);
    if (activeTab === "tasks") loadTasks(true);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-mist text-ink">
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-[#d8dee6] bg-[#1e2a38] px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-lg text-white/80 transition active:bg-white/10"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold tracking-tight">
              {brandDisplayName}
            </p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
              {activeTab.toUpperCase()} · {orgName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <AgentAvailabilityControl
            tone="dark"
            compact
            showHint={false}
          />
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex size-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 active:scale-95"
            title="Refresh"
          >
            <RefreshCw className={cn("size-4", (launchpadLoading || leadsLoading || tasksLoading) && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => {
              setLeadFilter("NEW_LEAD");
              switchTab("leads");
            }}
            className="inline-flex h-8 items-center rounded-lg bg-rose-600 px-2.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm active:scale-95"
          >
            Call new
          </button>
        </div>
      </header>

      {/* Main Content Area — Instant Client Render */}
      <main className="min-w-0 flex-1 px-3 py-4 pb-[calc(5.25rem+env(safe-area-inset-bottom))] sm:px-5">
        {/* TAB 1: LAUNCHPAD */}
        {activeTab === "launchpad" && (
          <div className="space-y-4">
            {launchpadData ? (
              <>
                <div className="flex items-center justify-between">
                  <h1 className="font-display text-2xl font-bold text-ink">Launchpad</h1>
                  <span className="text-xs font-semibold text-canopy">
                    Avg Response: {launchpadData.avgResponseMins ?? 0}m
                  </span>
                </div>

                {/* Quick Modules */}
                <QuickModulesPanel
                  deskView={launchpadData.deskView || "mine"}
                  callNewCount={launchpadData.newLeadCount || 0}
                  callNewLeads={launchpadData.callNewLeads || []}
                  contactedCount={launchpadData.contactedCount || 0}
                  contactedLeads={launchpadData.contactedLeads || []}
                  overdueTaskCount={launchpadData.overdueTaskCount || 0}
                  dueTodayCount={launchpadData.dueTodayCount || 0}
                  tasks={launchpadData.openTasks || []}
                  avgResponseMins={launchpadData.avgResponseMins || 0}
                  onlineLeads={launchpadData.onlineLeads || []}
                  hotCount={launchpadData.hotCount || 0}
                  hotLeads={launchpadData.hotLeads || []}
                  unreadMessageCount={launchpadData.unreadMessageCount || 0}
                  unreadConversationCount={
                    launchpadData.unreadConversationCount || 0
                  }
                  unreadMessages={launchpadData.unreadMessages || []}
                />

                {/* Todo Carousel */}
                <LaunchpadTodoCarousel
                  totalOpen={launchpadData.openTasks?.length || 0}
                  tasks={launchpadData.todoTasks || []}
                />

                {/* Contact Requested Panel */}
                <ContactRequestedPanel leads={launchpadData.contactRequested || []} />
              </>
            ) : (
              <div className="space-y-3 py-8 text-center">
                <div className="mx-auto size-8 animate-spin rounded-full border-2 border-canopy border-t-transparent" />
                <p className="text-sm text-ink/60">Loading your Launchpad…</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LEADS */}
        {activeTab === "leads" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="font-display text-2xl font-bold text-ink">Leads</h1>
              <span className="text-xs font-semibold text-ink/60">{leads.length} leads</span>
            </div>

            {/* Quick Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setLeadFilter("ALL")}
                className={cn(
                  "rounded-full px-3 py-1 font-semibold transition",
                  leadFilter === "ALL" ? "bg-[#1e2a38] text-white" : "bg-white text-ink/70 border border-line"
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setLeadFilter("NEW_LEAD")}
                className={cn(
                  "rounded-full px-3 py-1 font-semibold transition",
                  leadFilter === "NEW_LEAD" ? "bg-rose-600 text-white" : "bg-white text-ink/70 border border-line"
                )}
              >
                New Leads
              </button>
              <button
                type="button"
                onClick={() => setLeadFilter("FOLLOW_UP")}
                className={cn(
                  "rounded-full px-3 py-1 font-semibold transition",
                  leadFilter === "FOLLOW_UP" ? "bg-amber-600 text-white" : "bg-white text-ink/70 border border-line"
                )}
              >
                Follow Up
              </button>
              <button
                type="button"
                onClick={() => setLeadFilter("ONLINE")}
                className={cn(
                  "flex items-center gap-1 rounded-full px-3 py-1 font-semibold transition",
                  leadFilter === "ONLINE" ? "bg-emerald-600 text-white" : "bg-white text-ink/70 border border-line"
                )}
              >
                <Zap className="size-3" />
                Online
              </button>
            </div>

            {/* Leads List */}
            {leadsLoading && leads.length === 0 ? (
              <div className="space-y-3 py-8 text-center">
                <div className="mx-auto size-8 animate-spin rounded-full border-2 border-canopy border-t-transparent" />
                <p className="text-sm text-ink/60">Loading leads…</p>
              </div>
            ) : leads.length === 0 ? (
              <div className="rounded-xl border border-line bg-white p-8 text-center text-sm text-ink/60">
                No leads found in this view.
              </div>
            ) : (
              <div className="space-y-2.5">
                {leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3.5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="text-left font-semibold text-ink hover:underline"
                        >
                          {lead.customer?.name || lead.customer?.email || "Unnamed Lead"}
                        </button>
                        <p className="truncate text-xs text-ink/60">
                          {lead.customer?.phone || lead.customer?.email}
                        </p>
                      </div>
                      <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", pipelinePillClass(lead.status))}>
                        {pipelineLabel(lead.status)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-line/60 pt-2 text-[11px] text-ink/60">
                      <div className="flex items-center gap-2">
                        {lead.hotness > 0 && (
                          <span className="flex items-center gap-0.5 font-bold text-amber-600">
                            <Flame className="size-3.5" />
                            {lead.hotness}
                          </span>
                        )}
                        <span>{lead.source}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedLeadId(lead.id)}
                        className="font-semibold text-canopy hover:underline"
                      >
                        Open Profile →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TASKS */}
        {activeTab === "tasks" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="font-display text-2xl font-bold text-ink">Tasks & Reminders</h1>
              <span className="text-xs font-semibold text-ink/60">{tasks.length} open</span>
            </div>

            <TaskForm compact onUpdated={() => loadTasks(true)} />

            {tasksLoading && tasks.length === 0 ? (
              <div className="space-y-3 py-8 text-center">
                <div className="mx-auto size-8 animate-spin rounded-full border-2 border-canopy border-t-transparent" />
                <p className="text-sm text-ink/60">Loading tasks…</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="rounded-xl border border-line bg-white p-8 text-center text-sm text-ink/60">
                All caught up! No tasks scheduled.
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-line bg-white p-3.5 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{task.title}</p>
                      {task.lead && (
                        <p className="truncate text-xs text-ink/60">
                          Lead: {task.lead.customer?.name || task.lead.customer?.email}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] font-semibold text-amber-600">
                        Due: {new Date(task.dueAt).toLocaleDateString()} {new Date(task.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <TaskCompleteButton taskId={task.id} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CALENDAR / MORE */}
        {activeTab === "calendar" && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold text-ink">Appointments</h1>
            <div className="rounded-xl border border-line bg-white p-6 text-center text-sm text-ink/60">
              <CalendarDays className="mx-auto mb-2 size-8 text-canopy/60" />
              <p>Appointments and sync calendar view.</p>
              <Link
                href="/agent/appointments"
                className="mt-4 inline-block rounded-lg bg-canopy px-4 py-2 text-xs font-bold uppercase tracking-wider text-white"
              >
                Open Full Schedule
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Fixed Bottom Navigation Tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line/80 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          <button
            type="button"
            onClick={() => switchTab("launchpad")}
            className={cn(
              "flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition",
              activeTab === "launchpad" ? "text-canopy" : "text-ink/45"
            )}
          >
            <span className={cn("flex size-8 items-center justify-center rounded-xl transition", activeTab === "launchpad" ? "bg-canopy/12" : "bg-transparent")}>
              <LayoutDashboard className="size-[18px]" strokeWidth={activeTab === "launchpad" ? 2.2 : 1.85} />
            </span>
            Launchpad
          </button>

          <button
            type="button"
            onClick={() => switchTab("leads")}
            className={cn(
              "flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition",
              activeTab === "leads" ? "text-canopy" : "text-ink/45"
            )}
          >
            <span className={cn("flex size-8 items-center justify-center rounded-xl transition", activeTab === "leads" ? "bg-canopy/12" : "bg-transparent")}>
              <Users className="size-[18px]" strokeWidth={activeTab === "leads" ? 2.2 : 1.85} />
            </span>
            Leads
          </button>

          <a
            href="/agent/chats"
            onClick={(event) => {
              event.preventDefault();
              hardGo("/agent/chats");
            }}
            className="flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold text-ink/45 transition"
          >
            <span className="flex size-8 items-center justify-center rounded-xl bg-transparent">
              <MessageCircle className="size-[18px]" strokeWidth={1.85} />
            </span>
            Chats
          </a>

          <button
            type="button"
            onClick={() => switchTab("calendar")}
            className={cn(
              "flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition",
              activeTab === "calendar" ? "text-canopy" : "text-ink/45"
            )}
          >
            <span className={cn("flex size-8 items-center justify-center rounded-xl transition", activeTab === "calendar" ? "bg-canopy/12" : "bg-transparent")}>
              <CalendarDays className="size-[18px]" strokeWidth={activeTab === "calendar" ? 2.2 : 1.85} />
            </span>
            Calendar
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition",
              menuOpen || activeTab === "tasks" ? "text-canopy" : "text-ink/45"
            )}
          >
            <span className={cn("flex size-8 items-center justify-center rounded-xl transition", menuOpen || activeTab === "tasks" ? "bg-canopy/12" : "bg-transparent")}>
              <Menu className="size-[18px]" strokeWidth={menuOpen || activeTab === "tasks" ? 2.2 : 1.85} />
            </span>
            More
          </button>
        </div>
      </nav>

      {/* Drawer for More Navigation */}
      {menuOpen && (
        <div className="fixed inset-0 z-[70]">
          <div
            className="absolute inset-0 bg-[#0b1220]/55 backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(19rem,88vw)] flex-col bg-[#1e2a38] text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <p className="font-display text-base font-bold text-white">{brandDisplayName}</p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  switchTab("tasks");
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/80 hover:bg-white/10"
              >
                <CheckSquare className="size-4" />
                Tasks
              </button>
              <Link
                href="/agent/statistics"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                <ChartColumn className="size-4" />
                Statistics
              </Link>
              <Link
                href="/agent/inbox"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                <Inbox className="size-4" />
                Communications
              </Link>
              <Link
                href="/agent/cma"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                <LineChart className="size-4" />
                CMA
              </Link>
              <Link
                href="/agent/team"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                <UsersRound className="size-4" />
                Team
              </Link>
              <Link
                href="/agent/notifications"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                <Bell className="size-4" />
                Notifications
              </Link>
              <Link
                href="/agent/search"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                <Search className="size-4" />
                Properties
              </Link>
            </nav>
            <div className="border-t border-white/10 p-4">
              <Link
                href="/agent/profile"
                onClick={() => setMenuOpen(false)}
                className="mb-3 block text-sm font-medium text-white/80 hover:text-white"
              >
                Profile
              </Link>
              <SignOutButton className="text-sm font-medium text-rose-300 hover:text-rose-200" />
            </div>
          </aside>
        </div>
      )}

      {/* Lead Profile Popup Modal */}
      {selectedLeadId ? (
        <LeadQuickPopup
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
        />
      ) : null}
    </div>
  );
}
