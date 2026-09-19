import {
  runPlatformRouteWithOperator,
} from "@/lib/platform/api/route";
import {
  notifyOfferInvitationEmail,
  offerInvitationSendNotice,
  sendCommercialOffer,
} from "@/lib/platform/offers";
import { getPlatformOfferDetail } from "@/lib/platform/read/offers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ offerId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { offerId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const result = await sendCommercialOffer({
      offerId,
      operatorId: operator.operatorId,
    });

    let invitationEmail: {
      status: "sent" | "skipped" | "failed";
      reason?: string;
    } = { status: "skipped", reason: "not_first_send" };

    // Persistence is authoritative. Email failures must never fail Send Offer.
    if (result.outcome === "sent" && result.privateUrl) {
      try {
        invitationEmail = await notifyOfferInvitationEmail({
          offerId: result.offerId,
          privateUrl: result.privateUrl,
        });
      } catch (error) {
        console.error(
          "[platform-offer-send] invitation email side-effect failed",
          error instanceof Error ? error.message : "error",
        );
        invitationEmail = { status: "failed", reason: "unexpected_error" };
      }
    }

    const offer = await getPlatformOfferDetail(result.offerId);
    return {
      action: result,
      offer,
      invitationEmail,
      notice: offerInvitationSendNotice({
        outcome: result.outcome,
        emailStatus: invitationEmail.status,
      }),
    };
  });
}
