/**
 * Stage 6.11F.1 — host-bound OWNER website domain list + claim.
 * PENDING CUSTOM only — no activation / Cloudflare / DNS verify.
 */

import { OwnerActivationError } from "@/lib/platform/activation";
import { platformError, platformOk } from "@/lib/platform/api/response";
import {
  claimOwnerWebsiteDomain,
  listOwnerWebsiteDomains,
} from "@/lib/tenancy/workspace-domain";

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

/** GET — list WorkspaceDomain rows for the host-bound OWNER workspace. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await listOwnerWebsiteDomains({
      request,
      clientWorkspaceId: clientWorkspaceIdFrom(
        url.searchParams.get("workspaceId"),
      ),
    });
    return platformOk(result);
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(
      500,
      "INTERNAL_ERROR",
      "Unable to load website domains",
    );
  }
}

/** POST — claim CUSTOM PENDING website domain. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const result = await claimOwnerWebsiteDomain({
      request,
      clientWorkspaceId: clientWorkspaceIdFrom(body.workspaceId),
      hostname: body.hostname,
    });
    return platformOk(result);
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(
      500,
      "INTERNAL_ERROR",
      "Unable to claim website domain",
    );
  }
}
