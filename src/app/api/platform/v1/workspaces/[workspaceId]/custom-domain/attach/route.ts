import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import {
  ATTACH_CUSTOM_DOMAIN_AUTHORIZATION,
  attachMasterCustomDomain,
} from "@/lib/platform/domains/master-custom-domain";
import { ATTACH_CUSTOM_DOMAIN_CONFIRMATION } from "@/lib/tenancy/workspace-domain/custom-domain-dns-plan";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workspaceId: string }> };

/** MASTER_ADMIN — add the hostname to the shared Vercel project. Does not activate or edit DNS. */
export async function POST(request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    domainId?: unknown;
    confirmation?: unknown;
  } | null;
  return runPlatformRouteWithOperator(async (operator) =>
    attachMasterCustomDomain({
      prisma,
      operatorId: operator.operatorId,
      authorization: ATTACH_CUSTOM_DOMAIN_AUTHORIZATION,
      confirmation:
        body?.confirmation === ATTACH_CUSTOM_DOMAIN_CONFIRMATION
          ? ATTACH_CUSTOM_DOMAIN_CONFIRMATION
          : body?.confirmation,
      workspaceId,
      domainId: typeof body?.domainId === "string" ? body.domainId : "",
    }),
  );
}
