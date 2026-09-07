/**
 * Stage 6.11F.1 — remove CUSTOM PENDING website domain claim.
 */

import { OwnerActivationError } from "@/lib/platform/activation";
import { platformError, platformOk } from "@/lib/platform/api/response";
import { deleteOwnerPendingWebsiteDomain } from "@/lib/tenancy/workspace-domain";

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

/** DELETE — CUSTOM PENDING only; never PLATFORM or ACTIVE. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { domainId } = await context.params;
    const url = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const result = await deleteOwnerPendingWebsiteDomain({
      request,
      domainId,
      clientWorkspaceId: clientWorkspaceIdFrom(
        body.workspaceId ?? url.searchParams.get("workspaceId"),
      ),
    });
    return platformOk(result);
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(
      500,
      "INTERNAL_ERROR",
      "Unable to remove pending website domain claim",
    );
  }
}
