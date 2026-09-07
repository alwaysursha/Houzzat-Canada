/**
 * Stage 6.11E.4 — host-bound OWNER Team Members list / create / reorder / leader.
 */

import { OwnerActivationError } from "@/lib/platform/activation";
import { platformError, platformOk } from "@/lib/platform/api/response";
import {
  clearOwnerTeamLeader,
  createOwnerTeamMember,
  listOwnerTeamMembers,
  reorderOwnerTeamMembers,
  setOwnerTeamLeader,
} from "@/lib/tenancy/team-roster";

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

/** GET — list members (+ profile snapshot). */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const data = await listOwnerTeamMembers({
      request,
      clientWorkspaceId: clientWorkspaceIdFrom(
        url.searchParams.get("workspaceId"),
      ),
    });
    return platformOk(data);
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(500, "INTERNAL_ERROR", "Unable to list Team members");
  }
}

/**
 * POST actions:
 * - create (default / action=create)
 * - reorder
 * - set_leader
 * - clear_leader
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const action =
      typeof body.action === "string" ? body.action.trim() : "create";
    const clientWorkspaceId = clientWorkspaceIdFrom(body.workspaceId);

    if (action === "reorder") {
      const data = await reorderOwnerTeamMembers({
        request,
        clientWorkspaceId,
        orderedIds: body.orderedIds,
      });
      return platformOk(data);
    }

    if (action === "set_leader") {
      if (typeof body.memberId !== "string" || !body.memberId.trim()) {
        return platformError(400, "MEMBER_ID_REQUIRED", "memberId required");
      }
      const data = await setOwnerTeamLeader({
        request,
        clientWorkspaceId,
        memberId: body.memberId.trim(),
      });
      return platformOk(data);
    }

    if (action === "clear_leader") {
      const data = await clearOwnerTeamLeader({
        request,
        clientWorkspaceId,
      });
      return platformOk(data);
    }

    if (action === "create" || action === "") {
      const member = await createOwnerTeamMember({
        request,
        clientWorkspaceId,
        body,
      });
      return platformOk({ member });
    }

    return platformError(400, "UNKNOWN_ACTION", "Unknown Team members action");
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(
      500,
      "INTERNAL_ERROR",
      "Unable to update Team members",
    );
  }
}
