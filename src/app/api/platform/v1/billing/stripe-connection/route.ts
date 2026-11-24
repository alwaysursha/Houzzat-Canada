import { PlatformApiError } from "@/lib/platform/api/handler";
import { platformError } from "@/lib/platform/api/response";
import { runPlatformRouteWithOperator } from "@/lib/platform/api/route";
import {
  StripeConnectionDiagnosticGuardError,
  allowStripeConnectionDiagnostic,
  assertStripeConnectionDiagnosticOrigin,
  diagnoseStripeConnection,
} from "@/lib/platform/billing/stripe-connection-diagnostic";
import { clientIpFromPublicRequest } from "@/lib/platform/public/book-demo-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guardResponse(error: StripeConnectionDiagnosticGuardError) {
  const response = platformError(error.status, error.code, error.message);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

/** Temporary MASTER_ADMIN read of the production Stripe account. Remove after verification. */
export async function POST(request: Request) {
  try {
    assertStripeConnectionDiagnosticOrigin(request);
  } catch (error) {
    if (error instanceof StripeConnectionDiagnosticGuardError) {
      return guardResponse(error);
    }
    const response = platformError(403, "ORIGIN_REJECTED", "Forbidden");
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }

  const response = await runPlatformRouteWithOperator(async (operator) => {
    if (
      !allowStripeConnectionDiagnostic({
        operatorId: operator.operatorId,
        clientIp: clientIpFromPublicRequest(request),
      })
    ) {
      throw new PlatformApiError("Too many requests", 429, "RATE_LIMITED");
    }
    return diagnoseStripeConnection();
  });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
