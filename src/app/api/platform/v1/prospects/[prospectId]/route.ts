import { readPlatformJsonBody } from "@/lib/platform/api/body";
import { PlatformApiError } from "@/lib/platform/api/handler";
import {
  runPlatformRoute,
  runPlatformRouteWithOperator,
} from "@/lib/platform/api/route";
import { updatePlatformProspect } from "@/lib/platform/prospects/manage";
import { getPlatformProspectDetail } from "@/lib/platform/read/prospects";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ prospectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { prospectId } = await context.params;
  return runPlatformRoute(async () => {
    const prospect = await getPlatformProspectDetail(prospectId);
    if (!prospect) {
      throw new PlatformApiError("Prospect not found", 404, "NOT_FOUND");
    }
    return prospect;
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { prospectId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<{
      contactName?: unknown;
      email?: unknown;
      businessName?: unknown;
      phone?: unknown;
      brokerageName?: unknown;
      estimatedTeamSize?: unknown;
      region?: unknown;
      website?: unknown;
      source?: unknown;
      notesInternal?: unknown;
    }>(request);

    const result = await updatePlatformProspect({
      prospectId,
      operatorId: operator.operatorId,
      ...(typeof body.contactName === "string"
        ? { contactName: body.contactName }
        : {}),
      ...(typeof body.email === "string" ? { email: body.email } : {}),
      ...(body.businessName === null || typeof body.businessName === "string"
        ? { businessName: body.businessName }
        : {}),
      ...(body.phone === null || typeof body.phone === "string"
        ? { phone: body.phone }
        : {}),
      ...(body.brokerageName === null || typeof body.brokerageName === "string"
        ? { brokerageName: body.brokerageName }
        : {}),
      ...(body.estimatedTeamSize === null ||
      typeof body.estimatedTeamSize === "number"
        ? { estimatedTeamSize: body.estimatedTeamSize }
        : {}),
      ...(body.region === null || typeof body.region === "string"
        ? { region: body.region }
        : {}),
      ...(body.website === null || typeof body.website === "string"
        ? { website: body.website }
        : {}),
      ...(typeof body.source === "string" ? { source: body.source } : {}),
      ...(body.notesInternal === null || typeof body.notesInternal === "string"
        ? { notesInternal: body.notesInternal }
        : {}),
    });

    const prospect = await getPlatformProspectDetail(prospectId);
    if (!prospect) {
      throw new PlatformApiError("Prospect not found", 404, "NOT_FOUND");
    }
    return { action: result, prospect };
  });
}
