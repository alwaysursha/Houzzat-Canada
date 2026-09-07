/**
 * Stage 6.11E.4 — host-bound OWNER Team Profile read / update.
 */

import { OwnerActivationError } from "@/lib/platform/activation";
import { platformError, platformOk } from "@/lib/platform/api/response";
import {
  getOwnerTeamProfile,
  updateOwnerTeamProfile,
} from "@/lib/tenancy/team-roster";

export const runtime = "nodejs";

function clientWorkspaceIdFrom(
  value: unknown,
): string | null {
  return typeof value === "string" ? value : null;
}

function mapError(error: unknown) {
  if (error instanceof OwnerActivationError) {
    return platformError(error.status, error.code, error.message);
  }
  return null;
}

/** GET — read Team Profile (ensures row exists). */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const profile = await getOwnerTeamProfile({
      request,
      clientWorkspaceId: clientWorkspaceIdFrom(
        url.searchParams.get("workspaceId"),
      ),
    });
    return platformOk({ profile });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(500, "INTERNAL_ERROR", "Unable to load Team Profile");
  }
}

/** PATCH — update aboutText / serviceAreas only. */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const profile = await updateOwnerTeamProfile({
      request,
      clientWorkspaceId: clientWorkspaceIdFrom(body.workspaceId),
      ...(Object.prototype.hasOwnProperty.call(body, "aboutText")
        ? { aboutText: body.aboutText }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "serviceAreas")
        ? { serviceAreas: body.serviceAreas }
        : {}),
    });
    return platformOk({ profile });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(
      500,
      "INTERNAL_ERROR",
      "Unable to update Team Profile",
    );
  }
}
