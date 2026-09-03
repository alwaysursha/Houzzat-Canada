import { readPlatformJsonBody } from "@/lib/platform/api/body";
import {
  runPlatformRoute,
  runPlatformRouteWithOperator,
} from "@/lib/platform/api/route";
import { parsePlatformListParams } from "@/lib/platform/api/pagination";
import {
  createDraftCommercialOffer,
  CommercialOfferActionError,
} from "@/lib/platform/offers";
import { parseCommercialOfferTermsBody } from "@/lib/platform/offers/parse-terms-body";
import {
  getPlatformOfferDetail,
  listPlatformOffers,
} from "@/lib/platform/read/offers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = parsePlatformListParams(new URL(request.url).searchParams);
  return runPlatformRoute(() => listPlatformOffers(params));
}

export async function POST(request: Request) {
  return runPlatformRouteWithOperator(async (operator) => {
    const body = await readPlatformJsonBody<Record<string, unknown>>(request);
    const prospectId =
      typeof body.prospectId === "string" ? body.prospectId.trim() : "";
    if (!prospectId) {
      throw new CommercialOfferActionError(
        "Prospect is required.",
        "PROSPECT_REQUIRED",
      );
    }

    const result = await createDraftCommercialOffer({
      prospectId,
      operatorId: operator.operatorId,
      terms: parseCommercialOfferTermsBody(body),
    });

    const offer = await getPlatformOfferDetail(result.offerId);
    return { action: result, offer };
  });
}
