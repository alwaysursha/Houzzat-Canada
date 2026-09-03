import { readPlatformJsonBody } from "@/lib/platform/api/body";
import { PlatformApiError } from "@/lib/platform/api/handler";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { changePlatformProspectStatus } from "@/lib/platform/prospects/manage";
import { getPlatformProspectDetail } from "@/lib/platform/read/prospects";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ prospectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { prospectId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<{ status?: unknown }>(request);
    const result = await changePlatformProspectStatus({
      prospectId,
      status: typeof body.status === "string" ? body.status : "",
      operatorId: operator.operatorId,
    });

    const prospect = await getPlatformProspectDetail(prospectId);
    if (!prospect) {
      throw new PlatformApiError("Prospect not found", 404, "NOT_FOUND");
    }
    return { action: result, prospect };
  });
}
