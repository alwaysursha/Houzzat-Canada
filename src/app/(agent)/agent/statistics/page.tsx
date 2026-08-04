import { AgentStatisticsDashboard } from "@/components/agent/AgentStatisticsDashboard";
import { requireAgentContext } from "@/lib/agent";
import { loadAgentStatistics } from "@/lib/agent/statistics";
import { redirect } from "next/navigation";

export const metadata = { title: "Statistics · Agent CRM" };

const ALLOWED_RANGES = new Set([7, 30, 90]);

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
