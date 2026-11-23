import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import {
  inspectOwnerSignatureProfile,
  updateOwnerSignatureProfile,
} from "@/lib/platform/agent/owner-signature-profile";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workspaceId: string }> };

/** MASTER_ADMIN — read the owner agent signature profile. Does not send email. */
export async function GET(_request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  return runPlatformRouteWithOperator(async () =>
    inspectOwnerSignatureProfile(prisma, workspaceId),
  );
}

/** MASTER_ADMIN — save designation, brokerage, or cell without clearing omitted fields. */
export async function PATCH(request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    designation?: unknown;
    brokerageName?: unknown;
    phone?: unknown;
  } | null;
  return runPlatformRouteWithOperator(async () =>
    updateOwnerSignatureProfile(prisma, workspaceId, body ?? {}),
  );
}
