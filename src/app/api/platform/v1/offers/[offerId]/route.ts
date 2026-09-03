import { PlatformApiError } from "@/lib/platform/api/handler";
import {
  runPlatformRoute,
} from "@/lib/platform/api/route";
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
