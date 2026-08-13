import dynamic from "next/dynamic";
import { requireAgentContext } from "@/lib/agent";
import { loadAgentStatistics } from "@/lib/agent/statistics";
import { redirect } from "next/navigation";

export const metadata = { title: "Statistics · Agent CRM" };

const ALLOWED_RANGES = new Set([7, 30, 90]);

const AgentStatisticsDashboard = dynamic(
  () =>
    import("@/components/agent/AgentStatisticsDashboard").then(
      (m) => m.AgentStatisticsDashboard,
    ),
  {
    loading: () => <StatisticsChartSkeleton />,
  },
);

function StatisticsChartSkeleton() {
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
              className="h-10 w-12 animate-pulse rounded-md bg-[#1e2a38]/10"
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#d8dee6] bg-white p-3"
          >
            <div className="h-2.5 w-16 animate-pulse rounded bg-[#1e2a38]/10" />
            <div className="mt-3 h-7 w-12 animate-pulse rounded bg-[#1e2a38]/10" />
          </div>
        ))}
      </div>
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

export default async function AgentStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await requireAgentContext();
  if (!ctx) redirect("/auth/sign-in?callbackUrl=/agent/statistics");

  const params = await searchParams;
  const parsed = Number(params.range);
  const rangeDays = ALLOWED_RANGES.has(parsed) ? parsed : 30;

  const data = await loadAgentStatistics(ctx, rangeDays);

  return <AgentStatisticsDashboard data={data} />;
}
