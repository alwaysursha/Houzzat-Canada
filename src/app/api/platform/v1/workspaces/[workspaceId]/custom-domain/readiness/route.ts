import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { inspectMasterCustomDomainReadiness } from "@/lib/platform/domains/master-custom-domain";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workspaceId: string }> };

/** MASTER_ADMIN — read Vercel and routing state. Does not attach or activate. */
export async function POST(request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const body = (await request.json().catch(() => null)) as { domainId?: unknown } | null;
  return runPlatformRouteWithOperator(async (operator) =>
    inspectMasterCustomDomainReadiness({
      prisma,
      operatorId: operator.operatorId,
      workspaceId,
      domainId: typeof body?.domainId === "string" ? body.domainId : "",
    }),
  );
}
