import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { sendPreparedPaymentInvitation } from "@/lib/platform/onboarding/manual-tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workspaceId: string }> };

/** MASTER_ADMIN — send the payment invitation. Not called by prepare. */
export async function POST(_request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const result = await sendPreparedPaymentInvitation({
      prisma,
      operatorId: operator.operatorId,
      workspaceId,
    });
    return { action: "send_payment_invitation", ...result };
  });
}
