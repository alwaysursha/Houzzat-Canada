import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import {
  ACTIVATE_CUSTOM_DOMAIN_AUTHORIZATION,
  activateMasterCustomDomain,
} from "@/lib/platform/domains/master-custom-domain";
import { ACTIVATE_CUSTOM_DOMAIN_CONFIRMATION } from "@/lib/tenancy/workspace-domain/custom-domain-dns-plan";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workspaceId: string }> };

/**
 * MASTER_ADMIN — mark the domain active only after TXT, Vercel, TLS, and
 * hostname isolation all succeed. Does not edit DNS.
 */
export async function POST(request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    domainId?: unknown;
    confirmation?: unknown;
  } | null;
  return runPlatformRouteWithOperator(async (operator) =>
    activateMasterCustomDomain({
      prisma,
      operatorId: operator.operatorId,
      authorization: ACTIVATE_CUSTOM_DOMAIN_AUTHORIZATION,
      confirmation:
        body?.confirmation === ACTIVATE_CUSTOM_DOMAIN_CONFIRMATION
          ? ACTIVATE_CUSTOM_DOMAIN_CONFIRMATION
          : body?.confirmation,
      workspaceId,
      domainId: typeof body?.domainId === "string" ? body.domainId : "",
    }),
  );
}
