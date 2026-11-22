import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import {
  VERIFY_CUSTOM_DOMAIN_AUTHORIZATION,
  verifyMasterCustomDomainOwnership,
} from "@/lib/platform/domains/master-custom-domain";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workspaceId: string }> };

/** MASTER_ADMIN — TXT ownership check. Leaves the domain pending. */
export async function POST(request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const body = (await request.json().catch(() => null)) as { domainId?: unknown } | null;
  return runPlatformRouteWithOperator(async (operator) =>
    verifyMasterCustomDomainOwnership({
      prisma,
      operatorId: operator.operatorId,
      authorization: VERIFY_CUSTOM_DOMAIN_AUTHORIZATION,
      workspaceId,
      domainId: typeof body?.domainId === "string" ? body.domainId : "",
    }),
  );
}
