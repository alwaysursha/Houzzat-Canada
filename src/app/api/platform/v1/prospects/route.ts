import { readPlatformJsonBody } from "@/lib/platform/api/body";
import {
  runPlatformRoute,
  runPlatformRouteWithOperator,
} from "@/lib/platform/api/route";
import { parsePlatformListParams } from "@/lib/platform/api/pagination";
import {
  createOrReopenPlatformProspect,
} from "@/lib/platform/prospects/manage";
import {
  getPlatformProspectDetail,
  listPlatformProspects,
} from "@/lib/platform/read/prospects";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = parsePlatformListParams(new URL(request.url).searchParams);
  return runPlatformRoute(() => listPlatformProspects(params));
}

export async function POST(request: Request) {
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

    const result = await createOrReopenPlatformProspect({
      contactName: typeof body.contactName === "string" ? body.contactName : "",
      email: typeof body.email === "string" ? body.email : "",
      businessName:
        typeof body.businessName === "string" ? body.businessName : null,
      phone: typeof body.phone === "string" ? body.phone : null,
      brokerageName:
        typeof body.brokerageName === "string" ? body.brokerageName : null,
      estimatedTeamSize:
        typeof body.estimatedTeamSize === "number"
          ? body.estimatedTeamSize
          : body.estimatedTeamSize == null
            ? null
            : Number.NaN,
      region: typeof body.region === "string" ? body.region : null,
      website: typeof body.website === "string" ? body.website : null,
      source: typeof body.source === "string" ? body.source : null,
      notesInternal:
        typeof body.notesInternal === "string" ? body.notesInternal : null,
      operatorId: operator.operatorId,
    });

    const prospect = await getPlatformProspectDetail(result.prospectId);
    return { action: result, prospect };
  });
}
