import { PlatformApiError } from "@/lib/platform/api/handler";
import { readPlatformJsonBody } from "@/lib/platform/api/body";
import {
  runPlatformRoute,
  runPlatformRouteWithOperator,
} from "@/lib/platform/api/route";
import { updateDraftCommercialOffer } from "@/lib/platform/offers";
import { parseCommercialOfferTermsBody } from "@/lib/platform/offers/parse-terms-body";
import { getPlatformOfferDetail } from "@/lib/platform/read/offers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ offerId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { offerId } = await context.params;
  return runPlatformRoute(async () => {
    const offer = await getPlatformOfferDetail(offerId);
    if (!offer) {
      throw new PlatformApiError("Offer not found", 404, "NOT_FOUND");
    }
    return offer;
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { offerId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<Record<string, unknown>>(request);
    const result = await updateDraftCommercialOffer({
      offerId,
      operatorId: operator.operatorId,
      terms: parseCommercialOfferTermsBody(body),
    });
    const offer = await getPlatformOfferDetail(result.offerId);
    return { action: result, offer };
  });
}
