import { readPlatformJsonBody } from "@/lib/platform/api/body";
import { PlatformApiError } from "@/lib/platform/api/handler";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { applyPlatformProspectDemoAction } from "@/lib/platform/prospects/manage";
import { getPlatformProspectDetail } from "@/lib/platform/read/prospects";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ prospectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { prospectId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<{
      action?: unknown;
      scheduledAt?: unknown;
      note?: unknown;
    }>(request);

    const result = await applyPlatformProspectDemoAction({
      prospectId,
      operatorId: operator.operatorId,
      action: typeof body.action === "string" ? body.action : "",
      scheduledAt:
        typeof body.scheduledAt === "string" ? body.scheduledAt : null,
      note: typeof body.note === "string" ? body.note : null,
    });

    const prospect = await getPlatformProspectDetail(prospectId);
    if (!prospect) {
      throw new PlatformApiError("Prospect not found", 404, "NOT_FOUND");
    }
    return { action: result, prospect };
  });
}
