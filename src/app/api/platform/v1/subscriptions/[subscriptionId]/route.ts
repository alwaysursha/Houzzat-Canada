import { PlatformApiError } from "@/lib/platform/api/handler";
import {
  runPlatformRoute,
} from "@/lib/platform/api/route";
import { getPlatformSubscriptionDetail } from "@/lib/platform/read/subscriptions";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ subscriptionId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { subscriptionId } = await context.params;
  return runPlatformRoute(async () => {
    const subscription = await getPlatformSubscriptionDetail(subscriptionId);
    if (!subscription) {
      throw new PlatformApiError("Subscription not found", 404, "NOT_FOUND");
    }
    return subscription;
  });
}
