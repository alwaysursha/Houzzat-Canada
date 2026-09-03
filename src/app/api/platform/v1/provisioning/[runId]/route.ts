import { PlatformApiError } from "@/lib/platform/api/handler";
import {
  runPlatformRoute,
} from "@/lib/platform/api/route";
import { getPlatformProvisioningRunDetail } from "@/lib/platform/read/provisioning";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { runId } = await context.params;
  return runPlatformRoute(async () => {
    const run = await getPlatformProvisioningRunDetail(runId);
    if (!run) {
      throw new PlatformApiError("Provisioning run not found", 404, "NOT_FOUND");
    }
    return run;
  });
}
