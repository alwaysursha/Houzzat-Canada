import { readPlatformJsonBody } from "@/lib/platform/api/body";
import { PlatformApiError } from "@/lib/platform/api/handler";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import {
  addPlatformProspectInternalNote,
  PlatformProspectActionError,
} from "@/lib/platform/prospects/manage";
import { getPlatformProspectDetail } from "@/lib/platform/read/prospects";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ prospectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { prospectId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<{
      type?: unknown;
      body?: unknown;
    }>(request);

    if (body.type !== "NOTE") {
      throw new PlatformProspectActionError(
        "Only NOTE activities can be created in this stage",
        "INVALID_ACTIVITY_TYPE",
        400,
      );
    }

    const result = await addPlatformProspectInternalNote({
      prospectId,
      operatorId: operator.operatorId,
      body: typeof body.body === "string" ? body.body : "",
    });

    const prospect = await getPlatformProspectDetail(prospectId);
    if (!prospect) {
      throw new PlatformApiError("Prospect not found", 404, "NOT_FOUND");
    }
    return { action: result, prospect };
  });
}
