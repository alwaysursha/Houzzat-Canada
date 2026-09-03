import { PlatformApiError } from "@/lib/platform/api/handler";
import {
  runPlatformRoute,
} from "@/lib/platform/api/route";
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
