import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import {
  PREPARE_CUSTOM_DOMAIN_AUTHORIZATION,
  listMasterCustomDomains,
  prepareMasterCustomDomain,
} from "@/lib/platform/domains/master-custom-domain";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workspaceId: string }> };

/** MASTER_ADMIN — list custom-domain instructions. Does not change DNS or activation. */
export async function GET(_request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) =>
    listMasterCustomDomains({
      prisma,
      operatorId: operator.operatorId,
      workspaceId,
    }),
  );
}

/** MASTER_ADMIN — claim apex and www as pending. Does not attach, activate, or edit DNS. */
export async function POST(request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const body = (await request.json().catch(() => null)) as { hostname?: unknown } | null;
  return runPlatformRouteWithOperator(async (operator) =>
    prepareMasterCustomDomain({
      prisma,
      operatorId: operator.operatorId,
      authorization: PREPARE_CUSTOM_DOMAIN_AUTHORIZATION,
      workspaceId,
      hostname: typeof body?.hostname === "string" ? body.hostname : "",
    }),
  );
}
