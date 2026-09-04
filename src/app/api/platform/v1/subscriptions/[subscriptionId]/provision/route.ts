import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import { retryPaidSubscriptionProvisioning } from "@/lib/platform/provisioning";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ subscriptionId: string }>;
};

/**
 * Master Admin — start or retry paid subscription workspace provisioning.
 * Does not hardcode subscription IDs; uses the route param.
 */
export async function POST(_request: Request, context: RouteContext) {
  const { subscriptionId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const result = await retryPaidSubscriptionProvisioning({
      subscriptionId,
      operatorId: operator.operatorId,
    });

    return {
      action: "retry_provisioning",
      outcome: result.outcome,
      runId: result.runId,
      workspaceId: result.workspaceId,
    };
  });
}
