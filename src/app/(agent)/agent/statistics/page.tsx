import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { requireAgentContext } from "@/lib/agent";
import {
  loadAgentStatisticsKpis,
  loadAgentStatisticsSeries,
} from "@/lib/agent/statistics";
import type { AgentStatistics } from "@/lib/agent/statistics-shared";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";

export const metadata = { title: "Statistics · Agent CRM" };

const ALLOWED_RANGES = new Set([7, 30, 90]);

const AgentStatisticsShell = dynamic(
  () =>
    import("@/components/agent/AgentStatisticsDashboard").then(
      (m) => m.AgentStatisticsShell,
    ),
  {
    loading: () => <KpiShellSkeleton />,
  },
);

const AgentStatisticsChartSections = dynamic(
  () =>
    import("@/components/agent/AgentStatisticsDashboard").then(
      (m) => m.AgentStatisticsChartSections,
    ),
  {
    loading: () => <ChartsSkeleton />,
  },
);

function KpiShellSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading statistics">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="h-6 w-36 animate-pulse rounded bg-[#1e2a38]/10" />
          <div className="mt-2 h-3 w-48 animate-pulse rounded bg-[#1e2a38]/10" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-11 min-w-[44px] animate-pulse rounded-md bg-[#1e2a38]/10"
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#d8dee6] bg-white p-3"
          >
            <div className="h-2.5 w-16 animate-pulse rounded bg-[#1e2a38]/10" />
            <div className="mt-3 h-7 w-12 animate-pulse rounded bg-[#1e2a38]/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading charts">
      <div className="rounded-xl border border-[#d8dee6] bg-white p-4">
        <div className="h-3 w-28 animate-pulse rounded bg-[#1e2a38]/10" />
        <div className="mt-4 h-48 animate-pulse rounded-lg bg-[#1e2a38]/8" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#d8dee6] bg-white p-4"
          >
            <div className="h-3 w-24 animate-pulse rounded bg-[#1e2a38]/10" />
            <div className="mt-4 h-40 animate-pulse rounded-lg bg-[#1e2a38]/8" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartsUnavailable() {
  return (
    <div
      className="rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-5 text-[13px] text-[#9f1239]"
      role="alert"
    >
      Charts could not be loaded. KPI totals above are still available — refresh
      to retry the series.
    </div>
  );
}

async function DeferredStatisticsCharts({
  rangeDays,
  shell,
}: {
  rangeDays: number;
  shell: Awaited<ReturnType<typeof loadAgentStatisticsKpis>>;
}) {
  const ctx = await requireAgentContext();
  if (!ctx) return null;

  let series: Awaited<ReturnType<typeof loadAgentStatisticsSeries>>;
  try {
    series = await loadAgentStatisticsSeries(ctx, rangeDays);
  } catch (error) {
    console.error("[agent/statistics] series query failed", error);
    return <ChartsUnavailable />;
  }

  const data: AgentStatistics = {
    scopeLabel: shell.scopeLabel,
    rangeDays: shell.rangeDays,
    kpis: shell.kpis,
    leadsByDay: series.leadsByDay,
    pipeline: shell.pipeline,
    sources: shell.sources,
    inquiryTags: shell.inquiryTags,
    intentMix: shell.intentMix,
    activityByType: shell.activityByType,
    funnel: shell.funnel,
    responseBuckets: shell.responseBuckets,
  };

  return <AgentStatisticsChartSections data={data} />;
}

export default async function AgentStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await requireAgentContext();
  if (!ctx) redirect(await staffSignInRedirectUrl("/agent/statistics"));

  const params = await searchParams;
  const parsed = Number(params.range);
  const rangeDays = ALLOWED_RANGES.has(parsed) ? parsed : 30;

  const shell = await loadAgentStatisticsKpis(ctx, rangeDays);

  return (
    <div className="space-y-4 sm:space-y-5">
      <AgentStatisticsShell data={shell} />
      <Suspense fallback={<ChartsSkeleton />}>
        <DeferredStatisticsCharts rangeDays={rangeDays} shell={shell} />
      </Suspense>
    </div>
  );
}
