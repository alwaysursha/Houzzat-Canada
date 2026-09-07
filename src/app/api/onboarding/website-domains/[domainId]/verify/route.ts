/**
 * Stage 6.11F.2A — verify CUSTOM PENDING website-domain ownership (TXT).
 * Sets verifiedAt only; status remains PENDING. No Cloudflare / ACTIVE.
 */

import { OwnerActivationError } from "@/lib/platform/activation";
import { platformError, platformOk } from "@/lib/platform/api/response";
import { verifyOwnerWebsiteDomainOwnership } from "@/lib/tenancy/workspace-domain";

export const runtime = "nodejs";

function clientWorkspaceIdFrom(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapError(error: unknown) {
  if (error instanceof OwnerActivationError) {
    return platformError(error.status, error.code, error.message);
  }
  return null;
}

type RouteContext = {
  params: Promise<{ domainId: string }>;
};

/** POST — TXT ownership check; never activates. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { domainId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const result = await verifyOwnerWebsiteDomainOwnership({
      request,
      domainId,
      clientWorkspaceId: clientWorkspaceIdFrom(body.workspaceId),
    });

    return platformOk(result);
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(
      500,
      "INTERNAL_ERROR",
      "Unable to verify website domain ownership",
    );
  }
}
