import {
  runPlatformRouteWithOperator,
} from "@/lib/platform/api/route";
import {
  notifyOfferInvitationEmail,
  offerInvitationResendNotice,
  resendCommercialOfferInvitation,
} from "@/lib/platform/offers";
import { getPlatformOfferDetail } from "@/lib/platform/read/offers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ offerId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { offerId } = await context.params;
  return runPlatformRouteWithOperator(async (operator) => {
    const result = await resendCommercialOfferInvitation({
      offerId,
      operatorId: operator.operatorId,
    });

    let invitationEmail: {
      status: "sent" | "skipped" | "failed";
      reason?: string;
    } = { status: "failed", reason: "not_attempted" };

    // Persistence is authoritative. Email failures must never undo rotation.
    if (result.outcome === "resent" && result.privateUrl) {
      try {
        invitationEmail = await notifyOfferInvitationEmail({
          offerId: result.offerId,
          privateUrl: result.privateUrl,
          commercialOfferTokenId: result.newTokenId,
        });
      } catch (error) {
        console.error(
          "[platform-offer-resend] invitation email side-effect failed",
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
      notice: offerInvitationResendNotice({
        emailStatus: invitationEmail.status,
      }),
    };
  });
}
