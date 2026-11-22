import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import {
  PREPARE_TENANT_WORKSPACE_AUTHORIZATION,
  prepareManualTenantWorkspace,
} from "@/lib/platform/onboarding/manual-tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workspaceId: string }> };

/** MASTER_ADMIN — reuse or create a tenant workspace. Does not send email. */
export async function POST(_request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const result = await prepareManualTenantWorkspace({
      prisma,
      operatorId: operator.operatorId,
      authorization: PREPARE_TENANT_WORKSPACE_AUTHORIZATION,
      workspaceId,
    });
    return { action: "prepare_tenant_workspace", ...result };
  });
}
