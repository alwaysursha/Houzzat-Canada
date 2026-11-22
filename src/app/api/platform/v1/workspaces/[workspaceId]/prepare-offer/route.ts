import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { prepareCommercialOfferForWorkspace } from "@/lib/platform/onboarding/manual-tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workspaceId: string }> };

/** MASTER_ADMIN — draft a commercial offer on the existing workspace. Does not send email. */
export async function POST(_request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const result = await prepareCommercialOfferForWorkspace({
      prisma,
      operatorId: operator.operatorId,
      workspaceId,
    });
    return { action: "prepare_commercial_offer", ...result };
  });
}
