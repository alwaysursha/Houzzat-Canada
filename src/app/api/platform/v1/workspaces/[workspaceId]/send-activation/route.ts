import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { sendOwnerActivationEmail } from "@/lib/platform/activation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

/** MASTER_ADMIN — send (or rotate) owner activation email. Fallback after auto-send. */
export async function POST(_request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const result = await sendOwnerActivationEmail({
      workspaceId,
      operatorId: operator.operatorId,
    });
    return { action: "send_owner_activation", ...result };
  });
}
