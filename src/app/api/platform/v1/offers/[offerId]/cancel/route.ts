import {
  runPlatformRouteWithOperator,
} from "@/lib/platform/api/route";
import { cancelCommercialOffer } from "@/lib/platform/offers";
import { getPlatformOfferDetail } from "@/lib/platform/read/offers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ offerId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { offerId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const result = await cancelCommercialOffer({
      offerId,
      operatorId: operator.operatorId,
    });
    const offer = await getPlatformOfferDetail(result.offerId);
    return { action: result, offer };
  });
}
