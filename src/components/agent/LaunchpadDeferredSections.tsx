import { Suspense } from "react";
import { ContactRequestedPanel } from "@/components/agent/ContactRequestedPanel";
import { QuickModulesPanel } from "@/components/agent/QuickModulesPanel";
import type { QuickModuleLead, QuickModuleTask } from "@/components/agent/QuickModulesPanel";
import type { AgentOrgContext } from "@/lib/agent";
import {
  loadLaunchpadAvgResponseMins,
  loadLaunchpadContactRequested,
  loadLaunchpadHotLeads,
  loadLaunchpadOnlineLeads,
} from "@/lib/agent/launchpad-deferred";

function ModuleCardSkeleton() {
  return (
    <div className="rounded-xl border border-[#d8dee6] bg-white p-3.5 shadow-sm">
      <div className="h-2.5 w-20 animate-pulse rounded bg-[#1e2a38]/10" />
      <div className="mt-3 h-4 w-40 animate-pulse rounded bg-[#1e2a38]/10" />
      <div className="mt-2 h-2.5 w-28 animate-pulse rounded bg-[#1e2a38]/10" />
    </div>
  );
}

export function LaunchpadQuickModulesSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading quick modules">
      {Array.from({ length: 4 }).map((_, i) => (
        <ModuleCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function LaunchpadContactSkeleton() {
  return (
    <div
      className="rounded-xl border border-[#d8dee6] bg-white p-4 shadow-sm"
      aria-busy="true"
      aria-label="Loading contact requests"
    >
      <div className="h-3 w-36 animate-pulse rounded bg-[#1e2a38]/10" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-10 shrink-0 animate-pulse rounded-full bg-[#1e2a38]/10" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-[55%] animate-pulse rounded bg-[#1e2a38]/10" />
              <div className="h-2.5 w-[35%] animate-pulse rounded bg-[#1e2a38]/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function LaunchpadQuickModulesBody({
  ctx,
  deskView,
  focusAgentId,
  callNewCount,
  callNewLeads,
  contactedCount,
  contactedLeads,
  overdueTaskCount,
  dueTodayCount,
  tasks,
}: {
  ctx: AgentOrgContext;
  deskView: "mine" | "team";
  focusAgentId: string | null;
  callNewCount: number;
  callNewLeads: QuickModuleLead[];
  contactedCount: number;
  contactedLeads: QuickModuleLead[];
  overdueTaskCount: number;
  dueTodayCount: number;
  tasks: QuickModuleTask[];
}) {
  const [avgResponseMins, onlineLeads, hot] = await Promise.all([
    loadLaunchpadAvgResponseMins({
      organizationId: ctx.organizationId,
      focusAgentId,
      canSeeTeamLeads: ctx.canSeeTeamLeads,
      userId: ctx.user.id,
    }),
    loadLaunchpadOnlineLeads({ ctx, deskView, focusAgentId }),
    loadLaunchpadHotLeads(ctx),
  ]);

  return (
    <QuickModulesPanel
      deskView={deskView}
      callNewCount={callNewCount}
      callNewLeads={callNewLeads}
      contactedCount={contactedCount}
      contactedLeads={contactedLeads}
      overdueTaskCount={overdueTaskCount}
      dueTodayCount={dueTodayCount}
      tasks={tasks}
      avgResponseMins={avgResponseMins}
      onlineLeads={onlineLeads}
      hotCount={hot.hotCount}
      hotLeads={hot.hotLeads}
    />
  );
}

async function LaunchpadContactBody({
  ctx,
  focusAgentId,
}: {
  ctx: AgentOrgContext;
  focusAgentId: string | null;
}) {
  const leads = await loadLaunchpadContactRequested({ ctx, focusAgentId });
  return <ContactRequestedPanel leads={leads} />;
}

export function LaunchpadDeferredQuickModules(
  props: {
    ctx: AgentOrgContext;
    deskView: "mine" | "team";
    focusAgentId: string | null;
    callNewCount: number;
    callNewLeads: QuickModuleLead[];
    contactedCount: number;
    contactedLeads: QuickModuleLead[];
    overdueTaskCount: number;
    dueTodayCount: number;
    tasks: QuickModuleTask[];
  },
) {
  return (
    <Suspense fallback={<LaunchpadQuickModulesSkeleton />}>
      <LaunchpadQuickModulesBody {...props} />
    </Suspense>
  );
}

export function LaunchpadDeferredContact(props: {
  ctx: AgentOrgContext;
  focusAgentId: string | null;
}) {
  return (
    <Suspense fallback={<LaunchpadContactSkeleton />}>
      <LaunchpadContactBody {...props} />
    </Suspense>
  );
}
