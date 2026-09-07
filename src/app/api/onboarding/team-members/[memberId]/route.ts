/**
 * Stage 6.11E.4 — host-bound OWNER single Team Member read / update / delete / visibility.
 */

import { OwnerActivationError } from "@/lib/platform/activation";
import { platformError, platformOk } from "@/lib/platform/api/response";
import {
  getOwnerTeamMember,
  hideOwnerTeamMember,
  removeOwnerTeamMember,
  showOwnerTeamMember,
  updateOwnerTeamMember,
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

type RouteContext = { params: Promise<{ memberId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const url = new URL(request.url);
    const member = await getOwnerTeamMember({
      request,
      memberId,
      clientWorkspaceId: clientWorkspaceIdFrom(
        url.searchParams.get("workspaceId"),
      ),
    });
    return platformOk({ member });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(500, "INTERNAL_ERROR", "Unable to load Team member");
  }
}

/** PATCH — update fields and/or visibility (show/hide). */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const clientWorkspaceId = clientWorkspaceIdFrom(body.workspaceId);

    if (body.isVisible === true) {
      const member = await showOwnerTeamMember({
        request,
        memberId,
        clientWorkspaceId,
      });
      return platformOk({ member });
    }
    if (body.isVisible === false) {
      const member = await hideOwnerTeamMember({
        request,
        memberId,
        clientWorkspaceId,
      });
      return platformOk({ member });
    }

    const member = await updateOwnerTeamMember({
      request,
      memberId,
      clientWorkspaceId,
      body,
    });
    return platformOk({ member });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(
      500,
      "INTERNAL_ERROR",
      "Unable to update Team member",
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const url = new URL(request.url);
    const clientWorkspaceId =
      clientWorkspaceIdFrom(body.workspaceId) ??
      clientWorkspaceIdFrom(url.searchParams.get("workspaceId"));

    const result = await removeOwnerTeamMember({
      request,
      memberId,
      clientWorkspaceId,
    });
    return platformOk(result);
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(
      500,
      "INTERNAL_ERROR",
      "Unable to remove Team member",
    );
  }
}
