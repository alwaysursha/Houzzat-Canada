import { getFunnelAnalyticsReport } from "@/lib/platform/funnel-analytics";
import { runPlatformRoute } from "@/lib/platform/api/route";

export const runtime = "nodejs";

/**
 * Phase 2D — Master Admin conversion funnel aggregates.
 * MASTER_ADMIN only via runPlatformRoute → requirePlatformOperator.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const preset = url.searchParams.get("preset");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  return runPlatformRoute(() =>
    getFunnelAnalyticsReport({
      workspaceId,
      preset,
      from,
      to,
    }),
  );
}
